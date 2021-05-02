export type RestaurantProps = {
  id: string
  name: string
  address: string
  url: string
  products: ProductProps[]
  type: 'foodPanda' | 'uberEats'
}

export type ProductProps = {
  id: string
  name: string
  description?: string
  imageUrl?: string
}
