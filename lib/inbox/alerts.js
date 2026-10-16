// Chat alerts in the browser: unread badge, sound, and system notifications.
// Runs on every page of the app (mounted once in the dashboard layout).
//   - this device subscribed to Web Push → the server shows the notification
//     (works with the app closed); here we only play the sound and update badges
//   - otherwise, while any CScreen tab is open, we show the notification ourselves
import { supabase } from '@/lib/supabase'
import { VAPID_PUBLIC_KEY } from '@/lib/channels/alertKey'

const INBOX_ROLES = ['owner', 'admin', 'sales', 'designer']
const PREVIEW = { image: '📷 ส่งรูปภาพ', video: '🎞 ส่งวิดีโอ', audio: '🎵 ส่งข้อความเสียง', file: '📎 ส่งไฟล์', sticker: 'ส่งสติกเกอร์', location: '📍 ส่งตำแหน่ง' }

const listeners = new Set()
let version = 0
const state = { ready: false, allowed: false, unread: 0, permission: 'default', push: false, sound: true, supported: false, pushSupported: false, busy: false }
let me = null
let activeChat = null
let started = false
let audio = null

const emit = () => { version++; listeners.forEach(fn => fn()) }
export const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn) }
export const getVersion = () => version
export const alertState = () => state

/** the chat currently on screen (no alert for it while the tab is visible) */
export function setActiveChat(id) { activeChat = id || null }

const store = {
  get: k => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k, v) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } },
}

export const isIOS = () => typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)
export const isStandalone = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true)

// ── badge in the tab title: "(3) แชทลูกค้า | CSCREEN"
function paintTitle() {
  const base = document.title.replace(/^\(\d+\+?\)\s*/, '')
  const want = state.unread > 0 ? `(${state.unread > 99 ? '99+' : state.unread}) ${base}` : base
  if (document.title !== want) document.title = want
}

// ── short two-tone chime (no audio file); browsers allow it after the first tap/click
function unlockAudio() {
  if (audio || typeof window === 'undefined') return
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (Ctx) audio = new Ctx()
}
function chime() {
  if (!state.sound || !audio) return
  try {
    if (audio.state === 'suspended') audio.resume()
    const t = audio.currentTime
    for (const [i, f] of [[0, 880], [1, 1318]]) {
      const o = audio.createOscillator(), g = audio.createGain()
      o.frequency.value = f; o.type = 'sine'
      g.gain.setValueAtTime(0.0001, t + i * 0.14)
      g.gain.exponentialRampToValueAtTime(0.18, t + i * 0.14 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.14 + 0.25)
      o.connect(g).connect(audio.destination)
      o.start(t + i * 0.14); o.stop(t + i * 0.14 + 0.3)
    }
  } catch { /* sound is optional */ }
}

async function registration() {
  if (!('serviceWorker' in navigator)) return null
  try { return await navigator.serviceWorker.register('/sw.js') } catch { return null }
}

async function refreshUnread() {
  const { data } = await supabase.from('conversations').select('unread').gt('unread', 0).limit(1000)
  state.unread = (data || []).reduce((s, r) => s + (r.unread || 0), 0)
  paintTitle(); emit()
}

async function onIncoming(row) {
  if (row.direction !== 'in' || row.kind === 'system') return
  const looking = document.visibilityState === 'visible' && activeChat === row.conversation_id && location.pathname.startsWith('/inbox')
  if (looking) return
  const { data: c } = await supabase.from('conversations')
    .select('id, platform, assigned_to, customer:customers(name), identity:contact_identities(display_name)').eq('id', row.conversation_id).maybeSingle()
  if (c?.assigned_to && c.assigned_to !== me) return       // someone else's chat: badge only
  chime()
  if (state.push || state.permission !== 'granted') return  // push already shows it on this device
  const reg = await navigator.serviceWorker?.getRegistration()
  const title = `${c?.platform === 'line' ? 'LINE' : c?.platform || 'แชท'} · ${c?.customer?.name || c?.identity?.display_name || 'ลูกค้าใหม่'}`
  const body = row.kind === 'text' ? String(row.text || '').slice(0, 140) : PREVIEW[row.kind] || ''
  const opts = { body, tag: `chat-${row.conversation_id}`, renotify: true, icon: '/icon-192.png', data: { url: `/inbox?c=${row.conversation_id}` } }
  try {
    if (reg) await reg.showNotification(title, opts)
    else { const n = new Notification(title, opts); n.onclick = () => { window.focus(); location.href = opts.data.url } }
  } catch { /* some browsers block notifications from pages */ }
}

/** start once per page load (dashboard layout) */
export async function startChatAlerts() {
  if (started || typeof window === 'undefined') return
  started = true
  state.supported = 'Notification' in window
  state.pushSupported = 'serviceWorker' in navigator && 'PushManager' in window
  state.permission = state.supported ? Notification.permission : 'denied'
  state.sound = store.get('cs-chat-sound') !== 'off'
  window.addEventListener('pointerdown', unlockAudio, { once: true, capture: true })
  window.addEventListener('keydown', unlockAudio, { once: true, capture: true })

  const [{ data: u }, { data: role }] = await Promise.all([supabase.auth.getUser(), supabase.rpc('app_role')])
  me = u?.user?.id || null
  state.allowed = INBOX_ROLES.includes(role)
  state.ready = true
  if (!state.allowed) { emit(); return }

  const reg = await registration()
  const sub = await reg?.pushManager?.getSubscription().catch(() => null)
  state.push = !!sub
  await refreshUnread()

  new MutationObserver(paintTitle).observe(document.querySelector('title') || document.head, { childList: true, subtree: true, characterData: true })
  let t = null
  supabase.channel('chat-alerts')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'direction=eq.in' }, p => onIncoming(p.new))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => { clearTimeout(t); t = setTimeout(refreshUnread, 400) })
    .subscribe()
}

export function setSound(on) {
  state.sound = on; store.set('cs-chat-sound', on ? 'on' : 'off'); unlockAudio(); emit()
  if (on) chime()
}

const b64ToBytes = s => Uint8Array.from(atob((s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))

/** ask permission + subscribe this device to Web Push. Returns a Thai error text or null. */
export async function enableAlerts() {
  if (!state.supported) return 'เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน'
  if (isIOS() && !isStandalone()) return 'iPhone/iPad: กดปุ่มแชร์ → "เพิ่มไปยังหน้าจอโฮม" แล้วเปิด CScreen จากไอคอนนั้นก่อน จึงจะเปิดแจ้งเตือนได้'
  state.busy = true; emit()
  try {
    state.permission = await Notification.requestPermission()
    if (state.permission !== 'granted') return 'ยังไม่ได้อนุญาตการแจ้งเตือน — เปิดได้ที่การตั้งค่าเว็บไซต์ของเบราว์เซอร์'
    unlockAudio()
    if (!state.pushSupported) return null                   // tab-open alerts still work
    const reg = await registration()
    if (!reg) return null
    await navigator.serviceWorker.ready
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC_KEY) })
    const j = sub.toJSON()
    const { error } = await supabase.from('push_subscriptions').upsert(
      { user_id: me, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 200) },
      { onConflict: 'endpoint' })
    if (error) { await sub.unsubscribe(); return 'บันทึกเครื่องนี้ไม่สำเร็จ: ' + error.message }
    state.push = true
    return null
  } catch (e) {
    return 'เปิดแจ้งเตือนไม่สำเร็จ: ' + (e?.message || e)
  } finally { state.busy = false; emit() }
}

export async function disableAlerts() {
  state.busy = true; emit()
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    const sub = await reg?.pushManager?.getSubscription()
    if (sub) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
      await sub.unsubscribe()
    }
    state.push = false
  } finally { state.busy = false; emit() }
}
