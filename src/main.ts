import { Client, Message, MessageEmbedOptions, NewsChannel, TextChannel, Util, WebhookClient } from 'discord.js'
import admin, { ServiceAccount } from 'firebase-admin'
import { readFileSync } from 'fs'
import moment from 'moment'
import { join } from 'path'
import config from './config'
import restaurantCodes from './restaurantCodes.json'

// firebase
admin.initializeApp({
  credential: admin.credential.cert(config.FIREBASE.serviceAccount as ServiceAccount),
  databaseURL: config.FIREBASE.databaseURL,
})
const database = admin.database()

const cache: {
  [key: string]: any
  hints: {
    [key: string]: string
  }
  settings: {
    [GuildID in string]?: {
      prefix?: string
      triggers?: string
    }
  }
  restaurants: {
    [Code in string]?: {
      id: number
      code: string
      name: string
      address: string
      products: {
        id: number
        name: string
        description: string
      }[]
    }
  }
} = {
  hints: {},
  settings: {},
  restaurants: {},
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

database.ref('/hits').on('child_added', updateCache)
database.ref('/hits').on('child_changed', updateCache)
database.ref('/hits').on('child_removed', removeCache)
database.ref('/settings').on('child_added', updateCache)
database.ref('/settings').on('child_changed', updateCache)
database.ref('/settings').on('child_removed', removeCache)

const getHint = () => {
  const allHints = Object.values(cache.hints)
  const hint = allHints[Math.floor(Math.random() * allHints.length)] || ''
  return hint
}

const getRandomProduct: () => {
  id: number
  name: string
  description: string
  restaurantCode: string
} | null = () => {
  for (let i = 0; i < 10; i++) {
    const restaurantCode = restaurantCodes[Math.floor(Math.random() * restaurantCodes.length)]

    if (!cache.restaurants[restaurantCode]) {
      try {
        cache.restaurants[restaurantCode] = JSON.parse(
          readFileSync(join(__dirname, `./restaurants/${restaurantCode}.json`), { encoding: 'utf8' }),
        )
      } catch {
        continue
      }
    }

    const restaurant = cache.restaurants[restaurantCode]

    if (!restaurant?.products.length) {
      continue
    }

    const product = restaurant.products[Math.floor(Math.random() * restaurant.products.length)]
    return {
      ...product,
      restaurantCode,
    }
  }

  return null
}

// discord
const client = new Client()
const loggerHook = new WebhookClient(...(config.DISCORD.LOGGER_HOOK as [string, string]))
const userStatus: { [UserID: string]: 'processing' | 'cooling-down' | 'muted' } = {}

client.on('message', async message => {
  if (message.author.bot || !message.guild || !message.member) {
    return
  }

  // detect prefix triggers and parse arguments from message content
  const guildId = message.guild.id
  const prefix = cache.settings[guildId]?.prefix || 'w!'
  const triggers = (cache.settings[guildId]?.triggers || '吃什麼').split(' ')
  if (new RegExp(`<@!{0,1}${client.user?.id}>`).test(message.content)) {
    message.channel.send(
      ':stew: What2Eat 吃什麼機器人！\n指令前綴：PREFIX\n抽選餐點：TRIGGERS\n說明文件：<MANUAL>\n開發群組：DISCORD'
        .replace('PREFIX', prefix)
        .replace('TRIGGERS', triggers.join(' '))
        .replace('MANUAL', 'https://hackmd.io/@eelayntris/what2eat')
        .replace('DISCORD', 'https://discord.gg/Ctwz4BB'),
    )
    return
  }

  const args = message.content.replace(/\s+/g, ' ').split(' ')
  const messageType = message.content.startsWith(prefix)
    ? 'command'
    : triggers.some(trigger => args[0] === trigger)
    ? 'trigger'
    : null
  if (!messageType) {
    return
  }

  if (userStatus[message.author.id]) {
    if (userStatus[message.author.id] === 'processing') {
      message.channel.send(':star2: MEMBER_NAME 指令處理中'.replace('MEMBER_NAME', message.member.displayName))
      userStatus[message.author.id] = 'muted'
    } else if (userStatus[message.author.id] === 'cooling-down') {
      message.channel.send(':ice_cube: MEMBER_NAME 指令冷卻中'.replace('MEMBER_NAME', message.member.displayName))
      userStatus[message.author.id] = 'muted'
    }
    return
  }

  // handle command
  try {
    userStatus[message.author.id] = 'processing'
    if (messageType === 'trigger') {
      const result = getRandomProduct()
      if (result) {
        await sendResponse(message, {
          content: `:fork_knife_plate: ${message.member.displayName} 抽選的餐點：`,
          embed: {
            color: 0x51cf66,
            title: result.name,
            url: `https://www.foodpanda.com.tw/restaurant/${result.restaurantCode}`,
            description: `${Util.escapeMarkdown(
              result.description,
            )}\n---\n:warning: 這個選項有問題嗎？請 [加入群組](https://discord.gg/Ctwz4BB) 回報給開發者`.trim(),
            author: {
              name: `${cache.restaurants[result.restaurantCode]?.name || ''} ${
                cache.restaurants[result.restaurantCode]?.address || ''
              }`,
            },
            footer: { text: `💡 ${getHint()}` },
            image: { url: `https://images.deliveryhero.io/image/fd-tw/Products/${result.id}.jpg?width=400` },
          },
        })
      } else {
        await sendResponse(message, { content: ':question: 請稍後再試' })
      }
    } else {
      const content = await handleCommand(message, guildId, args)
      if (content) {
        await sendResponse(message, { content })
      }
    }
  } catch (error) {
    sendResponse(message, {
      content: ':fire: 指令運行錯誤',
      error,
    })
  }

  userStatus[message.author.id] = 'cooling-down'
  setTimeout(() => {
    delete userStatus[message.author.id]
  }, 1000)
})

const handleCommand: (message: Message, guildId: string, args: string[]) => Promise<string> = async (
  message,
  guildId,
  args,
) => {
  const prefix = cache.settings[guildId]?.prefix || 'w!'
  const triggers = (cache.settings[guildId]?.triggers || '吃什麼').split(' ')
  const command = args[0].replace(prefix, '')
  const isAdmin = !!message.member?.hasPermission('ADMINISTRATOR')

  switch (command) {
    case 'help':
      return ':stew: What2Eat 吃什麼機器人！\n說明文件：<MANUAL>\n開發群組：DISCORD'
        .replace('MANUAL', 'https://hackmd.io/@eelayntris/what2eat')
        .replace('DISCORD', 'https://discord.gg/Ctwz4BB')

    case 'prefix':
      const newPrefix = args[1]
      if (!newPrefix) {
        return `:gear: 指令前綴：\`${prefix}\``
      }
      if (!isAdmin) {
        return ':no_entry_sign: 只有管理員才可以修改指令前綴'
      }
      await database.ref(`/settings/${guildId}/prefix`).set(newPrefix)
      return `:gear: 指令前綴改為：${newPrefix}`

    case 'trigger':
    case 'triggers':
      const newTriggers = args.slice(1).join(' ')
      if (!args[2]) {
        return `:gear: 抽選餐點：${triggers.join(' ')}`
      }
      if (!isAdmin) {
        return ':no_entry_sign: 只有管理員才可以修改抽選餐點'
      }
      await database.ref(`/settings/${guildId}/triggers`).set(newTriggers)
      return `:gear: 抽選餐點改為：${newTriggers}`
  }

  return ''
}

const sendResponse = async (
  message: Message,
  response: {
    content: string
    embed?: MessageEmbedOptions
    error?: Error
  },
) => {
  const responseMessage = await message.channel.send(response.content, { embed: response.embed }).catch(() => null)
  loggerHook
    .send(
      '[`TIME`] `GUILD_ID`: MESSAGE_CONTENT\nRESPONSE_CONTENT'
        .replace('TIME', moment(message.createdTimestamp).format('HH:mm:ss'))
        .replace('GUILD_ID', message.guild?.id || '')
        .replace('MESSAGE_CONTENT', message.content)
        .replace('RESPONSE_CONTENT', responseMessage?.content || ''),
      {
        embeds: [
          ...(responseMessage?.embeds || []),
          {
            color: response.error ? 0xff6b6b : undefined,
            fields: [
              {
                name: 'Status',
                value: response.error ? '```ERROR```'.replace('ERROR', `${response.error}`) : 'SUCCESS',
              },
              {
                name: 'Guild',
                value: message.guild ? `${message.guild.id}\n${Util.escapeMarkdown(message.guild.name)}` : '--',
                inline: true,
              },
              {
                name: 'Channel',
                value:
                  message.channel instanceof TextChannel || message.channel instanceof NewsChannel
                    ? `${message.channel.id}\n${Util.escapeMarkdown(message.channel.name)}`
                    : '--',
                inline: true,
              },
              {
                name: 'User',
                value: `${message.author.id}\n${Util.escapeMarkdown(message.author.tag)}`,
                inline: true,
              },
            ],
            footer: responseMessage
              ? { text: `${responseMessage.createdTimestamp - message.createdTimestamp} ms` }
              : undefined,
          },
        ],
      },
    )
    .catch(() => {})
}

client.on('ready', () => {
  client.user?.setActivity('Version 2021.05.01 | https://discord.gg/Ctwz4BB')
  loggerHook.send(
    '[`TIME`] USER_TAG'.replace('TIME', moment().format('HH:mm:ss')).replace('USER_TAG', client.user?.tag || ''),
  )
})

client.login(config.DISCORD.TOKEN)
