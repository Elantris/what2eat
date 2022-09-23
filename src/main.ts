import {
  APIEmbed,
  ChannelType,
  ChatInputCommandInteraction,
  Client,
  escapeMarkdown,
  Message,
  REST,
  Routes,
  SlashCommandBuilder,
  TextChannel,
} from 'discord.js'
import admin, { ServiceAccount } from 'firebase-admin'
import { readdirSync, readFileSync } from 'fs'
import { DateTime } from 'luxon'
import { join } from 'path'
import config from './config'
import { ProductProps, RestaurantProps } from './types'

// firebase
admin.initializeApp({
  credential: admin.credential.cert(config.FIREBASE.serviceAccount as ServiceAccount),
  databaseURL: config.FIREBASE.databaseURL,
})
const database = admin.database()

const timeFormatter: (options?: { time?: number | null; format?: string }) => string = options =>
  DateTime.fromMillis(options?.time || Date.now()).toFormat(options?.format || 'yyyy-MM-dd HH:mm:ss')

const cache: {
  [key: string]: any
  isReady: boolean
  logChannel: TextChannel | null
  banned: {
    [ID in string]?: any
  }
  restaurantIds: string[]
  restaurants: {
    [RestaurantID in string]?: RestaurantProps
  }
  isCooling: { [ID: string]: number }
} = {
  isReady: false,
  logChannel: null,
  banned: {},
  restaurantIds: [],
  restaurants: {},
  isCooling: {},
}
const updateCache = (snapshot: admin.database.DataSnapshot) => {
  const key = snapshot.ref.parent?.key
  if (key && cache[key] && snapshot.key) {
    cache[key][snapshot.key] = snapshot.val()
  }
}
const removeCache = (snapshot: admin.database.DataSnapshot) => {
  const key = snapshot.ref.parent?.key
  if (key && cache[key] && snapshot.key) {
    delete cache[key][snapshot.key]
  }
}
database.ref('/banned').on('child_added', updateCache)
database.ref('/banned').on('child_changed', updateCache)
database.ref('/banned').on('child_removed', removeCache)

// restaurant products
const loadRestaurants = () => {
  cache.isReady = false
  cache.restaurantIds = []
  cache.restaurants = {}

  readdirSync(join(__dirname, '../data'), { encoding: 'utf8' }).forEach(filename => {
    if (filename.endsWith('.json')) {
      cache.restaurantIds.push(filename.replace('.json', ''))
    }
  })

  cache.isReady = true
}

const getRandomProduct: () => {
  restaurant: RestaurantProps
  product: ProductProps
} | null = () => {
  for (let i = 0; i < 5; i++) {
    const restaurantId = cache.restaurantIds[Math.floor(Math.random() * cache.restaurantIds.length)]
    if (!cache.restaurants[restaurantId]) {
      try {
        cache.restaurants[restaurantId] = JSON.parse(
          readFileSync(join(__dirname, `../data/${restaurantId}.json`), { encoding: 'utf8' }),
        )
      } catch {
        continue
      }
    }

    const restaurant = cache.restaurants[restaurantId]
    if (!restaurant?.products.length) {
      continue
    }

    const product = restaurant.products[Math.floor(Math.random() * restaurant.products.length)]

    return {
      restaurant,
      product,
    }
  }

  return null
}

// discord
const rest = new REST({ version: '10' }).setToken(config.DISCORD.TOKEN)
const commandBuilds = [
  new SlashCommandBuilder().setName('what2eat').setDescription('隨機抽選餐點').setDMPermission(false).toJSON(),
  new SlashCommandBuilder().setName('help').setDescription('查看說明文件與客服群組').setDMPermission(false).toJSON(),
]
rest.put(Routes.applicationCommands(config.DISCORD.CLIENT_ID), { body: commandBuilds })

const client = new Client({
  intents: ['Guilds'],
})

client.on('interactionCreate', async interaction => {
  if (
    !cache.isReady ||
    !interaction.isChatInputCommand() ||
    !interaction.guildId ||
    interaction.user.bot ||
    cache.banned[interaction.guildId] ||
    cache.banned[interaction.user.id]
  ) {
    return
  }

  const commandResult =
    interaction.commandName === 'help'
      ? await commandHelp(interaction)
      : interaction.commandName === 'what2eat'
      ? await commandPick(interaction)
      : null
  if (!commandResult) {
    return
  }

  const responseMessage = await interaction.reply({
    content: commandResult.content,
    embeds: commandResult.embed ? [commandResult.embed] : undefined,
    fetchReply: true,
  })
  await sendLog({ command: interaction, responseMessage, options: commandResult.options })
})

// commands
type CommandProps = (command: ChatInputCommandInteraction) => Promise<{
  content: string
  embed?: APIEmbed
  options?: {
    restaurant: RestaurantProps
  }
} | void>

const commandHelp: CommandProps = async command => {
  return {
    content: ':stew: What2Eat 吃什麼機器人！\n說明文件：<{MANUAL}>\n開發群組：{DISCORD}'
      .replace('{MANUAL}', 'https://hackmd.io/@eelayntris/what2eat')
      .replace('{DISCORD}', 'https://discord.gg/Ctwz4BB'),
  }
}

const commandPick: CommandProps = async command => {
  const guildId = command.guildId
  if (!guildId || cache.isCooling[guildId]) {
    const cooldownResponse = await command.reply({ content: ':ice_cube:', fetchReply: true })
    setTimeout(() => {
      cooldownResponse.delete()
    }, 3000)
    return
  }

  const member = command.guild?.members.cache.get(command.user.id)
  if (!member) {
    return
  }

  const result = getRandomProduct()
  if (!result) {
    return
  }

  cache.isCooling[guildId] = 1
  setTimeout(() => {
    delete cache.isCooling[guildId]
  }, config.DISCORD.COOLDOWN_TIME)

  return {
    content: ':fork_knife_plate: {MEMBER_NAME} 抽選的餐點：{PRODUCT_NAME}'
      .replace('{MEMBER_NAME}', escapeMarkdown(member.displayName))
      .replace('{PRODUCT_NAME}', result.product.name),
    embed: {
      color: 0x51cf66,
      author: {
        icon_url: member.displayAvatarURL(),
        name: member.displayName,
      },
      description: `
:fork_knife_plate: {PRODUCT_NAME}
:round_pushpin: {STORE_NAME}
:receipt: {DESCRIPTION}
-----
:warning: 餐點選項有問題嗎？拜託加入 [客服群組](https://discord.gg/Ctwz4BB) 回報給開發者
:coffee: 請 eeBots 開發者喝一杯咖啡，[捐款贊助](https://p.opay.tw/HJBjG) 感謝有你
`
        .replace('{PRODUCT_NAME}', escapeMarkdown(result.product.name))
        .replace('{STORE_NAME}', escapeMarkdown(result.restaurant.name))
        .replace('{DESCRIPTION}', escapeMarkdown(result.product.description || ''))
        .trim(),
      image: result.product.image ? { url: result.product.image } : undefined,
    },
    options: {
      restaurant: result.restaurant,
    },
  }
}

const sendLog: (options: {
  command: ChatInputCommandInteraction
  responseMessage: Message
  options?: {
    // restaurantId?: string
    restaurant?: RestaurantProps
  }
  error?: Error
}) => Promise<void> = async ({ command, responseMessage, options, error }) => {
  await cache.logChannel
    ?.send({
      content: '[`{TIME}`] {COMMAND}\n{RESPONSE}'
        .replace('{TIME}', timeFormatter({ time: command.createdTimestamp }))
        .replace('{COMMAND}', `${command}`)
        .replace('{RESPONSE}', responseMessage.content),
      embeds: [
        ...(responseMessage.embeds || []),
        {
          color: error ? 0xff6b6b : undefined,
          description: `
\`{GUILD_ID}\` {GUILD_NAME}
\`{CHANNEL_ID}\` {CHANNEL_NAME}
\`{USER_ID}\` {USER_TAG}
{CACHED_COUNT}/{RESTAURANT_COUNT} {LINK}
`
            .replace('{GUILD_ID}', command.guild?.id || '--')
            .replace('{GUILD_NAME}', escapeMarkdown(command.guild?.name || '--'))
            .replace('{CHANNEL_ID}', command.channelId)
            .replace(
              '{CHANNEL_NAME}',
              escapeMarkdown(
                !command.channel || command.channel.type === ChannelType.DM
                  ? '--'
                  : escapeMarkdown(command.channel.name),
              ),
            )
            .replace('{USER_ID}', command.user.id)
            .replace('{USER_TAG}', escapeMarkdown(command.user.tag))
            .replace('{RESTAURANT_ID}', options?.restaurant?.id || '--')
            .replace('{CACHED_COUNT}', `${Object.keys(cache.restaurants).length}`)
            .replace('{RESTAURANT_COUNT}', `${cache.restaurantIds.length}`)
            .replace('{LINK}', options?.restaurant ? `[Link](${options.restaurant.url})` : '')
            .trim(),
          fields: error
            ? [
                {
                  name: 'Error',
                  value: '```ERROR```'.replace('ERROR', `${error}`),
                },
              ]
            : undefined,
          footer: { text: `${responseMessage.createdTimestamp - command.createdTimestamp} ms` },
          timestamp: command.createdAt.toISOString(),
        },
      ],
    })
    .catch(() => {})
}

client.on('ready', async () => {
  const logChannel = client.channels.cache.get(config.DISCORD.LOGGER_CHANNEL_ID) as TextChannel
  if (logChannel.type !== ChannelType.GuildText) {
    console.error('Log Channel Not Found')
    process.exit(-1)
  }
  cache.logChannel = logChannel
  cache.logChannel.send(
    '`{TIME}` {USER_TAG}'.replace('{TIME}', timeFormatter()).replace('{USER_TAG}', client.user?.tag || ''),
  )

  loadRestaurants()

  setInterval(() => {
    client.user?.setActivity(`/what2eat`)
  }, 60000)
})

client.login(config.DISCORD.TOKEN)
