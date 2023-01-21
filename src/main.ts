import {
  ApplicationCommandType,
  ChannelType,
  ChatInputCommandInteraction,
  Client,
  ContextMenuCommandBuilder,
  escapeMarkdown,
  Message,
  MessageContextMenuCommandInteraction,
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
import { CommandProps, ProductProps, RestaurantProps } from './types'

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
  new ContextMenuCommandBuilder()
    .setName('report')
    .setType(ApplicationCommandType.Message)
    .setDMPermission(false)
    .toJSON(),
]
rest.put(Routes.applicationCommands(config.DISCORD.CLIENT_ID), { body: commandBuilds })

const client = new Client({
  intents: ['Guilds'],
})

client.on('interactionCreate', async interaction => {
  if (
    !cache.isReady ||
    !interaction.inGuild() ||
    interaction.user.bot ||
    cache.banned[interaction.guildId] ||
    cache.banned[interaction.user.id]
  ) {
    return
  }

  if (!interaction.isChatInputCommand() && !interaction.isMessageContextMenuCommand()) {
    return
  }

  const commandResult =
    interaction.commandName === 'help'
      ? await commandHelp(interaction)
      : interaction.commandName === 'what2eat'
      ? await commandPick(interaction)
      : interaction.commandName === 'report'
      ? await commandReport(interaction)
      : null

  if (!commandResult) {
    return
  }

  const responseMessage = await interaction.reply({
    content: commandResult.content,
    embeds: commandResult.embed ? [commandResult.embed] : undefined,
    fetchReply: true,
  })
  await sendLog({
    interaction,
    command:
      interaction.commandType === ApplicationCommandType.Message
        ? `/${interaction.commandName} ${interaction.targetMessage.id}`
        : `${interaction}`,
    responseMessage,
    options: commandResult.options,
  })
})

// commands

const commandHelp: CommandProps = async interaction => {
  return {
    content: ':stew: What2Eat 吃什麼機器人！\n說明文件：<{MANUAL}>\n開發群組：{DISCORD}'
      .replace('{MANUAL}', 'https://hackmd.io/@eelayntris/what2eat')
      .replace('{DISCORD}', 'https://discord.gg/Ctwz4BB'),
  }
}

const commandPick: CommandProps = async interaction => {
  const guildId = interaction.guildId
  const member = interaction.guild?.members.cache.get(interaction.user.id)
  if (!guildId || !member) {
    return
  }

  if (cache.isCooling[guildId] && interaction.user.id !== config.DISCORD.OWNER_ID) {
    if (interaction.isChatInputCommand()) {
      const cooldownResponse = await interaction.reply({ content: ':ice_cube:', fetchReply: true })
      setTimeout(() => {
        cooldownResponse.delete()
      }, 3000)
    }
    return
  }

  const result = getRandomProduct()
  if (!result) {
    return
  }

  cache.isCooling[guildId] = 1
  setTimeout(() => {
    delete cache.isCooling[guildId]
  }, config.APP.COOLDOWN_TIME)

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
      title: '加入 eeBots Support（公告、更新）',
      url: 'https://discord.gg/Ctwz4BB',
      description: `
:fork_knife_plate: {PRODUCT_NAME}
:round_pushpin: {STORE_NAME}
:receipt: {DESCRIPTION}
-----
:warning: 餐點選項有問題嗎？右鍵 > 應用程式 > report 回報給開發者
:coffee: 請開發者喝一杯咖啡，[捐款贊助](https://p.opay.tw/HJBjG) 感謝有你
`
        .replace('{PRODUCT_NAME}', escapeMarkdown(result.product.name))
        .replace('{STORE_NAME}', escapeMarkdown(result.restaurant.name))
        .replace('{DESCRIPTION}', escapeMarkdown(result.product.description || ''))
        .trim(),
      image: result.product.image ? { url: result.product.image } : undefined,
      footer: { text: 'Version 2022-11-20' },
    },
    options: {
      restaurant: result.restaurant,
      product: result.product,
    },
  }
}

const commandReport: CommandProps = async interaction => {
  if (
    !interaction.isMessageContextMenuCommand() ||
    !interaction.inGuild() ||
    interaction.targetMessage.author.id !== client.user?.id
  ) {
    return
  }

  const data = (await database.ref(`/logs/${interaction.targetMessage.id}`).once('value')).val()
  if (typeof data !== 'string') {
    return
  }
  const [logMessageId, restaurantName, productName] = data.split(';')
  const logMessage = await cache.logChannel?.messages.fetch(logMessageId)
  if (!logMessage) {
    return
  }

  if (logMessage.pinned) {
    return {
      content: ':warning: 此餐點已收到回報',
    }
  }

  await logMessage.pin()
  return {
    content: ':white_check_mark: 成功回報問題餐點：{RESTAURANT_NAME} {PRODUCT_NAME}'
      .replace('{RESTAURANT_NAME}', restaurantName)
      .replace('{PRODUCT_NAME}', productName),
  }
}

const sendLog: (options: {
  interaction: ChatInputCommandInteraction | MessageContextMenuCommandInteraction
  command: string
  responseMessage: Message
  options?: {
    restaurant: RestaurantProps
    product: ProductProps
  }
  error?: Error
}) => Promise<void> = async ({ interaction, command, responseMessage, options, error }) => {
  const logMessage = await cache.logChannel
    ?.send({
      content: '[`{TIME}`] {COMMAND}\n{RESPONSE}'
        .replace('{TIME}', timeFormatter({ time: interaction.createdTimestamp }))
        .replace('{COMMAND}', command)
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
            .replace('{GUILD_ID}', interaction.guildId || '--')
            .replace('{GUILD_NAME}', escapeMarkdown(interaction.guild?.name || '--'))
            .replace('{CHANNEL_ID}', interaction.channelId)
            .replace(
              '{CHANNEL_NAME}',
              escapeMarkdown(
                !interaction.inGuild() || !interaction.channel ? '--' : escapeMarkdown(interaction.channel.name),
              ),
            )
            .replace('{USER_ID}', interaction.user.id)
            .replace('{USER_TAG}', escapeMarkdown(interaction.user.tag))
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
          footer: { text: `${responseMessage.createdTimestamp - interaction.createdTimestamp} ms` },
          timestamp: interaction.createdAt.toISOString(),
        },
      ],
    })
    .catch(() => {})

  if (interaction.commandName === 'what2eat' && logMessage && options) {
    await database
      .ref(`/logs/${responseMessage.id}`)
      .set(`${logMessage.id};${options.restaurant.name};${options.product.name}`)
  }
}

client.on('ready', async client => {
  const logChannel = client.channels.cache.get(config.DISCORD.LOGGER_CHANNEL_ID)
  if (logChannel?.type !== ChannelType.GuildText) {
    console.error('Log Channel Not Found')
    process.exit(-1)
  }
  cache.logChannel = logChannel
  cache.logChannel.send(
    '[`{TIME}`] {USER_TAG}'.replace('{TIME}', timeFormatter()).replace('{USER_TAG}', client.user.tag),
  )

  loadRestaurants()

  setInterval(() => {
    client.user?.setActivity(`/what2eat`)
  }, 60000)
})

client.login(config.DISCORD.TOKEN)
