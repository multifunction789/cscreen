// One-time migration: rename all old codes (e.g. INV-0001) → new codes (INV-1001)
// Run: node scripts/migrate-codes.mjs

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://qhhihhyboxorzlowfqza.supabase.co'
const SUPABASE_KEY = 'sb_publishable_VkLsT7WBbbpYbOGsaCEQsA_6q5cnVlM'
const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

const TABLES = [
  { table: 'invoices',   prefix: 'INV-', col: 'code' },
  { table: 'quotations', prefix: 'QT-',  col: 'code' },
  { table: 'job_orders', prefix: 'JO-',  col: 'code' },
  { table: 'receipts',   prefix: 'REC-', col: 'code' },
  { table: 'stock_in',   prefix: 'SI-',  col: 'code' },
]

async function migrate() {
  for (const { table, prefix, col } of TABLES) {
    const { data, error } = await sb.from(table).select(`id, ${col}`)
    if (error) { console.error(`❌ ${table}:`, error.message); continue }
    if (!data?.length) { console.log(`⏭  ${table}: ไม่มีข้อมูล`); continue }

    const toUpdate = data.filter(r => {
      const num = parseInt(r[col]?.replace(prefix, '') || '0')
      return r[col]?.startsWith(prefix) && num < 1000
    })

    if (!toUpdate.length) { console.log(`✅ ${table}: ไม่มีรายการที่ต้องแก้`); continue }

    console.log(`🔄 ${table}: พบ ${toUpdate.length} รายการ กำลังอัปเดต...`)

    for (const r of toUpdate) {
      const num     = parseInt(r[col].replace(prefix, ''))
      const newCode = prefix + String(num + 1000).padStart(4, '0')
      const { error: err } = await sb.from(table).update({ [col]: newCode }).eq('id', r.id)
      if (err) console.error(`  ❌ ${r[col]} → ${newCode}:`, err.message)
      else     console.log(`  ✓ ${r[col]} → ${newCode}`)
    }
  }
  console.log('\n🎉 เสร็จแล้ว')
}

migrate()
