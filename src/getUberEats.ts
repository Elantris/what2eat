import axios from 'axios'
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import filterProductName from './filterProductName'
import { RestaurantProps } from './types'

const getCityIds: () => Promise<string[]> = async () => {
  const filePath = join(__dirname, '../raw/uberEatsCityIds.json')
  try {
    const cityIds = JSON.parse(
      readFileSync(filePath, {
        encoding: 'utf8',
      }),
    )
    return cityIds
  } catch {
    const cityIds: string[] = []
    const response = await axios({
      url: 'https://www.ubereats.com/api/getCountriesWithCitiesV1?localeCode=tw',
      withCredentials: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:102.0) Gecko/20100101 Firefox/102.0',
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
        cityIds.push(link.href.split('/city/')[1])
      })
    })
    console.log(`Uber Eats has ${cityIds.length} cities`)
    writeFileSync(filePath, JSON.stringify(cityIds), { encoding: 'utf8' })
    return cityIds
  }
}

const getStoreIds: (cityIds: string[]) => Promise<{ [CityId: string]: string[] }> = async cityIds => {
  const filePath = join(__dirname, '../raw/uberEatsStoreIds.json')
  try {
    const storeIds = JSON.parse(readFileSync(filePath, { encoding: 'utf8' }))
    return storeIds
  } catch {
    const storeIds: { [CityId: string]: string[] } = {}
    for (const cityId of cityIds) {
      try {
        storeIds[cityId] = []
        const response = await axios({
          url: 'https://www.ubereats.com/api/getSeoFeedV1?localeCode=tw',
          withCredentials: true,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:102.0) Gecko/20100101 Firefox/102.0',
            Accept: '*/*',
            'Accept-Language': 'zh-TW,zh;q=0.8,en-US;q=0.5,en;q=0.3',
            'Content-Type': 'application/json',
            'x-csrf-token': 'x',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            Referrer: 'https://www.ubereats.com/tw/city/dajia-txg',
          },
          data: JSON.stringify({ pathname: `/tw/city/${cityId}` }),
          method: 'POST',
        })

        response.data.data.elements.forEach((element: any) => {
          if (element.id !== 'cityStores') {
            return
          }
          for (const feedItem of element.feedItems) {
            if (feedItem.carousel?.stores) {
              for (const store of feedItem.carousel.stores) {
                storeIds[cityId].push(store.storeUuid)
              }
            }
            if (feedItem.store) {
              storeIds[cityId].push(feedItem.store.storeUuid)
            }
          }
        })

        // console.log(city, storeIds.length)
        console.log(`City ${cityId} has ${storeIds[cityId].length} stores`)
      } catch (error) {
        console.error(error)
        console.log(`City ${cityId} error`)
      }
    }

    writeFileSync(join(__dirname, '../raw/uberEatsStoreIds.json'), JSON.stringify(storeIds), { encoding: 'utf8' })

    return storeIds
  }
}

const getStoreData = async (storeIds: { [CityId: string]: string[] }) => {
  const existedStoreIds = Object.fromEntries(
    readdirSync(join(__dirname, '../raw/uberEatsStores'), { encoding: 'utf8' })
      .filter(filename => filename.includes('json'))
      .map(filename => [filename.replace('.json', ''), 1]),
  )

  for (const cityId in storeIds) {
    for (const storeId of storeIds[cityId]) {
      if (existedStoreIds[storeId]) {
        continue
      }

      try {
        const response = await axios({
          url: 'https://www.ubereats.com/api/getStoreV1?localeCode=tw',
          withCredentials: true,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:102.0) Gecko/20100101 Firefox/102.0',
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

        writeFileSync(join(__dirname, `../raw/uberEatsStores/${storeId}.json`), JSON.stringify(response.data), {
          encoding: 'utf8',
        })
        console.log(`Store ${storeId}`)
      } catch (error) {
        console.log(`Store ${storeId} error`)
      }
    }
  }
}

const getProducts = () => {
  const storeIds = readdirSync(join(__dirname, '../raw/uberEatsStores'), {
    encoding: 'utf8',
  })
    .filter(filename => filename.includes('json'))
    .map(filename => filename.replace('.json', ''))

  for (const storeId of storeIds) {
    const { status, data } = JSON.parse(
      readFileSync(join(__dirname, `../raw/uberEatsStores/${storeId}.json`), { encoding: 'utf8' }),
    )

    if (status !== 'success') {
      continue
    }

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
      ].some(key => data.title.includes(key))
    ) {
      continue
    }

    const meta = JSON.parse(data.metaJson)
    const restaurant: RestaurantProps = {
      id: storeId,
      name: data.title,
      url: decodeURIComponent(meta['@id']),
      products: [],
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

    const filePath = join(__dirname, `../data/${storeId}.json`)
    if (restaurant.products.length > 5) {
      writeFileSync(filePath, JSON.stringify(restaurant), { encoding: 'utf8' })
      console.log(`Store ${restaurant.id} has ${restaurant.products.length} products`)
    } else if (existsSync(filePath)) {
      unlinkSync(filePath)
      console.log(`Store ${restaurant.id} is removed`)
    }
  }
}

// main
;(async () => {
  const cityIds = await getCityIds()
  const storeIds = await getStoreIds(cityIds)
  await getStoreData(storeIds)
  getProducts()
})()
