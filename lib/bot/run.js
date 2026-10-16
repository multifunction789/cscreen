// Server side of the bot: load the shop's settings, decide, answer with the free
// LINE Reply API and record what was said. Never pushes (push costs quota).
import { decide } from './engine.js'
import * as line from '../channels/line.js'

let cache = null
export async function loadBotConfig(db, { maxAgeMs = 30_000 } = {}) {
  if (cache && Date.now() - cache.at < maxAgeMs) return cache.value
  const [s, r, p] = await Promise.all([
    db.from('bot_settings').select('*').maybeSingle(),
    db.from('bot_rules').select('id, title, kind, keywords, answer, in_menu, enabled, sort').eq('enabled', true),
    db.from('bot_prices').select('product, technique, min_qty, price_from, note, enabled').eq('enabled', true),
  ])
  const value = { settings: s.data || { enabled: false }, rules: r.data || [], prices: p.data || [] }
  cache = { at: Date.now(), value }
  return value
}
export const clearBotCache = () => { cache = null }

/**
 * jobs: [{ conversationId, messageId?, replyToken, event: { type, kind, text, data }, conv: { botActive, handoffAt } }]
 * Only the newest event per chat is answered. Returns message ids the bot fully answered
 * (staff need no push alert for those).
 */
export async function runBot(db, jobs, { api = line } = {}) {
  const answered = new Set()
  if (!jobs.length) return answered
  let cfg
  try { cfg = await loadBotConfig(db) } catch (e) { console.error('[bot] config', e?.message); return answered }
  if (!cfg.settings.enabled) return answered

  const lastPerChat = new Map()
  for (const j of jobs) if (j.replyToken) lastPerChat.set(j.conversationId, j)
  for (const j of lastPerChat.values()) {
    const out = decide(j.event, { ...cfg, conv: j.conv })
    if (!out) continue
    try {
      await api.reply(j.replyToken, out.messages)
    } catch (e) {
      console.error('[bot] reply failed', e?.message)        // token expired etc. — staff will answer
      continue
    }
    const { error } = await db.rpc('record_bot_reply', { p_conversation_id: j.conversationId, p_texts: out.record, p_rule_id: out.ruleId, p_handoff: out.handoff })
    if (error) console.error('[bot] record', error.message)
    if (!out.alert && j.messageId) answered.add(j.messageId)
  }
  return answered
}
