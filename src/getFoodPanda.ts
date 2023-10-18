import axios from 'axios'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import filterProductName from './filterProductName'
import { RestaurantProps } from './types'

const cityIds: {
  [CityName: string]: string
} = {
  'taipei-city': '44814',
  'new-taipei-city': '47626',
  'taichung-city': '44388',
  'tainan-city': '17',
  'taitung-county': '18',
  changhua: '8',
  'chiayi-city': '55762',
  'hsinchu-city': '49352',
  hualien: '11',
  'kaohsiung-city': '48632',
  keelung: '55757',
  'kinmen-city': '55759',
  'miaoli-county': '14',
  'nantou-county': '15',
  'penghu-city': '55760',
  'pingtung-city': '16',
  'taoyuan-city': '49825',
  'yilan-city': '19',
  'yunlin-county': '20',
}

const getRestaurantCodes = async () => {
  const restaurantCodes: string[] = []

  for (const cityName in cityIds) {
    if (!existsSync(join(__dirname, `../raw/foodPanda/cityRequest/${cityName}.json`))) {
      const response = await axios({
        method: 'GET',
        url: 'https://disco.deliveryhero.io/listing/api/v1/pandora/vendors?language_id=6&vertical=restaurants&country=tw&include=characteristics&configuration=Variant1&offset=0&limit=&sort=&city_id={{CITY_ID}}'.replace(
          '{{CITY_ID}}',
          cityIds[cityName],
        ),
        responseType: 'json',
        // credentials: 'omit',
        withCredentials: true,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/118.0',
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'zh-TW,zh;q=0.8,en-US;q=0.5,en;q=0.3',
          'X-FP-API-KEY': 'volo',
          'perseus-client-id': '1677518846092.793650064255124400.svmia69ahq',
          'perseus-session-id': '1697532353722.670325556598349400.hbusypp59a',
          'x-disco-client-id': 'web',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'cross-site',
          'dps-session-id': '',
          Pragma: 'no-cache',
          'Cache-Control': 'no-cache',
          Referrer: 'https://www.foodpanda.com.tw/',
        },
        // referrer: 'https://www.foodpanda.com.tw/',
        // mode: 'cors',
      })

      writeFileSync(
        join(__dirname, `../raw/foodPanda/cityRequest/${cityName}.json`),
        JSON.stringify(response.data),
        'utf8',
      )
    }

    const cityData = JSON.parse(readFileSync(join(__dirname, `../raw/foodPanda/cityRequest/${cityName}.json`), 'utf8'))

    cityData.data.items.forEach((item: any) => {
      restaurantCodes.push(item.code)
    })

    writeFileSync(join(__dirname, `../raw/foodPanda/restaurantCodes.json`), JSON.stringify(restaurantCodes), 'utf8')
  }
}

const excludeNames = new RegExp(
  `(${[
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
  ].join('|')})`,
)

const getRestaurantProducts = async () => {
  let i = 0
  const restaurantCodes = JSON.parse(readFileSync(join(__dirname, `../raw/foodPanda/restaurantCodes.json`), 'utf8'))

  for (const restaurantCode of restaurantCodes) {
    let restaurantFile: any = {}
    if (existsSync(join(__dirname, `../raw/foodPanda/restaurantRequest/${restaurantCode}.json`))) {
      restaurantFile = JSON.parse(
        readFileSync(join(__dirname, `../raw/foodPanda/restaurantRequest/${restaurantCode}.json`), 'utf8'),
      )
    } else {
      try {
        const response = await axios({
          method: 'GET',
          url: 'https://tw.fd-api.com/api/v5/vendors/{{RESTAURANT_CODE}}?include=menus,bundles,multiple_discounts&language_id=6&opening_type=delivery&basket_currency=TWD'.replace(
            '{{RESTAURANT_CODE}}',
            restaurantCode,
          ),
          responseType: 'json',
          // "credentials": "include",
          withCredentials: true,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/110.0',
            Accept: 'application/json, text/plain, */*',
            'Accept-Language': 'zh-TW,zh;q=0.8,en-US;q=0.5,en;q=0.3',
            'X-FP-API-KEY': 'volo',
            'X-PD-Language-ID': '6',
            'dps-session-id':
              'eyJzZXNzaW9uX2lkIjoiOTc2MWM3ODg1ZGUwYzc0MWQzZGIxZTU1NmFkODkzMmQiLCJwZXJzZXVzX2lkIjoiMTY3NzUxODg0NjA5Mi43OTM2NTAwNjQyNTUxMjQ0MDAuc3ZtaWE2OWFocSIsInRpbWVzdGFtcCI6MTY3NzU3OTIzMn0=',
            'Perseus-Session-ID': '1677518846092.793650064255124400.svmia69ahq',
            'Api-Version': '6',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'cross-site',
            Authorization: '',
            Refferrer: 'https://www.foodpanda.com.tw/',
          },
          // referrer: 'https://www.foodpanda.com.tw/',
          // mode: 'cors',
        })

        writeFileSync(
          join(__dirname, `../raw/foodPanda/restaurantRequest/${restaurantCode}.json`),
          JSON.stringify(response.data),
          'utf8',
        )
        restaurantFile = response.data
      } catch {
        console.log(`error: ${restaurantCode}`)
        continue
      }
    }

    if (excludeNames.test(restaurantFile.data.name)) {
      continue
    }

    const restaurant: RestaurantProps = {
      id: restaurantFile.data.code,
      name: restaurantFile.data.name,
      url: `https://www.foodpanda.com.tw/restaurant/${restaurantFile.data.code}`,
      products: [],
    }

    restaurantFile.data.menus?.forEach((menu: any) => {
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
    if (restaurant.products.length > 20) {
      writeFileSync(filePath, JSON.stringify(restaurant), 'utf8')
      console.log(
        `${++i}/${restaurantCodes.length} Restaurant ${restaurant.id} has ${restaurant.products.length} products`,
      )
    } else if (existsSync(filePath)) {
      unlinkSync(filePath)
      console.log(`Restaurant ${restaurant.id} is removed`)
    }
  }
}

;(async () => {
  // await getRestaurantCodes()
  await getRestaurantProducts()
})()
