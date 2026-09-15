export const SHOP = {
    // Updated per company registration certificate (หนังสือรับรองบริษัท), Sep 2026.
    // tel/LINE/FB/bank details are still the old ones — confirm whether those should
    // change too now that billing is under the new juristic entity.
    name:    'บริษัท ซี สไตล์ แอพพาเรล จำกัด',
    branch:  'สาขาหนองจอก',
    address: '68/148 ซอยอยู่วิทยา 18 ถนนสุวินทวงศ์ แขวงกระทุ่มราย เขตหนองจอก กรุงเทพมหานคร 10530',
    taxId:   '0105569169805',
    tel:     '063-635-6423, 093-949-6997',
    line:    '@cscreen639',
    fb:          'C-SCREEN',
    bankAccount: '014-8-09870-0',
    bankName:    'นางสาวสุพรรัตน์ พรมเชียงสาชูโชค',
    logo:        '/cstyle-logo.jpg',
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
