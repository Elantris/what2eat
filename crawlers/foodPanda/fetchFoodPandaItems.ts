import { writeFileSync } from 'fs'
import fetch from 'node-fetch'
import restaurantCodes from './restaurantCodes.json'

const fetchFoodPandaItems = async () => {
  const items: { [key: string]: number } = {}
  for (const restaurantCode of restaurantCodes) {
    try {
      const url = `https://www.foodpanda.com.tw/api/v1/vendors/${restaurantCode}?include=menus,menu_categories&order_time=${new Date().toISOString()}&language_id=6&opening_type=delivery`

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Accept-Language': 'zh-TW,zh;q=0.8,en-US;q=0.5,en;q=0.3',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:84.0) Gecko/20100101 Firefox/84.0',
          'X-Requested-With': 'XMLHttpRequest',
        },
      })

      const body = await response.json()

      body.menus.forEach((menu: any) => {
        menu.menu_categories.forEach((menu_category: any) => {
          menu_category.products.forEach((product: any) => {
            if (!items[product.name]) {
              items[product.name] = 0
            }
            items[product.name] += 1
          })
        })
      })

      console.log(restaurantCode, Object.keys(items).length)
    } catch (error) {
      console.log(restaurantCode, error)
    }
  }

  writeFileSync('./foodPandaItems.json', JSON.stringify(items))
}

fetchFoodPandaItems()

export default fetchFoodPandaItems
