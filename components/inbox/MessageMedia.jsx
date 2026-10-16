'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// signed URLs for private chat files, shared by all bubbles (1 hour)
const cache = new Map()
function signedUrl(bucket, path) {
  const k = bucket + '/' + path
  if (!cache.has(k)) {
    cache.set(k, supabase.storage.from(bucket).createSignedUrl(path, 3600)
      .then(({ data, error }) => { if (error || !data?.signedUrl) throw new Error('no access'); return data.signedUrl })
      .catch(e => { cache.delete(k); throw e }))
  }
  return cache.get(k)
}

const ICON = { image: '🖼', video: '🎞', audio: '🎵', file: '📎' }

/** picture / video / voice / file inside a chat bubble */
export default function MessageMedia({ kind, attachment }) {
  const a = attachment || {}
  const stored = a.bucket && a.path
  const [url, setUrl] = useState(a.url || null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!stored) return
    let live = true
    signedUrl(a.bucket, a.path).then(u => { if (live) setUrl(u) }, () => { if (live) setFailed(true) })
    return () => { live = false }
  }, [stored, a.bucket, a.path])

  const label = `${ICON[kind] || '📎'} ${a.name || kind}`
  if (a.pending) return <div className="ib-attach">{label} <span className="ib-small">· กำลังดึงไฟล์จาก LINE…</span></div>
  if (failed) return <div className="ib-attach">{label} <span className="ib-small">· เปิดไฟล์ไม่ได้</span></div>
  if (!url) return <div className="ib-attach">{label}</div>
  if (kind === 'image') return (
    <a className="ib-media" href={url} target="_blank" rel="noopener noreferrer">
      {/* eslint-disable-next-line @next/next/no-img-element -- private signed URL, not optimisable */}
      <img src={url} alt={a.name || 'รูปจากลูกค้า'} loading="lazy" />
    </a>
  )
  if (kind === 'video') return <video className="ib-media" src={url} controls preload="metadata" />
  if (kind === 'audio') return <audio src={url} controls preload="metadata" />
  return <a className="ib-attach" href={url} target="_blank" rel="noopener noreferrer">{label}</a>
}
