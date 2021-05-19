import cheerio from 'cheerio'
import { readdirSync, readFileSync, writeFileSync } from 'fs'
import fetch from 'node-fetch'
import { join } from 'path'
import { RestaurantProps } from '../src/types'
import filterProductName from './filterProductName'

const getCities: () => string[] = () => {
  return [
    'taipei-city',
    'new-taipei-city',
    'taichung-city',
    'kaohsiung-city',
    'hsinchu-city',
    'taoyuan-city',
    'keelung',
    'tainan-city',
    'miaoli-county',
    'chiayi-city',
    'changhua',
    'yilan-city',
    'pingtung-city',
    'yunlin-county',
    'hualien',
    'nantou-county',
    'taitung-county',
    'penghu-city',
    'kinmen-city',
  ]
}

const getRestaurantIds: (cities: string[]) => Promise<string[]> = async cities => {
  try {
    const restaurantIds = JSON.parse(
      readFileSync(join(__dirname, '../data/foodPanda-restaurantIds.json'), { encoding: 'utf8' }),
    )
    return restaurantIds
  } catch {
    const restaurantIds: string[] = []
    for (const city of cities) {
      try {
        const response = await fetch(`https://www.foodpanda.com.tw/city/${city}`)
        const html = await response.text()
        const $ = cheerio.load(html)
        $('.vendor-list > li > a').each((index, elem) => {
          if (!elem.attribs.href.startsWith('/restaurant/')) {
            return
          }
          restaurantIds.push(elem.attribs.href.split('/')[2])
        })
        console.log(city, restaurantIds.length)
      } catch {
        console.log(`${city} is not available`)
      }
    }

    writeFileSync(join(__dirname, '../data/foodPanda-restaurantIds.json'), JSON.stringify(restaurantIds), {
      encoding: 'utf8',
    })

    return restaurantIds
  }
}

const getProducts: (restaurantIds: string[]) => Promise<void> = async restaurantIds => {
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
      const response = await fetch(
        `https://www.foodpanda.com.tw/api/v1/vendors/${restaurantId}?include=menus,menu_categories&order_time=${new Date().toISOString()}&language_id=6&opening_type=delivery`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'Accept-Language': 'zh-TW,zh;q=0.8,en-US;q=0.5,en;q=0.3',
            'X-Requested-With': 'XMLHttpRequest',
          },
        },
      )
      const body = await response.json()

      const restaurant: RestaurantProps = {
        id: restaurantId,
        name: body.name,
        address: body.address,
        url: body.web_path,
        products: [],
        type: 'foodPanda',
      }

      body.menus.forEach((menu: any) => {
        menu.menu_categories.forEach((menu_category: any) => {
          menu_category.products.forEach((product: any) => {
            const name = filterProductName(product.name)
            if (!name) {
              return
            }
            restaurant.products.push({
              id: `${product.id}`,
              name: name,
              description: product.description || undefined,
            })
          })
        })
      })

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
