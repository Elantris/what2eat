import { readdirSync, writeFileSync } from 'fs'
import fetch from 'node-fetch'
import { join } from 'path'
import { RestaurantProps } from '../src/types'
import filterProductName from './filterProductName'
import restaurantIds from '../data/uberEats-restaurantIds.json'

const existedRestaurantIds = readdirSync(join(__dirname, '../data/restaurants'), { encoding: 'utf8' })
  .filter(filename => filename.includes('json'))
  .map(filename => filename.replace('.json', ''))

const fetchUberEatsProducts = async () => {
  const cities: string[] = []
  const response = await fetch('https://www.ubereats.com/api/getCountriesWithCitiesV1?localeCode=tw', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': 'x',
    },
  })
  const body = await response.json()
  body.data.regionCityLinks.links.forEach((link: any) => {
    link.links.forEach((link: any) => {
      cities.push(link.href.split('/city/')[1])
    })
  })

  console.log(cities)

  const restaurantIds: string[] = []
  for (const city of cities) {
    try {
      const response = await fetch(`https://www.ubereats.com/api/getSeoFeedV1?localeCode=tw`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': 'x',
        },
        body: JSON.stringify({ pathname: `/tw/city/${city}` }),
      })
      const body = await response.json()
      body.data.elements.forEach((element: any) => {
        if (!element.storesMap) {
          return
        }
        for (const restaurantId in element.storesMap) {
          restaurantIds.push(restaurantId)
        }
      })

      console.log(city, restaurantIds.length)
    } catch {
      console.log(`${city} is not available`)
    }
  }

  writeFileSync(join(__dirname, '../data/uberEats-restaurantIds.json'), JSON.stringify(restaurantIds), {
    encoding: 'utf8',
  })

  for (const restaurantId of restaurantIds) {
    if (existedRestaurantIds.includes(restaurantId)) {
      continue
    }

    try {
      const response = await fetch(`https://www.ubereats.com/api/getStoreV1?localeCode=tw`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': 'x',
        },
        body: JSON.stringify({ storeUuid: restaurantId }),
      })
      const body = await response.json()
      const meta = JSON.parse(decodeURIComponent(body.data.metaJson))

      if (
        [
          '家樂福',
          '屈臣氏',
          '大潤發',
          '美廉社',
          '全聯',
          '棉花田生機園地',
          '藥局',
          '超市',
          '百貨',
          '小三美日',
        ].some(key => body.data.title.includes(key))
      ) {
        continue
      }

      const restaurant: RestaurantProps = {
        id: restaurantId,
        name: body.data.title,
        address: body.data.location.address,
        url: meta['@id'],
        products: [],
        type: 'uberEats',
      }

      for (const s in body.data.sectionEntitiesMap) {
        for (const productId in body.data.sectionEntitiesMap[s]) {
          const product = body.data.sectionEntitiesMap[s][productId]
          const name = filterProductName(product.title)
          if (!name) {
            continue
          }
          restaurant.products.push({
            id: productId,
            name,
            description: product.description || undefined,
            imageUrl: product.imageUrl || undefined,
          })
        }
      }

      if (restaurant.products.length) {
        writeFileSync(join(__dirname, `../data/restaurants/${restaurantId}.json`), JSON.stringify(restaurant), {
          encoding: 'utf8',
        })
      }

      console.log(restaurantId, restaurant.products.length)
    } catch {
      console.log(`${restaurantId} is not available`)
    }
  }
}

fetchUberEatsProducts()
