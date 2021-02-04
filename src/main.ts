import { Client, Message, WebhookClient } from 'discord.js'
import firebase from 'firebase'
import moment from 'moment'
import config from './config'
import foodPandaItems from './items.json'

// firebase
firebase.initializeApp(config.FIREBASE)
const database = firebase.database()

type CacheProps = {
  items: {
    [ItemName: string]: {
      authorId: string
      createdAt: number
    }
  }
  settings: {
    [GuildID: string]: {
      prefix: string
    }
  }
}
const cache: CacheProps = {
  items: {},
  settings: {},
}

let items: string[] = Object.keys(foodPandaItems)

const updateCache = (snapshot: firebase.database.DataSnapshot) => {
  const key = snapshot.ref.parent?.key as keyof typeof cache | null | undefined
  if (key && snapshot.key) {
    cache[key][snapshot.key] = snapshot.val()
    items = [...Object.keys(foodPandaItems), ...Object.keys(cache.items)]
  }
}
const removeCache = (snapshot: firebase.database.DataSnapshot) => {
  const key = snapshot.ref.parent?.key as keyof typeof cache | null | undefined
  if (key && snapshot.key) {
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

const guildStatus: { [GuildID: string]: 'processing' | 'cooling-down' | 'muted' } = {}

client.on('message', async message => {
  if (message.author.bot || !message.guild || !message.member) {
    return
  }

  // detect prefix triggers and parse arguments from message content
  const guildId = message.guild.id
  const prefix = cache.settings[guildId]?.prefix || 'w!,吃什麼'
  if (/<@!{0,1}689455354664321064>/.test(message.content)) {
    message.channel.send(`:page_facing_up: 目前機器人指令觸發前綴：${prefix}`)
    return
  }
  const args = message.content.replace(/\s+/g, ' ').split(' ')
  if (!prefix.split(',').includes(args[0])) {
    return
  }

  if (guildStatus[guildId]) {
    if (guildStatus[guildId] === 'processing') {
      message.channel.send(':star2: MEMBER_NAME 指令處理中'.replace('MEMBER_NAME', message.member.displayName))
      guildStatus[guildId] = 'muted'
    } else if (guildStatus[guildId] === 'cooling-down') {
      message.channel.send(':ice_cube: MEMBER_NAME 指令冷卻中'.replace('MEMBER_NAME', message.member.displayName))
      guildStatus[guildId] = 'muted'
    }
    return
  }

  // handle command
  try {
    guildStatus[guildId] = 'processing'
    const responseContent = await handleCommand(message, guildId, args)
    responseContent && (await sendResponse(message, responseContent))
  } catch (error) {
    message.channel.send(':fire: 指令運行錯誤')
    loggerHook.send(
      '[`TIME`] `GUILD_ID`: CONTENT\n```ERROR```'
        .replace('TIME', moment(message.createdTimestamp).format('HH:mm:ss'))
        .replace('GUILD_ID', guildId)
        .replace('CONTENT', message.content)
        .replace('ERROR', error),
    )
  }

  guildStatus[guildId] = 'cooling-down'
  setTimeout(() => {
    delete guildStatus[guildId]
  }, 1000)
})

const handleCommand: (message: Message, guildId: string, args: string[]) => Promise<string> = async (
  message,
  guildId,
  args,
) => {
  if (args.length === 1) {
    const item = getRandomItem()
    return `:fork_knife_plate: ${message.member?.displayName}：${item.name}`
  }

  switch (args[1]) {
    case 'prefix':
      const newPrefix = args.slice(2).join(',')
      database.ref(`/settings/${guildId}/prefix`).set(newPrefix)
      return `:page_facing_up: 指令觸發前綴改為：${newPrefix}`

    case 'add':
      const newItems = args.slice(2).filter(arg => !items.includes(arg))
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

      return ':white_check_mark: 成功新增 COUNT 個品項：ITEMS'
        .replace('COUNT', `${newItems.length}`)
        .replace('ITEMS', newItems.join('、'))
  }

  return ''
}

const sendResponse = async (message: Message, responseContent: string) => {
  const responseMessage = await message.channel.send(responseContent)
  loggerHook.send(
    '[`TIME`] `GUILD_ID`: MESSAGE_CONTENT\n(**PROCESSING_TIME**ms) RESPONSE_CONTENT'
      .replace('TIME', moment(message.createdTimestamp).format('HH:mm:ss'))
      .replace('GUILD_ID', message.guild?.id || '')
      .replace('MESSAGE_CONTENT', message.content)
      .replace('PROCESSING_TIME', `${responseMessage.createdTimestamp - message.createdTimestamp}`)
      .replace('RESPONSE_CONTENT', responseContent),
  )
}

client.on('ready', () => {
  loggerHook.send(
    '[`TIME`] USER_TAG is alive!'
      .replace('TIME', moment().format('HH:mm:ss'))
      .replace('USER_TAG', client.user?.tag || ''),
  )
})

client.login(config.DISCORD.TOKEN)
