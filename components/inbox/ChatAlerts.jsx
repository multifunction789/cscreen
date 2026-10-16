'use client'
import { useEffect, useSyncExternalStore } from 'react'
import { startChatAlerts, subscribe, getVersion, alertState } from '@/lib/inbox/alerts'

/** live alert state (unread count, permission, push, sound) */
export function useChatAlerts() {
  useSyncExternalStore(subscribe, getVersion, () => 0)
  return alertState()
}

/** mounted once in the dashboard layout: badge + sound + notifications on every page */
export default function ChatAlerts() {
  useEffect(() => { startChatAlerts() }, [])
  return null
}
