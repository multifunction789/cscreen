// "New customer message" Web Push to staff phones/computers.
// VAPID public key is public (also used by the browser); the private key lives
// only in Vercel env VAPID_PRIVATE_KEY. Without it, alerts are skipped quietly.
import webpush from 'web-push'
import { VAPID_PUBLIC_KEY } from './alertKey.js'
const PREVIEW = { image: '📷 ส่งรูปภาพ', video: '🎞 ส่งวิดีโอ', audio: '🎵 ส่งข้อความเสียง', file: '📎 ส่งไฟล์', sticker: 'ส่งสติกเกอร์', location: '📍 ส่งตำแหน่ง' }

export function alertPayload({ conversationId, name, kind, text, platform = 'line' }) {
  const body = kind === 'text' ? String(text || '').slice(0, 140) : PREVIEW[kind] || String(text || '').slice(0, 140)
  return {
    title: `${platform === 'line' ? 'LINE' : platform} · ${name || 'ลูกค้าใหม่'}`,
    body,
    tag: `chat-${conversationId}`,          // one notification per chat, newer replaces older
    url: `/inbox?c=${conversationId}`,
  }
}

/**
 * Send to everyone who should hear about this chat (assignee, or all owner/admin/sales).
 * Never throws: a failed alert must not affect receiving the message.
 */
export async function sendChatAlerts(db, messageIds, { push = webpush.sendNotification.bind(webpush) } = {}) {
  const priv = process.env.VAPID_PRIVATE_KEY?.trim()
  if (!priv || !messageIds.length) return { sent: 0, skipped: !priv }
  const opts = { vapidDetails: { subject: 'https://cscreen.vercel.app', publicKey: VAPID_PUBLIC_KEY, privateKey: priv }, TTL: 3600, urgency: 'high' }
  let sent = 0
  try {
    const { data: msgs } = await db.from('messages')
      .select('id, kind, text, conversation_id, conversation:conversations(id, platform, customer:customers(name), identity:contact_identities(display_name))')
      .in('id', messageIds)
    // one alert per chat (latest message)
    const byConv = new Map()
    for (const m of msgs || []) if (m.kind !== 'system') byConv.set(m.conversation_id, m)
    for (const m of byConv.values()) {
      const c = m.conversation
      const payload = JSON.stringify(alertPayload({ conversationId: c.id, name: c.customer?.name || c.identity?.display_name, kind: m.kind, text: m.text, platform: c.platform }))
      const { data: subs } = await db.rpc('chat_alert_targets', { p_conversation_id: c.id })
      await Promise.all((subs || []).map(async s => {
        try {
          await push({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, opts)
          sent++
          await db.from('push_subscriptions').update({ last_ok_at: new Date().toISOString(), fail_count: 0 }).eq('id', s.id)
        } catch (e) {
          // 404/410 = the browser dropped this subscription → forget it
          if (e?.statusCode === 404 || e?.statusCode === 410) await db.from('push_subscriptions').delete().eq('id', s.id)
          else await db.from('push_subscriptions').update({ fail_count: (s.fail_count || 0) + 1 }).eq('id', s.id)
        }
      }))
    }
  } catch (e) {
    console.error('[chat alerts]', e?.message || e)
  }
  return { sent }
}
