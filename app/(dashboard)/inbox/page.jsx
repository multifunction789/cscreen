import InboxApp from '@/components/inbox/InboxApp'

export const metadata = { title: 'แชทลูกค้า | CSCREEN' }

// ?c=<conversation id> opens that chat (links from message alerts)
export default async function InboxPage({ searchParams }) {
  const { c } = await searchParams
  const id = typeof c === 'string' ? c : null
  return <InboxApp key={id || 'inbox'} initialId={id} />
}
