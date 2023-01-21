import { APIEmbed, ChatInputCommandInteraction, MessageContextMenuCommandInteraction } from 'discord.js'

export type RestaurantProps = {
  id: string
  url: string
  name: string
  products: ProductProps[]
}

export type ProductProps = {
  id: string
  name: string
  description?: string
  image?: string
}

export type CommandProps = (
  interaction: ChatInputCommandInteraction | MessageContextMenuCommandInteraction,
) => Promise<{
  content: string
  embed?: APIEmbed
  options?: {
    restaurant: RestaurantProps
    product: ProductProps
  }
} | void>
