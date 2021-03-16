import { writeFileSync } from 'fs'
import foodPandaItems from './foodPandaItems.json'

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
  '加',
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
  '個元',
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
  '更換',
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
  '個元',
  '個大',
  '出前',
]

const filterItems = () => {
  const filteredItems: { [key: string]: number } = {}

  for (const item in foodPandaItems) {
    const name = item
      .replace(/[\s\da-zA-Z\!\"\#\$\%\&\'\(\)\*\+\,\-\.\/\:\;\<\=\>\?\@\[\\\]\^\_\`\{\|\}\~]/g, '')
      .trim()

    if (name.length < 2 || filteredItems[name]) {
      continue
    }

    if (bannedWords.some(word => name.includes(word))) {
      continue
    }

    filteredItems[name] = 1
  }

  writeFileSync('./items.json', JSON.stringify(filteredItems))
}

filterItems()

export default filterItems
