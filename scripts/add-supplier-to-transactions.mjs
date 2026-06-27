// Migration: add supplier_id column to transactions table
// Run: node scripts/add-supplier-to-transactions.mjs

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://qhhihhyboxorzlowfqza.supabase.co'
const SUPABASE_KEY = 'sb_publishable_VkLsT7WBbbpYbOGsaCEQsA_6q5cnVlM'
const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

// ทดสอบว่า column มีอยู่แล้วไหม
async function check() {
  const { data, error } = await sb
    .from('transactions')
    .select('supplier_id')
    .limit(1)
  if (!error) {
    console.log('✅ supplier_id column มีอยู่แล้ว')
    process.exit(0)
  }
  console.log('❌ ยังไม่มี supplier_id column')
  console.log('\n📋 กรุณารัน SQL นี้ใน Supabase Dashboard → SQL Editor:\n')
  console.log('ALTER TABLE transactions')
  console.log('  ADD COLUMN IF NOT EXISTS supplier_id UUID')
  console.log('  REFERENCES suppliers(id) ON DELETE SET NULL;')
  console.log('\nURL: https://supabase.com/dashboard/project/qhhihhyboxorzlowfqza/sql/new')
}

check()
