import axios from 'axios'
import { readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import filterProductName from './filterProductName'
import { RestaurantProps } from './types'

const getCities: () => Promise<string[]> = async () => {
  try {
    const cities = JSON.parse(
      readFileSync(join(__dirname, '../raw/uberEatsCities.json'), {
        encoding: 'utf8',
      }),
    )
    return cities
  } catch {
    const cities: string[] = []
    const response = await axios({
      url: 'https://www.ubereats.com/api/getCountriesWithCitiesV1?localeCode=tw',
      withCredentials: true,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:102.0) Gecko/20100101 Firefox/102.0',
        Accept: '*/*',
        'Accept-Language': 'zh-TW,zh;q=0.8,en-US;q=0.5,en;q=0.3',
        'Content-Type': 'application/json',
        'x-csrf-token': 'x',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        Referrer: 'https://www.ubereats.com/tw/location',
      },
      data: '{}',
      method: 'POST',
    })

    response.data.data.regionCityLinks.links.forEach((link: any) => {
      link.links.forEach((link: any) => {
        cities.push(link.href.split('/city/')[1])
      })
    })
    writeFileSync(
      join(__dirname, '../raw/uberEatsCities.json'),
      JSON.stringify(cities),
      { encoding: 'utf8' },
    )
    return cities
  }
}

const getStoreIds: (cities: string[]) => Promise<string[]> = async cities => {
  try {
    const storeIds = JSON.parse(
      readFileSync(join(__dirname, '../raw/uberEatsStoreIds.json'), {
        encoding: 'utf8',
      }),
    )
    return storeIds
  } catch {
    const storeIds: string[] = []
    for (const city of cities) {
      try {
        const response = await axios({
          url: 'https://www.ubereats.com/api/getSeoFeedV1?localeCode=tw',
          withCredentials: true,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:102.0) Gecko/20100101 Firefox/102.0',
            Accept: '*/*',
            'Accept-Language': 'zh-TW,zh;q=0.8,en-US;q=0.5,en;q=0.3',
            'Content-Type': 'application/json',
            'x-csrf-token': 'x',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            Referrer: 'https://www.ubereats.com/tw/city/dajia-txg',
          },
          data: JSON.stringify({ pathname: `/tw/city/${city}` }),
          method: 'POST',
        })

        response.data.data.elements.forEach((element: any) => {
          if (element.id !== 'cityStores') {
            return
          }
          for (const feedItem of element.feedItems) {
            if (feedItem.carousel?.stores) {
              for (const store of feedItem.carousel.stores) {
                storeIds.push(store.storeUuid)
              }
            }
            if (feedItem.store) {
              storeIds.push(feedItem.store.storeUuid)
            }
          }
        })

        console.log(city, storeIds.length)
      } catch (error) {
        console.error(error)
        console.log(`${city} is not available`)
      }
    }

    writeFileSync(
      join(__dirname, '../raw/uberEatsStoreIds.json'),
      JSON.stringify(storeIds),
      { encoding: 'utf8' },
    )

    return storeIds
  }
}

const getProducts = async (storeIds: string[]) => {
  const existedStoreIds = Object.fromEntries(
    readdirSync(join(__dirname, '../raw/uberEatsStores'), { encoding: 'utf8' })
      .filter(filename => filename.includes('json'))
      .map(filename => [filename.replace('.json', ''), 1]),
  )

  for (const storeId of storeIds) {
    if (existedStoreIds[storeId]) {
      continue
    }

    try {
      const response = await axios({
        url: 'https://www.ubereats.com/api/getStoreV1?localeCode=tw',
        withCredentials: true,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:102.0) Gecko/20100101 Firefox/102.0',
          Accept: '*/*',
          'Accept-Language': 'zh-TW,zh;q=0.8,en-US;q=0.5,en;q=0.3',
          'Content-Type': 'application/json',
          'x-csrf-token': 'x',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin',
        },
        data: JSON.stringify({ storeUuid: storeId }),
        method: 'POST',
      })

      writeFileSync(
        join(__dirname, `../raw/uberEatsStores/${storeId}.json`),
        JSON.stringify(response.data),
        { encoding: 'utf8' },
      )
      console.log(storeId)
    } catch (error) {
      console.log(`${storeId} is not available`)
      console.error(error)
    }
  }
}

const parseProducts = () => {
  const storeIds = readdirSync(join(__dirname, '../raw/uberEatsStores'), {
    encoding: 'utf8',
  })
    .filter(filename => filename.includes('json'))
    .map(filename => filename.replace('.json', ''))

  for (const storeId of storeIds) {
    console.log(storeId)
    const { status, data } = JSON.parse(
      readFileSync(join(__dirname, `../raw/uberEatsStores/${storeId}.json`), {
        encoding: 'utf8',
      }),
    )

    if (status !== 'success') {
      continue
    }

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
      ].some(key => data.title.includes(key))
    ) {
      continue
    }

    const meta = JSON.parse(data.metaJson)
    const restaurant: RestaurantProps = {
      id: storeId,
      name: data.title,
      address: data.location.address,
      url: decodeURIComponent(meta['@id']),
      products: [],
      type: 'uberEats',
    }

    for (const sectionId in data.catalogSectionsMap) {
      for (const section of data.catalogSectionsMap[sectionId]) {
        if (!section?.payload?.standardItemsPayload?.catalogItems?.length) {
          continue
        }
        for (const item of section.payload.standardItemsPayload.catalogItems) {
          const name = filterProductName(item.title)
          if (!name) {
            continue
          }

          restaurant.products.push({
            id: item.uuid,
            name,
            description: item.itemDescription || undefined,
            image: item.imageUrl || undefined,
          })
        }
      }
    }

    if (restaurant.products.length > 10) {
      writeFileSync(
        join(__dirname, `../data/ubereats/${storeId}.json`),
        JSON.stringify(restaurant),
        { encoding: 'utf8' },
      )

      console.log(restaurant.products.length)
    }
  }
}

// main
;(async () => {
  const cities = await getCities()
  const storeIds = await getStoreIds(cities)
  await getProducts(storeIds)
  parseProducts()
})()
