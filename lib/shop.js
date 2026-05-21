export const SHOP = {
  name:    'C-Screen สกรีนเสื้อ-ตัด-เย็บ-ปัก ครบวงจร',
  branch:  'สาขาหนองจอก',
  address: '68/148 หมู่บ้านอมรทรัพย์ ซอยอยู่วิทยา 18 ถนนสุวินทวงศ์ แขวงกระทุ่มราย เขตหนองจอก กรุงเทพมหานคร 10530',
  taxId:   '1710700062477',
  tel:     '063-635-6423, 093-949-6997',
  line:    '@cscreen639',
  fb:          'C-SCREEN',
  bankAccount: '014-8-09870-0',
  bankName:    'นางสาวสุพรรัตน์ พรมเชียงสาชูโชค',
}

// date formatter DD/MM/YYYY (พ.ศ.)
export const fmtDate = (d) => {
  if (!d) return '—'
  const date = new Date(d)
  const dd   = String(date.getDate()).padStart(2, '0')
  const mm   = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear() + 543
  return `${dd}/${mm}/${yyyy}`
}

// short date
export const fmtShort = (d) => {
  if (!d) return '—'
  const date = new Date(d)
  const dd   = String(date.getDate()).padStart(2, '0')
  const mm   = String(date.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}`
}
