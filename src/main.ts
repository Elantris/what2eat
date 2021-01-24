import { Client, Message, WebhookClient } from 'discord.js'
import firebase from 'firebase'
import moment from 'moment'
import config from './config'
import foodPandaItems from './items.json'

// firebase
firebase.initializeApp(config.FIREBASE)
const database = firebase.database()

const cache: {
  bannedUsers: {
    [DiscordID: string]: number
  }
  items: {
    [ItemID: string]: {
      names: string
      tags: string
    }
  }
  settings: {
    [GuildId: string]: {
      prefix: string
    }
  }
} = {
  bannedUsers: {},
  items: {},
  settings: {},
}

const updateCache = (snapshot: firebase.database.DataSnapshot) => {
  const key = snapshot.ref.parent?.key as keyof typeof cache | null | undefined
  if (key && snapshot.key) {
    cache[key][snapshot.key] = snapshot.val()
  }
}
const removeCache = (snapshot: firebase.database.DataSnapshot) => {
  const key = snapshot.ref.parent?.key as keyof typeof cache | null | undefined
  if (key && snapshot.key) {
    delete cache[key][snapshot.key]
  }
}

database.ref('/bannedUsers').on('child_added', updateCache)
database.ref('/bannedUsers').on('child_changed', updateCache)
database.ref('/bannedUsers').on('child_removed', removeCache)
database.ref('/items').on('child_added', updateCache)
database.ref('/items').on('child_changed', updateCache)
database.ref('/items').on('child_removed', removeCache)
database.ref('/settings').on('child_added', updateCache)
database.ref('/settings').on('child_changed', updateCache)
database.ref('/settings').on('child_removed', removeCache)

const items: string[] = [...Object.keys(foodPandaItems), ...Object.keys(cache.items)]

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
  if (message.author.bot || !message.guild || !message.member || cache.bannedUsers[message.author.id]) {
    return
  }
  const guildId = message.guild.id

  const prefix = cache.settings[guildId]?.prefix || 'w!,吃什麼'
  if (/<@!{0,1}689455354664321064>/.test(message.content)) {
    message.channel.send(`:page_facing_up: \`${guildId}\` 指令前綴：${prefix}`)
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

  try {
    guildStatus[guildId] = 'processing'
    const result = await handleCommand(message, guildId, args)
    result && message.channel.send(result)
  } catch (error) {
    message.channel.send(':fire: 指令運行錯誤')
    loggerHook.send(`[\`${moment().format('HH:mm:ss')}\`] \`${guildId}\`: ${message.content}\n\`\`\`${error}\`\`\``)
  }

  guildStatus[guildId] = 'cooling-down'

  setTimeout(() => {
    delete guildStatus[guildId]
  }, 3000)
})

const handleCommand: (message: Message, guildId: string, args: string[]) => Promise<string | null> = async (
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
      return `:page_facing_up: \`${guildId}\` 指令前綴：${newPrefix}`
  }

  return null
}

client.on('ready', () => {
  console.log(`Logged in as ${client.user?.tag}`)
})

client.login(config.DISCORD.TOKEN)
