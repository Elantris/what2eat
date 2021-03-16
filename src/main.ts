import { Client, Message, WebhookClient } from 'discord.js'
import admin, { ServiceAccount } from 'firebase-admin'
import moment from 'moment'
import config from './config'
import foodPandaItems from './items.json'

// firebase
admin.initializeApp({
  credential: admin.credential.cert(config.FIREBASE.serviceAccount as ServiceAccount),
  databaseURL: config.FIREBASE.databaseURL,
})
const database = admin.database()

type CacheProps = {
  [key: string]: any
  items: {
    [ItemName: string]: {
      authorId: string
      createdAt: number
    }
  }
  settings: {
    [GuildID: string]: {
      prefix?: string
      triggers?: string
    }
  }
}
const cache: CacheProps = {
  items: {},
  settings: {},
}

let items: string[] = Object.keys(foodPandaItems)

const updateCache = (snapshot: admin.database.DataSnapshot) => {
  const key = snapshot.ref.parent?.key
  if (key && cache[key] && snapshot.key) {
    cache[key][snapshot.key] = snapshot.val()
    items = [...Object.keys(foodPandaItems), ...Object.keys(cache.items)]
  }
}
const removeCache = (snapshot: admin.database.DataSnapshot) => {
  const key = snapshot.ref.parent?.key
  if (key && cache[key] && snapshot.key) {
    delete cache[key][snapshot.key]
    items = [...Object.keys(foodPandaItems), ...Object.keys(cache.items)]
  }
}

database.ref('/items').on('child_added', updateCache)
database.ref('/items').on('child_changed', updateCache)
database.ref('/items').on('child_removed', removeCache)
database.ref('/settings').on('child_added', updateCache)
database.ref('/settings').on('child_changed', updateCache)
database.ref('/settings').on('child_removed', removeCache)

const getRandomItem: () => {
  index: number
  name: string
} = () => {
  const index = Math.floor(Math.random() * items.length)
  return {
    index,
    name: items[index],
  }
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
      ':stew: What2Eat 吃什麼機器人！\n指令前綴：PREFIX\n說明文件：<MANUAL>\n開發群組：DISCORD'
        .replace('PREFIX', prefix)
        .replace('MANUAL', 'https://hackmd.io/@eelayntris/what2eat')
        .replace('DISCORD', 'https://discord.gg/Ctwz4BB'),
    )
    return
  }

  const args = message.content.replace(/\s+/g, ' ').split(' ')
  const messageType = message.content.startsWith(prefix)
    ? 'command'
    : triggers.some(trigger => args[0] === trigger)
    ? 'item'
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
    if (messageType === 'item') {
      const tmp = parseInt(args[1])
      const amount = Number.isSafeInteger(tmp) && tmp > 0 ? Math.min(5, tmp) : 1
      const items = new Array(amount).fill(0).map(_ => getRandomItem().name)
      await sendResponse(message, `:fork_knife_plate: ${message.member.displayName}：${items.join('、')}`)
    } else {
      const responseContent = await handleCommand(message, guildId, args)
      if (responseContent) {
        await sendResponse(message, responseContent)
      }
    }
  } catch (error) {
    sendResponse(message, ':fire: 指令運行錯誤')
    loggerHook
      .send(
        '[`TIME`] `GUILD_ID`: CONTENT\n```ERROR```'
          .replace('TIME', moment(message.createdTimestamp).format('HH:mm:ss'))
          .replace('GUILD_ID', guildId)
          .replace('CONTENT', message.content)
          .replace('ERROR', error),
      )
      .catch()
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

    case 'add':
      const newItems = args.slice(1).filter(arg => !items.includes(arg))
      if (newItems.length === 0) {
        return ':x: 這些品項已經有了'
      }

      const updates: CacheProps['items'] = {}
      newItems.forEach(newItem => {
        updates[newItem] = {
          authorId: message.author.id,
          createdAt: message.createdTimestamp,
        }
      })
      await database.ref(`/items`).update(updates)

      return ':white_check_mark: MEMBER_NAME 成功新增 COUNT 個品項：ITEMS'
        .replace('MEMBER_NAME', message.member?.displayName || '')
        .replace('COUNT', `${newItems.length}`)
        .replace('ITEMS', newItems.join('、'))
  }

  return ''
}

const sendResponse = async (message: Message, responseContent: string) => {
  const responseMessage = await message.channel.send(responseContent).catch()
  loggerHook
    .send(
      '[`TIME`] `GUILD_ID`: MESSAGE_CONTENT\n(**PROCESSING_TIME**ms) RESPONSE_CONTENT'
        .replace('TIME', moment(message.createdTimestamp).format('HH:mm:ss'))
        .replace('GUILD_ID', message.guild?.id || '')
        .replace('MESSAGE_CONTENT', message.content)
        .replace('PROCESSING_TIME', `${responseMessage.createdTimestamp - message.createdTimestamp}`)
        .replace('RESPONSE_CONTENT', responseContent),
    )
    .catch()
}

client.on('ready', () => {
  client.user?.setActivity('Version 2021.03.16 | https://discord.gg/Ctwz4BB')
  loggerHook.send(
    '[`TIME`] USER_TAG'
      .replace('TIME', moment().format('HH:mm:ss'))
      .replace('USER_TAG', client.user?.tag || ''),
  )
})

client.login(config.DISCORD.TOKEN)
