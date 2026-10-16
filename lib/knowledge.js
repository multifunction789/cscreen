// Knowledge base (คลังความรู้) — shared by the knowledge page, the chat picker and the bot settings.
import { supabase } from '@/lib/supabase'

export const KB_EDITORS = ['owner', 'admin']
export const KB_CATEGORIES = ['คำถามที่พบบ่อย', 'สินค้า / ผ้า', 'เทคนิคการพิมพ์', 'ไซซ์ชาร์ต', 'ราคา / เงื่อนไข', 'ขั้นตอนสั่งงาน', 'การดูแลเสื้อ']
export const MAX_IMAGES = 4

export async function listArticles() {
  const { data, error } = await supabase.from('kb_articles').select('*').order('category').order('sort').order('title')
  if (error) throw new Error(error.message)
  return data || []
}

const clean = a => ({
  category: (a.category || 'ทั่วไป').trim(),
  title: (a.title || '').trim(),
  body: a.body || '',
  staff_note: a.staff_note?.trim() || null,
  images: (a.images || []).slice(0, MAX_IMAGES),
  keywords: (a.keywords || []).map(k => k.trim()).filter(Boolean),
  visibility: a.visibility === 'internal' ? 'internal' : 'customer',
  bot_enabled: a.visibility === 'internal' ? false : !!a.bot_enabled,
  in_menu: a.visibility === 'internal' ? false : !!a.in_menu,
  sort: Number(a.sort) || 100,
})

export async function saveArticle(a) {
  const row = clean(a)
  if (!row.title) throw new Error('กรุณาใส่หัวข้อ')
  if (row.visibility === 'customer' && !row.body.trim() && !row.images.length) throw new Error('หัวข้อที่ส่งให้ลูกค้าต้องมีเนื้อหาหรือรูป')
  const q = a.id ? supabase.from('kb_articles').update(row).eq('id', a.id).select().single() : supabase.from('kb_articles').insert(row).select().single()
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data
}

export async function deleteArticle(id) {
  const { error } = await supabase.from('kb_articles').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/** images live in the public bot-assets bucket (LINE must be able to download them) */
export async function uploadKbImage(file) {
  if (!/^image\/(jpeg|png)$/.test(file?.type || '')) throw new Error('ใช้รูป JPG หรือ PNG เท่านั้น (LINE รับแค่ 2 แบบนี้)')
  if (file.size > 5 * 1024 * 1024) throw new Error('รูปใหญ่เกิน 5MB')
  const id = (crypto.randomUUID?.() || String(Date.now()))
  const path = `kb/${id}.${file.type === 'image/png' ? 'png' : 'jpg'}`
  const { error } = await supabase.storage.from('bot-assets').upload(path, file, { contentType: file.type })
  if (error) throw new Error('อัปโหลดรูปไม่สำเร็จ: ' + error.message)
  return supabase.storage.from('bot-assets').getPublicUrl(path).data.publicUrl
}

/** path inside bot-assets for a public URL we created (used when staff send the picture in chat) */
export function kbImagePath(url) {
  const m = /\/storage\/v1\/object\/public\/bot-assets\/(kb\/[^?#]+)$/.exec(url || '')
  return m ? m[1] : null
}

export function searchArticles(list, q, category) {
  const t = q.trim().toLowerCase()
  return list.filter(a => (!category || a.category === category) &&
    (!t || [a.title, a.body, a.staff_note, a.category, ...(a.keywords || [])].filter(Boolean).join(' ').toLowerCase().includes(t)))
}
