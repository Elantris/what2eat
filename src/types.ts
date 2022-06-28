export type RestaurantProps = {
  id: string
  url?: string
  name: string
  address: string
  products: ProductProps[]
  type: 'foodPanda' | 'uberEats'
}

export type ProductProps = {
  id: string
  name: string
  description?: string
  image?: string
}
