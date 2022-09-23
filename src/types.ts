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
