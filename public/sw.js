/* CScreen service worker — chat alerts only (no offline caching). */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

// Web Push from the server: { title, body, tag, url }
self.addEventListener('push', event => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch { d = { title: 'CScreen', body: event.data && event.data.text() } }
  event.waitUntil(self.registration.showNotification(d.title || 'ข้อความใหม่จากลูกค้า', {
    body: d.body || '',
    tag: d.tag,
    renotify: true,
    icon: '/icon-192.png',
    badge: '/favicon-32.png',
    data: { url: d.url || '/inbox' },
  }))
})

// tap the alert → open (or focus) the chat
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = new URL((event.notification.data && event.notification.data.url) || '/inbox', self.location.origin).href
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const win = wins.find(w => new URL(w.url).origin === self.location.origin)
    if (win) { await win.focus(); return win.navigate(url) }
    return self.clients.openWindow(url)
  })())
})
