// Background work for chat channels (profile names, customer files, bot name).
// Tasks live in public.channel_tasks and are claimed with a lock, so they survive
// crashes and run at most once at a time. Called right after a webhook (Next `after`)
// and by /api/worker on a schedule as the safety net.
import * as line from './line.js'

export const MEDIA_BUCKET = 'chat-media'

export const handlers = {
  async 'line.profile'(p, { db, api }) {
    try {
      const pr = await api.profile(p.user_id)
      const { error } = await db.from('contact_identities')
        .update({ display_name: pr.displayName || null, picture_url: pr.pictureUrl || null }).eq('id', p.identity_id)
      if (error) throw new Error(error.message)
    } catch (e) {
      // 404 = customer blocked us / never added the OA: nothing more to fetch
      if (e instanceof line.LineError && e.status === 404) return
      throw e
    }
  },

  async 'line.content'(p, { db, api }) {
    const { bytes, mime } = await api.content(p.line_message_id)
    const name = p.name || `${p.kind || 'file'}.${line.extFor(mime)}`
    const path = `line/${p.conversation_id}/${p.message_id}.${line.extFor(mime, p.name)}`
    const up = await db.storage.from(MEDIA_BUCKET).upload(path, bytes, { contentType: mime, upsert: true })
    if (up.error) throw new Error('upload: ' + up.error.message)
    const { error } = await db.from('messages')
      .update({ attachment: { bucket: MEDIA_BUCKET, path, name, mime, size: bytes.length } }).eq('id', p.message_id)
    if (error) throw new Error(error.message)
  },

  async 'line.botinfo'(p, { db, api }) {
    const info = await api.botInfo()
    const { error } = await db.from('channel_accounts').update({ display_name: info.displayName || null }).eq('id', p.channel_account_id)
    if (error) throw new Error(error.message)
  },
}

/** Claim up to `limit` due tasks and run them. Returns { done, retry, dead }. */
export async function runTasks(db, { limit = 10, api = line, lockSeconds = 60 } = {}) {
  const { data: tasks, error } = await db.rpc('claim_channel_tasks', { p_limit: limit, p_lock_seconds: lockSeconds })
  if (error) throw new Error('claim: ' + error.message)
  const result = { done: 0, retry: 0, dead: 0 }
  for (const t of tasks || []) {
    let ok = true, err = null
    try {
      const h = handlers[t.kind]
      if (!h) throw new Error('unknown task ' + t.kind)
      await h(t.payload || {}, { db, api })
    } catch (e) { ok = false; err = e?.message || String(e) }
    const { data: after } = await db.rpc('complete_channel_task', { p_id: t.id, p_ok: ok, p_error: err })
    if (ok) result.done++
    else if (after?.status === 'dead') { result.dead++; console.error('[channel task dead]', t.kind, t.id, err) }
    else result.retry++
  }
  return result
}
