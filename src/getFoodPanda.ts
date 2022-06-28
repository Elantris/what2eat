import axios from 'axios'
import { load } from 'cheerio'
import { readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import filterProductName from './filterProductName'
import { RestaurantProps } from './types'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const getRestaurantLinks: () => Promise<string[]> = async () => {
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

  try {
    const restaurantLinks = JSON.parse(
      readFileSync(join(__dirname, '../raw/foodPandaRestaurantLinks.json'), {
        encoding: 'utf8',
      }),
    )
    return restaurantLinks
  } catch {}

  const restaurantLinks: string[] = []

  for (const cityId of cityIds) {
    try {
      const response = await axios({
        // cspell: disable
        url: `https://www.foodpanda.com.tw/city/${cityId}`,
        withCredentials: true,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:102.0) Gecko/20100101 Firefox/102.0',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
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
          restaurantLinks.push(href)
        }
      })

      console.log(cityId, restaurantLinks.length)
    } catch (error: any) {
      console.log(`${cityId} is not available`)
    }
  }

  writeFileSync(
    join(__dirname, '../raw/foodPandaRestaurantLinks.json'),
    JSON.stringify(restaurantLinks),
    { encoding: 'utf8' },
  )

  return restaurantLinks
}

const getRestaurantIds: (
  restaurantLinks: string[],
) => Promise<string[]> = async restaurantLinks => {
  try {
    const restaurantIds = JSON.parse(
      readFileSync(join(__dirname, '../raw/foodPandaRestaurantIds.json'), {
        encoding: 'utf8',
      }),
    )
    return restaurantIds
  } catch {}

  const restaurantIds: string[] = []

  for (const restaurantLink of restaurantLinks) {
    const id = restaurantLink
      .replace('https://www.foodpanda.com.tw', '')
      .split('/')[2]
    if (id.length === 5 && id.startsWith('c')) {
      const ids = await getChainRestaurantIds(id)
      restaurantIds.push(...ids)
    } else if (id.length === 4) {
      restaurantIds.push(id)
    }
  }

  writeFileSync(
    join(__dirname, '../raw/foodPandaRestaurantIds.json'),
    JSON.stringify(restaurantIds),
    { encoding: 'utf8' },
  )

  return restaurantIds
}

const getChainRestaurantIds: (
  chainId: string,
) => Promise<string[]> = async chainId => {
  let data: any

  try {
    data = JSON.parse(
      readFileSync(join(__dirname, `../raw/foodPandaChains/${chainId}.json`), {
        encoding: 'utf8',
      }),
    )
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
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:101.0) Gecko/20100101 Firefox/101.0',
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

      writeFileSync(
        join(__dirname, `../raw/foodPandaChains/${chainId}.json`),
        JSON.stringify(response.data),
        { encoding: 'utf8' },
      )

      data = response.data
    } catch {
      console.error(`${chainId} is not available`)
      return []
    }
  }

  const ids: string[] = []
  data.data.items.forEach((item: any) => {
    ids.push(item.code)
  })
  console.log(chainId, ids.length)

  return ids
}

const getRestaurantData = async (restaurantIds: string[]) => {
  let count = 0

  // cspell: disable
  const existedRestaurantsMap: { [key: string]: number } = {
    vhqw: 1,
    nki3: 1,
    f1fs: 1,
    d0iv: 1,
    iza7: 1,
    y2mg: 1,
    ac1v: 1,
    f4hz: 1,
    j1go: 1,
    ud2t: 1,
    jhng: 1,
    zk54: 1,
    c5mp: 1,
    kh9n: 1,
    s5y9: 1,
    dtrd: 1,
  }
  // cspell: enable
  readdirSync(join(__dirname, '../raw/foodPandaRestaurants')).forEach(
    filename => {
      if (filename.endsWith('.json')) {
        existedRestaurantsMap[filename.split('.')[0]] = 1
      }
    },
  )

  const token = readFileSync(join(__dirname, '../token'), { encoding: 'utf8' })
    .replace('Authorization: ', '')
    .trim()

  for (const restaurantId of restaurantIds) {
    if (existedRestaurantsMap[restaurantId]) {
      continue
    }
    count++
    console.log(`${count} ${restaurantId}`)

    try {
      const response = await axios({
        // cspell: disable
        url: 'https://tw.fd-api.com/api/v5/vendors/<RESTAURANT_ID>?include=menus,bundles,multiple_discounts&language_id=6&dynamic_pricing=0&opening_type=delivery&basket_currency=TWD'.replace(
          '<RESTAURANT_ID>',
          restaurantId,
        ),
        withCredentials: true,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:101.0) Gecko/20100101 Firefox/101.0',
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'zh-TW,zh;q=0.8,en-US;q=0.5,en;q=0.3',
          'X-FP-API-KEY': 'volo',
          'X-PD-Language-ID': '6',
          'dps-session-id':
            'eyJzZXNzaW9uX2lkIjoiMDNhZmRiNjBmN2U4ZDgxMmJiNzllMDBjNzNlZjM2OWEiLCJwZXJzZXVzX2lkIjoiMTYxMDU1MTI0NC42MzA4MTg3ODgxLkFHR0JNNDB6UjkiLCJ0aW1lc3RhbXAiOjE2NTYzODE0MjJ9',
          'Perseus-Session-ID': '1610551244.6308187881.AGGBM40zR9',
          'Api-Version': '6',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'cross-site',
          Authorization: token,
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
      console.error(error)
      console.log(restaurantId)
      break
    }
  }
}

const getProducts = () => {
  readdirSync(join(__dirname, '../raw/foodPandaRestaurants')).forEach(
    filename => {
      if (!filename.endsWith('.json')) {
        return
      }

      const file = JSON.parse(
        readFileSync(
          join(__dirname, `../raw/foodPandaRestaurants/${filename}`),
          { encoding: 'utf8' },
        ),
      )

      const restaurant: RestaurantProps = {
        id: file.data.code,
        name: file.data.name,
        address: file.data.address,
        products: [],
        type: 'foodPanda',
      }

      file.data.menus?.forEach((menu: any) => {
        menu.menu_categories.forEach((category: any) => {
          category.products.forEach((product: any) => {
            const name = filterProductName(product.name)
            if (!name) {
              return
            }
            const image =
              product.images?.[0]?.image_url
                .replace(
                  'https://images.deliveryhero.io/image/fd-tw/Products/',
                  '',
                )
                .replace('.jpg', '') || undefined
            restaurant.products.push({
              id: `${product.id}`,
              name: name,
              description: product.description || undefined,
              image,
            })
          })
        })
      })

      if (restaurant.products.length > 10) {
        writeFileSync(
          join(__dirname, `../data/${restaurant.id}.json`),
          JSON.stringify(restaurant),
          { encoding: 'utf8' },
        )
        console.log(restaurant.id, restaurant.products.length)
      }
    },
  )
}

// main
;(async () => {
  const restaurantLinks = await getRestaurantLinks()
  const restaurantIds = await getRestaurantIds(restaurantLinks)
  await getRestaurantData(restaurantIds)
  getProducts()
})()
