import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { SUPABASE_URL, SUPABASE_KEY } from '@/lib/supabaseConfig'

/**
 * ด่านล็อกอิน — ทุกหน้า (ยกเว้น /login) และทุก /api ต้องมี session ของ Supabase
 *   - หน้าเว็บ: ยังไม่ล็อกอิน → พาไป /login?next=<หน้าเดิม>
 *   - /api:     ยังไม่ล็อกอิน → 401
 * พร้อมต่ออายุ session (refresh token) ให้อัตโนมัติผ่าน cookie
 */
const PUBLIC_PAGES = ['/login']
// เรียกจากภายนอก ไม่มี session — ตรวจสิทธิ์เองในแต่ละ route (ลายเซ็น LINE / งานในคิว)
const PUBLIC_API = ['/api/channels/line', '/api/worker']

export async function proxy(request: NextRequest) {
  if (PUBLIC_API.includes(request.nextUrl.pathname)) return NextResponse.next()
  let response = NextResponse.next({ request })

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: list => {
        list.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  let loggedIn = false
  try {
    const { data, error } = await supabase.auth.getClaims()
    loggedIn = !error && !!data?.claims?.sub
  } catch {
    loggedIn = false
  }

  const { pathname, search } = request.nextUrl
  const isPublic = PUBLIC_PAGES.includes(pathname)

  if (!loggedIn && !isPublic) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 })
    }
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    if (pathname !== '/') url.searchParams.set('next', pathname + search)
    return withCookies(NextResponse.redirect(url), response)
  }

  if (loggedIn && isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    url.search = ''
    return withCookies(NextResponse.redirect(url), response)
  }

  return response
}

/** คัดลอก cookie ที่ Supabase เพิ่งต่ออายุ ไปใส่ใน response แบบ redirect ด้วย */
function withCookies(target: NextResponse, source: NextResponse) {
  source.cookies.getAll().forEach(c => target.cookies.set(c))
  return target
}

export const config = {
  matcher: [
    // ทุกเส้นทาง ยกเว้นไฟล์ระบบของ Next และไฟล์ static ใน /public
    '/((?!_next/static|_next/image|favicon\\.ico|manifest\\.json|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|txt)$).*)',
  ],
}
