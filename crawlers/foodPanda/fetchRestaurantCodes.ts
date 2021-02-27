import cheerio from 'cheerio'
import { writeFileSync } from 'fs'
import fetch from 'node-fetch'

const cities = [
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

const fetchRestaurantCodes = async () => {
  const restaurantCodes: string[] = []

  for (const city of cities) {
    const response = await fetch(`https://www.foodpanda.com.tw/city/${city}`)
    const html = await response.text()
    const $ = cheerio.load(html)
    $('.vendor-list > li > a').each((index, elem) => {
      if (!elem.attribs.href.startsWith('/restaurant/')) {
        return
      }
      restaurantCodes.push(elem.attribs.href.split('/')[2])
    })
  }

  return restaurantCodes
}

fetchRestaurantCodes().then(restaurantCodes => {
  writeFileSync('./restaurantCodes.json', JSON.stringify(restaurantCodes), { encoding: 'utf8' })
})

export default fetchRestaurantCodes
