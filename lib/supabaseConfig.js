// ค่าเชื่อมต่อ Supabase (publishable key — เปิดเผยได้ ความปลอดภัยของข้อมูลอยู่ที่ RLS + การล็อกอิน)
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qhhihhyboxorzlowfqza.supabase.co'
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_VkLsT7WBbbpYbOGsaCEQsA_6q5cnVlM'
