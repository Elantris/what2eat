import { writeFileSync } from 'fs'
import fetch from 'node-fetch'
import { join } from 'path'
import restaurantCodes from '../../src/restaurantCodes.json'

type RestaurantProps = {
  id: number
  code: string
  name: string
  address: string
  products: {
    id: number
    name: string
    description: string
  }[]
}

// const restaurantCodes = ['a03s', 'a0ac', 'a0cd']

const bannedWords: string[] = [
  // symbol
  '＊',
  '※',
  '⭕️',
  '✪',
  'é',
  '—',
  '·',
  '｜',
  '＋',

  // punctuation
  '、',
  '，',
  '。',
  '．',
  '！',
  '：',
  '“',
  '（',
  '）',
  '【',
  '】',
  '［',
  '］',
  '《',
  '》',
  '「',
  '」',
  '『',
  '』',

  // note
  '請',
  '若',
  '僅',
  '均',
  '附',
  '限',
  '我',
  '皆',
  '擇',
  '只有',
  '套餐',
  '本店',
  '提供',
  '環保',
  '餐廳',
  '等候',
  '備註',
  '客製',
  '任選',
  '數量',
  '私訊',
  '預定',
  '添加',
  '號餐',
  '本土',
  '供應',
  '產地',
  '代替',
  '一定',
  '建議',
  '調整',
  '加大',
  '使用',
  '所有',
  '謝謝',
  '相關',
  '品項',
  '門市',
  '產品',
  '責任',
  '覺得',
  '狀況',
  '消費',
  '不需',
  '商品',
  '餐點',
  '固定',
  '熱量',
  '生產',
  '履歷',
  '食材',
  '更換',
  '注意',
  '事項',
  '內容',
  '不同',
  '配菜',
  '國產',
  '可能',
  '外帶',
  '適用',
  '優惠',
  '必點',
  '抽取',
  '因此',
  '認證',
  '色素',
  '一律',
  '處理',
  '採用',
  '選項',
  '出餐',
  '台灣豬',
  '悄悄話',
  '即日起',
  '肉品來源',

  // other
  '還是',
  '個元',
  '個大',
  '出前',
]

const fetchFoodPandaItems = async () => {
  for (const index in restaurantCodes) {
    const restaurantCode = restaurantCodes[index]
    try {
      const response = await fetch(
        `https://www.foodpanda.com.tw/api/v1/vendors/${restaurantCode}?include=menus,menu_categories&order_time=${new Date().toISOString()}&language_id=6&opening_type=delivery`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'Accept-Language': 'zh-TW,zh;q=0.8,en-US;q=0.5,en;q=0.3',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:84.0) Gecko/20100101 Firefox/84.0',
            'X-Requested-With': 'XMLHttpRequest',
          },
        },
      )

      const body = await response.json()

      const restaurant: RestaurantProps = {
        id: body.id,
        code: body.code,
        name: body.name,
        address: body.address,
        products: [],
      }

      body.menus.forEach((menu: any) => {
        menu.menu_categories.forEach((menu_category: any) => {
          menu_category.products.forEach((product: any) => {
            const name: string = product.name.replace(/[\x20-\x7E]/g, '').trim()

            if (name.length < 2 || bannedWords.some(word => name.includes(word))) {
              return
            }

            restaurant.products.push({
              id: product.id,
              name: name,
              description: product.description,
            })
          })
        })
      })

      if (restaurant.products.length > 0) {
        writeFileSync(join(__dirname, `../../data/restaurants/${restaurantCode}.json`), JSON.stringify(restaurant), {
          encoding: 'utf8',
        })
      }

      console.log(index, restaurantCode, restaurant.products.length)
    } catch (error) {
      console.log(index, restaurantCode, error)
    }
  }
}

fetchFoodPandaItems()

export default fetchFoodPandaItems
