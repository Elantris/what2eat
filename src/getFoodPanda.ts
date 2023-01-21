import axios from 'axios'
import { load } from 'cheerio'
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import filterProductName from './filterProductName'
import { RestaurantProps } from './types'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const getRestaurantLinks: () => Promise<{ [CityId: string]: string[] }> = async () => {
  const filePath = join(__dirname, '../raw/foodPandaRestaurantLinks.json')
  try {
    const restaurantLinks = JSON.parse(readFileSync(filePath, { encoding: 'utf8' }))
    return restaurantLinks
  } catch {}

  const restaurantLinks: { [CityId: string]: string[] } = {}
  const cityIds = [
    'changhua',
    'chiayi-city-jia-yi-shi',
    'hsinchu-city',
    'hualien',
    'kaohsiung-city',
    'keelung',
    'kinmen-city',
    'miaoli-county',
    'nantou-county',
    'new-taipei-city',
    'penghu-city',
    'pingtung-city',
    'taichung-city',
    'tainan-city',
    'taipei-city',
    'taitung-county',
    'taoyuan-city',
    'yilan-city',
    'yunlin-county',
  ]
  for (const cityId of cityIds) {
    try {
      restaurantLinks[cityId] = []
      const response = await axios({
        // cspell: disable
        url: `https://www.foodpanda.com.tw/city/${cityId}`,
        withCredentials: true,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:104.0) Gecko/20100101 Firefox/104.0',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'zh-TW,zh;q=0.8,en-US;q=0.5,en;q=0.3',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'same-origin',
          'Sec-Fetch-User': '?1',
          Referrer: 'https://www.foodpanda.com.tw/',
        },
        method: 'GET',
        // cspell: enable
      })

      const $ = load(response.data)
      $('a').each((i, elem) => {
        const href = $(elem).attr('href')
        if (!href) {
          return
        }
        if (/\/restaurant\//.test(href) || /\/chain\//.test(href)) {
          restaurantLinks[cityId].push(href)
        }
      })

      console.log(`City ${cityId} has ${restaurantLinks[cityId].length} restaurants`)
    } catch (error: any) {
      console.log(`City ${cityId} error`)
    }
  }

  writeFileSync(filePath, JSON.stringify(restaurantLinks), { encoding: 'utf8' })
  return restaurantLinks
}

const getRestaurantIds: (restaurantLinks: {
  [CityId: string]: string[]
}) => Promise<string[]> = async restaurantLinks => {
  const filePath = join(__dirname, '../raw/foodPandaRestaurantIds.json')
  try {
    const restaurantIds = JSON.parse(readFileSync(filePath, { encoding: 'utf8' }))
    return restaurantIds
  } catch {}

  const restaurantIds: string[] = []
  for (const cityId in restaurantLinks) {
    for (const restaurantLink of restaurantLinks[cityId]) {
      const id = restaurantLink.replace('https://www.foodpanda.com.tw', '').split('/')[2]
      if (id.length === 5 && id.startsWith('c')) {
        const ids = await getChainRestaurantIds(id)
        restaurantIds.push(...ids)
      } else if (id.length === 4) {
        restaurantIds.push(id)
      }
    }
  }

  console.log(`FoodPanda has ${restaurantIds.length} restaurants`)
  writeFileSync(filePath, JSON.stringify(restaurantIds), { encoding: 'utf8' })
  return restaurantIds
}

const getChainRestaurantIds: (chainId: string) => Promise<string[]> = async chainId => {
  let data: any
  const filePath = join(__dirname, '../raw/foodPandaChains/', `${chainId}.json`)
  try {
    data = JSON.parse(readFileSync(filePath, { encoding: 'utf8' }))
  } catch {
    try {
      const response = await axios({
        // cspell: disable
        url: 'https://disco.deliveryhero.io/listing/api/v1/pandora/chain?chain_code=<CHAIN_ID>&include=metadata&country=tw'.replace(
          '<CHAIN_ID>',
          chainId,
        ),
        withCredentials: true,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:101.0) Gecko/20100101 Firefox/101.0',
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'zh-TW,zh;q=0.8,en-US;q=0.5,en;q=0.3',
          'X-FP-API-KEY': 'volo',
          'x-disco-client-id': 'web',
          'X-Original-User-Agent': 'undefined',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'cross-site',
          Referrer: 'https://www.foodpanda.com.tw/',
        },
        method: 'GET',
        // cspell: enable
      })
      writeFileSync(filePath, JSON.stringify(response.data), { encoding: 'utf8' })

      data = response.data
    } catch {
      console.error(`Chained ${chainId} error`)
      return []
    }
  }

  const ids: string[] = []
  data.data.items.forEach((item: any) => {
    ids.push(item.code)
  })
  console.log(`Chained ${chainId} has ${ids.length} restaurants`)

  return ids.slice(0, 1)
}

const getRestaurantData = async (restaurantIds: string[]) => {
  // cspell: disable
  const existedRestaurantsMap: { [key: string]: number } = {
    qxae: 1,
    f1fs: 1,
    ud2t: 1,
    owyh: 1,
  }
  // cspell: enable
  readdirSync(join(__dirname, '../raw/foodPandaRestaurants')).forEach(filename => {
    if (filename.endsWith('.json')) {
      existedRestaurantsMap[filename.split('.')[0]] = 1
    }
  })

  for (const restaurantId of restaurantIds) {
    if (existedRestaurantsMap[restaurantId]) {
      continue
    }

    try {
      const response = await axios({
        // cspell: disable
        url: 'https://tw.fd-api.com/api/v5/vendors/<RESTAURANT_ID>?include=menus,bundles,multiple_discounts&language_id=6&dynamic_pricing=0&opening_type=delivery&basket_currency=TWD'.replace(
          '<RESTAURANT_ID>',
          restaurantId,
        ),
        withCredentials: true,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:104.0) Gecko/20100101 Firefox/104.0',
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'zh-TW,zh;q=0.8,en-US;q=0.5,en;q=0.3',
          'X-FP-API-KEY': 'volo',
          'X-PD-Language-ID': '6',
          'dps-session-id':
            'eyJzZXNzaW9uX2lkIjoiNWViNzFhYjRmZWViOGQ5OWY4YmQ1MjliODgxNGE5ZDgiLCJwZXJzZXVzX2lkIjoiMTYxMDU1MTI0NC42MzA4MTg3ODgxLkFHR0JNNDB6UjkiLCJ0aW1lc3RhbXAiOjE2NjMzODc4NTN9',
          'Perseus-Session-ID': '1610551244.6308187881.AGGBM40zR9',
          'Api-Version': '6',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'cross-site',
          Authorization: '',
          Referrer: 'https://www.foodpanda.com.tw/',
        },
        method: 'GET',
        // cspell: enable
      })

      writeFileSync(
        join(__dirname, `../raw/foodPandaRestaurants/${restaurantId}.json`),
        JSON.stringify(response.data),
        { encoding: 'utf8' },
      )

      await sleep(50)
    } catch (error: any) {
      console.log(`Restaurant ${restaurantId} error`)
      continue
    }
  }
}

const getProducts = () => {
  readdirSync(join(__dirname, '../raw/foodPandaRestaurants')).forEach(filename => {
    if (!filename.endsWith('.json')) {
      return
    }

    const file = JSON.parse(
      readFileSync(join(__dirname, '../raw/foodPandaRestaurants/', filename), { encoding: 'utf8' }),
    )

    if (
      [
        'test',
        '五金',
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
        'innisfree',
        '統一',
      ].some(key => file.data.name.includes(key))
    ) {
      return
    }

    const restaurant: RestaurantProps = {
      id: file.data.code,
      name: file.data.name,
      url: `https://www.foodpanda.com.tw/restaurant/${file.data.code}`,
      products: [],
    }

    file.data.menus?.forEach((menu: any) => {
      menu.menu_categories.forEach((category: any) => {
        category.products.forEach((product: any) => {
          const name = filterProductName(product.name)
          if (!name) {
            return
          }

          restaurant.products.push({
            id: `${product.id}`,
            name: name,
            description: product.description || undefined,
            image: product.images?.[0]?.image_url,
          })
        })
      })
    })

    const filePath = join(__dirname, `../data/${restaurant.id}.json`)
    if (restaurant.products.length > 5) {
      writeFileSync(filePath, JSON.stringify(restaurant), { encoding: 'utf8' })
      console.log(`Restaurant ${restaurant.id} has ${restaurant.products.length} products`)
    } else if (existsSync(filePath)) {
      unlinkSync(filePath)
      console.log(`Restaurant ${restaurant.id} is removed`)
    }
  })
}

// main
;(async () => {
  const restaurantLinks = await getRestaurantLinks()
  const restaurantIds = await getRestaurantIds(restaurantLinks)
  await getRestaurantData(restaurantIds)
  getProducts()
})()
