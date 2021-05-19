import { readdirSync, readFileSync, writeFileSync } from 'fs'
import fetch from 'node-fetch'
import { join } from 'path'
import { RestaurantProps } from '../src/types'
import filterProductName from './filterProductName'

const getCities: () => Promise<string[]> = async () => {
  try {
    const cities = JSON.parse(readFileSync(join(__dirname, '../data/uberEats-cities.json'), { encoding: 'utf8' }))
    return cities
  } catch {
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
    writeFileSync(join(__dirname, '../data/uberEats-cities.json'), JSON.stringify(cities), { encoding: 'utf8' })
    return cities
  }
}

const getRestaurantIds: (cities: string[]) => Promise<string[]> = async cities => {
  try {
    const restaurantIds = JSON.parse(
      readFileSync(join(__dirname, '../data/uberEats-restaurantIds.json'), { encoding: 'utf8' }),
    )
    return restaurantIds
  } catch {
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
          if (element.id !== 'cityStores') {
            return
          }
          for (const feedItem of element.feedItems) {
            if (feedItem.carousel?.stores) {
              for (const store of feedItem.carousel.stores) {
                restaurantIds.push(store.storeUuid)
              }
            }
            if (feedItem.store) {
              restaurantIds.push(feedItem.store.storeUuid)
            }
          }
        })

        console.log(city, restaurantIds.length)
      } catch (error) {
        console.error(error)
        console.log(`${city} is not available`)
      }
    }

    writeFileSync(join(__dirname, '../data/uberEats-restaurantIds.json'), JSON.stringify(restaurantIds), {
      encoding: 'utf8',
    })

    return restaurantIds
  }
}

const getProducts = async (restaurantIds: string[]) => {
  const existedRestaurantIds = Object.fromEntries(
    readdirSync(join(__dirname, '../data/restaurants'), { encoding: 'utf8' })
      .filter(filename => filename.includes('json'))
      .map(filename => [filename.replace('.json', ''), 1]),
  )

  for (const restaurantId of restaurantIds) {
    if (existedRestaurantIds[restaurantId]) {
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
          '藥局',
          '超市',
          '百貨',
          '全聯',
          '家樂福',
          '屈臣氏',
          '大潤發',
          '美廉社',
          '萊爾富',
          '小三美日',
          '棉花田生機園地',
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
//
;(async () => {
  const cities = await getCities()
  const restaurantIds = await getRestaurantIds(cities)
  await getProducts(restaurantIds)
})()
