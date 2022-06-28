import {
  Client,
  Message,
  MessageEmbedOptions,
  TextChannel,
  Util,
} from 'discord.js'
import admin, { ServiceAccount } from 'firebase-admin'
import { readdirSync, readFileSync } from 'fs'
import { DateTime } from 'luxon'
import { join } from 'path'
import config from './config'
import { ProductProps, RestaurantProps } from './types'

// firebase
admin.initializeApp({
  credential: admin.credential.cert(
    config.FIREBASE.serviceAccount as ServiceAccount,
  ),
  databaseURL: config.FIREBASE.databaseURL,
})
const database = admin.database()

const timeFormatter: (options?: {
  time?: number | null
  format?: string
}) => string = options =>
  DateTime.fromMillis(options?.time || Date.now()).toFormat(
    options?.format || 'yyyy-MM-dd HH:mm',
  )

const cache: {
  [key: string]: any
  isReady: boolean
  logChannel: TextChannel | null
  banned: {
    [ID in string]?: any
  }
  settings: {
    [GuildID in string]?: {
      triggers?: string
    }
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
  settings: {},
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
database.ref('/settings').on('child_added', updateCache)
database.ref('/settings').on('child_changed', updateCache)
database.ref('/settings').on('child_removed', removeCache)

const loadRestaurants = () => {
  cache.isReady = false
  cache.restaurantIds = []
  cache.restaurants = {}

  readdirSync(join(__dirname, '../data'), {
    encoding: 'utf8',
  }).forEach(filename => {
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
    const restaurantId =
      cache.restaurantIds[
        Math.floor(Math.random() * cache.restaurantIds.length)
      ]
    if (!cache.restaurants[restaurantId]) {
      try {
        cache.restaurants[restaurantId] = JSON.parse(
          readFileSync(join(__dirname, `../data/${restaurantId}.json`), {
            encoding: 'utf8',
          }),
        )
      } catch {
        continue
      }
    }

    const restaurant = cache.restaurants[restaurantId]
    if (!restaurant?.products.length) {
      continue
    }

    const product =
      restaurant.products[
        Math.floor(Math.random() * restaurant.products.length)
      ]

    return {
      restaurant,
      product,
    }
  }

  return null
}

// discord
const client = new Client({
  intents: ['GUILDS', 'GUILD_MESSAGES', 'DIRECT_MESSAGES'],
})

client.on('messageCreate', async message => {
  if (
    !cache.isReady ||
    message.author.bot ||
    cache.banned[message.author.id] ||
    cache.banned[message.guild?.id || '']
  ) {
    return
  }

  const triggers = (
    cache.settings[message.guildId || '']?.triggers || '吃什麼'
  ).split(' ')

  // mentioned or w!help
  if (
    new RegExp(`^<@!{0,1}${client.user?.id}>$`).test(message.content) ||
    /^w!help/i.test(message.content)
  ) {
    await sendResponse(message, {
      content:
        ':stew: What2Eat 吃什麼機器人！\n抽選餐點：TRIGGERS\n說明文件：<MANUAL>\n開發群組：DISCORD'
          .replace('TRIGGERS', triggers.join(' '))
          .replace('MANUAL', 'https://hackmd.io/@eelayntris/what2eat')
          .replace('DISCORD', 'https://discord.gg/Ctwz4BB'),
    })
    return
  }

  // w!triggers: change triggers
  if (message.guildId && /^w!triggers.*/.test(message.content)) {
    const newTriggers = message.content.replace(/\s+/, ' ').split(' ').slice(1)
    if (newTriggers.length === 0) {
      await sendResponse(message, {
        content: ':gear: **抽選餐點**：TRIGGERS'.replace(
          'TRIGGERS',
          triggers.join(' '),
        ),
      })
      return
    }
    if (!message.member?.permissions.has('ADMINISTRATOR')) {
      await sendResponse(message, {
        content: ':lock: 只有管理員才可以修改抽選餐點的關鍵字',
      })
      return
    }

    await database.ref(`/settings/${message.guildId}/triggers`).set(newTriggers)
    await sendResponse(message, {
      content: `:gear: **抽選餐點** 已更改為：${newTriggers}`,
    })
  }

  // reload
  if (
    message.content === 'w!reload' &&
    message.author.id === config.DISCORD.OWNER_ID
  ) {
    loadRestaurants()
    await sendResponse(message, {
      content: ':gear: Reload complete with COUNT restaurants.'.replace(
        'COUNT',
        `${cache.restaurantIds.length}`,
      ),
    })
    return
  }

  // triggers
  if (triggers.some(trigger => message.content === trigger)) {
    if (cache.isCooling[message.author.id]) {
      await message.react('🧊')
      return
    }

    cache.isCooling[message.author.id] = 1
    setTimeout(() => {
      delete cache.isCooling[message.author.id]
    }, 5000)

    const result = getRandomProduct()
    if (!result) {
      await sendResponse(message, { content: ':question: 請稍後再試' })
      delete cache.isCooling[message.author.id]
      return
    }

    await sendResponse(message, {
      content: ':fork_knife_plate: USER_NAME 抽選的餐點：PRODUCT_NAME'
        .replace('USER_NAME', message.member?.displayName || message.author.tag)
        .replace('PRODUCT_NAME', result?.product.name),
      embed: {
        color: 0x51cf66,
        author: {
          iconURL: message.author.displayAvatarURL(),
          name: message.member?.displayName || message.author.tag,
        },
        title: Util.escapeMarkdown(
          `${result.restaurant.name} - ${result.product.name}`,
        ),
        url:
          result.restaurant.type === 'foodPanda'
            ? `https://www.foodpanda.com.tw/restaurant/${result.restaurant.id}`
            : result.restaurant.url || undefined,
        description:
          `:round_pushpin: ADDRESS\n:receipt: DESCRIPTION\n-----\n:warning: 這個選項有問題嗎？拜託 [加入群組](https://discord.gg/Ctwz4BB) 回報給開發者`
            .replace('ADDRESS', Util.escapeMarkdown(result.restaurant.address))
            .replace(
              'DESCRIPTION',
              Util.escapeMarkdown(result.product.description || ''),
            )
            .trim(),
        image:
          result.restaurant.type === 'foodPanda'
            ? {
                url: `https://images.deliveryhero.io/image/fd-tw/Products/${result.product.image}.jpg?width=400`,
              }
            : result.product.image
            ? { url: result.product.image }
            : undefined,
      },
    })
  }
})

const sendResponse = async (
  message: Message,
  response: {
    content: string
    embed?: MessageEmbedOptions
    error?: Error
  },
) => {
  const responseMessage = await message.channel
    .send({
      content: response.content,
      embeds: response.embed ? [response.embed] : undefined,
    })
    .catch(() => null)

  cache.logChannel
    ?.send({
      content: '[`TIME`] MESSAGE_CONTENT\nRESPONSE_CONTENT'
        .replace('TIME', timeFormatter({ time: message.createdTimestamp }))
        .replace('MESSAGE_CONTENT', message.content)
        .replace('RESPONSE_CONTENT', responseMessage?.content || ''),
      embeds: [
        ...(responseMessage?.embeds || []),
        {
          color: response.error ? 0xff6b6b : undefined,
          fields: [
            {
              name: 'Status',
              value: response.error
                ? '```ERROR```'.replace('ERROR', `${response.error}`)
                : 'SUCCESS',
            },
            {
              name: 'Guild',
              value: message.guild
                ? `${message.guild.id}\n${Util.escapeMarkdown(
                    message.guild.name,
                  )}`
                : '--',
              inline: true,
            },
            {
              name: 'Channel',
              value:
                message.channel.type === 'GUILD_TEXT' ||
                message.channel.type === 'GUILD_PUBLIC_THREAD'
                  ? `${message.channel.id}\n${Util.escapeMarkdown(
                      message.channel.name,
                    )}`
                  : `${message.channel.id}`,
              inline: true,
            },
            {
              name: 'User',
              value: `${message.author.id}\n${Util.escapeMarkdown(
                message.author.tag,
              )}`,
              inline: true,
            },
          ],
          footer: responseMessage
            ? {
                text: `${
                  responseMessage.createdTimestamp - message.createdTimestamp
                } ms`,
              }
            : undefined,
        },
      ],
    })
    .catch(() => {})
}

client.on('ready', () => {
  cache.logChannel = client.channels.cache.get(
    config.DISCORD.LOGGER_CHANNEL_ID,
  ) as TextChannel
  if (cache.logChannel.type !== 'GUILD_TEXT') {
    console.error('Log Channel Not Found')
    process.exit(-1)
  }

  loadRestaurants()

  cache.logChannel.send(
    '`TIME` USER_TAG'
      .replace('TIME', timeFormatter())
      .replace('USER_TAG', client.user?.tag || ''),
  )

  setInterval(() => {
    client.user?.setActivity(`with ${cache.restaurantIds.length} restaurants.`)
  }, 60000)
})

client.login(config.DISCORD.TOKEN)
