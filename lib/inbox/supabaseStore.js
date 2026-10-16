// Phase 3 store: Unified Inbox over the real Supabase tables (see model.js for the interface).
// Reads are cached and refreshed through Realtime; every change goes through RLS or a
// SECURITY DEFINER RPC, so the browser can do only what the user's role allows.
import { supabase } from '@/lib/supabase'
import { computeReceivables } from '@/lib/receivables'

const AVATARS = ['#06C755', '#0866FF', '#7C3AED', '#F59E0B', '#DB2777', '#0D9488', '#B80F0B', '#4B5563']
const avatarFor = id => AVATARS[[...String(id)].reduce((s, ch) => s + ch.charCodeAt(0), 0) % AVATARS.length]
const KIND = { 'นิติบุคคล': 'company' }

const toCustomer = c => c && ({
  id: c.id, code: c.code, name: c.name, kind: KIND[c.type] || 'person', type: c.type, phone: c.phone, email: c.email,
  taxId: c.tax_id, address: c.address, shippingAddress: c.shipping_address, notes: c.notes, contactPerson: c.contact_person,
})

const CONV_SELECT = 'id, platform, customer_id, status, assigned_to, unread, last_message_at, last_message_text, last_inbound_at, follow_up_at, bot_active, ' +
  'identity:contact_identities(id, external_id, display_name, picture_url, link_evidence), ' +
  'customer:customers(id, code, name, type, phone, email, tax_id, address, shipping_address, notes, contact_person)'

export function createSupabaseStore() {
  const listeners = new Set()
  const emit = e => listeners.forEach(fn => fn(e))
  const state = {
    loaded: false, error: null, conversations: [], deals: {}, messages: {}, notes: {}, summaries: {},
    channels: [], staff: [], me: null,
  }
  const loading = { messages: new Set(), notes: new Set(), summaries: new Set() }

  const mapConv = c => {
    const d = state.deals[c.id]
    return {
      id: c.id, platform: c.platform, status: c.status, assignedTo: c.assigned_to, unread: c.unread,
      lastMessageAt: c.last_message_at || c.created_at || new Date(0).toISOString(), lastMessageText: c.last_message_text || '',
      lastInboundAt: c.last_inbound_at, followUpAt: c.follow_up_at, botActive: c.bot_active,
      contact: { id: c.identity?.id, displayName: c.identity?.display_name || c.identity?.external_id || 'ไม่ทราบชื่อ', avatar: avatarFor(c.identity?.id || c.id) },
      customerId: c.customer_id, customer: c.customer ? { ...toCustomer(c.customer), ...summaryFields(c.customer_id) } : null,
      linkEvidence: c.identity?.link_evidence,
      deal: d ? { id: d.id, stage: d.stage, value: d.value, quotation: d.quotation?.code, invoice: d.invoice?.code } : { stage: 'New Lead' },
    }
  }
  const summaryFields = id => {
    const s = state.summaries[id]
    return s ? { outstanding: s.outstanding, linked: s.linked } : {}
  }

  async function loadConversations() {
    const { data, error } = await supabase.from('conversations').select(CONV_SELECT).order('last_message_at', { ascending: false, nullsFirst: false }).limit(300)
    if (error) { state.error = error.message; state.loaded = true; emit({ type: 'error' }); return }
    state.conversations = data || []
    const ids = state.conversations.map(c => c.id)
    if (ids.length) {
      const { data: deals } = await supabase.from('deals').select('id, conversation_id, stage, value, quotation:quotations(code), invoice:invoices(code)').in('conversation_id', ids)
      state.deals = Object.fromEntries((deals || []).map(d => [d.conversation_id, d]))
    }
    state.loaded = true
    emit({ type: 'conversations' })
  }

  async function loadMessages(id) {
    if (loading.messages.has(id)) return
    loading.messages.add(id)
    const { data } = await supabase.from('messages').select('*').eq('conversation_id', id).order('created_at').limit(500)
    loading.messages.delete(id)
    state.messages[id] = (data || []).map(m => ({
      id: m.id, conversationId: m.conversation_id, direction: m.direction, kind: m.kind, text: m.text || '', attachment: m.attachment,
      document: m.document, createdAt: m.created_at, status: m.status === 'received' ? 'sent' : m.status, sentBy: m.sent_by_bot ? 'bot' : m.sent_by, clientKey: m.client_key,
    }))
    emit({ type: 'message', conversationId: id })
  }

  async function loadNotes(id) {
    if (loading.notes.has(id)) return
    loading.notes.add(id)
    const { data } = await supabase.from('conversation_notes').select('*').eq('conversation_id', id).order('created_at')
    loading.notes.delete(id)
    state.notes[id] = (data || []).map(n => ({ id: n.id, conversationId: n.conversation_id, author: n.author, text: n.text, createdAt: n.created_at }))
    emit({ type: 'note', conversationId: id })
  }

  async function loadSummary(customerId) {
    if (!customerId || loading.summaries.has(customerId)) return
    loading.summaries.add(customerId)
    const [q, inv, rec, jobs, ids] = await Promise.all([
      supabase.from('quotations').select('id, code, total, status, document_date, created_at').eq('customer_id', customerId).order('created_at', { ascending: false }).limit(20),
      supabase.from('invoices').select('id, code, total, status, document_date, due_date, deposit_pct, deposit_amount, created_at').eq('customer_id', customerId).order('created_at', { ascending: false }).limit(50),
      supabase.from('receipts').select('id, code, total, paid, invoice_id, created_at').eq('customer_id', customerId).order('created_at', { ascending: false }).limit(50),
      supabase.from('job_orders').select('id, code, status, invoice_id, due_date, created_at').eq('customer_id', customerId).order('created_at', { ascending: false }).limit(50),
      supabase.from('contact_identities').select('platform').eq('customer_id', customerId),
    ])
    loading.summaries.delete(customerId)
    const r = computeReceivables(inv.data || [], rec.data || [], jobs.data || [])
    state.summaries[customerId] = {
      outstanding: r.total, linked: [...new Set((ids.data || []).map(x => x.platform))],
      quotations: q.data || [], invoices: inv.data || [], receipts: rec.data || [], jobs: jobs.data || [],
    }
    emit({ type: 'conversation' })
  }

  async function init() {
    const [{ data: u }, staff, channels] = await Promise.all([
      supabase.auth.getUser(),
      supabase.rpc('list_job_assignees'),
      supabase.rpc('list_channel_status'),
    ])
    state.me = u?.user?.id || null
    state.staff = (staff.data || []).map(s => ({ id: s.id, name: s.full_name || 'ไม่มีชื่อ' }))
    state.channels = channels.data || []
    await loadConversations()
    try {
      let t = null
      const refresh = (payload) => {
        const cid = payload.new?.conversation_id || payload.old?.conversation_id
        if (cid && payload.table === 'messages') loadMessages(cid)
        if (cid && payload.table === 'conversation_notes') loadNotes(cid)
        clearTimeout(t); t = setTimeout(loadConversations, 300)
      }
      supabase.channel('inbox')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, refresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, refresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_notes' }, refresh)
        .subscribe()
    } catch { /* realtime is optional: the page still works with manual refresh */ }
  }
  init()

  const store = {
    kind: 'live',
    get loaded() { return state.loaded },
    get error() { return state.error },
    get connected() { return state.channels.some(c => c.status === 'connected') },
    get staff() { return state.staff },
    get me() { return state.me },
    lineQuota: null, // phase 4 reads the real quota from LINE
    canSend: platform => state.channels.some(c => c.platform === platform && c.status === 'connected'),
    channelStatus: platform => state.channels.find(c => c.platform === platform)?.status || 'not_connected',
    listConversations: () => state.conversations.map(mapConv),
    listMessages: id => { if (!state.messages[id]) { state.messages[id] = []; loadMessages(id) } return state.messages[id] },
    peekMessages: id => state.messages[id] || [], // search only what is loaded (no request per chat)
    listNotes: id => { if (!state.notes[id]) { state.notes[id] = []; loadNotes(id) } return state.notes[id] },
    customerSummary: id => { if (id && !state.summaries[id]) loadSummary(id); return state.summaries[id] || null },
    async send() { throw new Error('ยังไม่ได้เชื่อมต่อช่องทางนี้ — ส่งข้อความได้หลังเชื่อมต่อจริง (เฟส 4)') },
    async addNote(id, text) {
      const { error } = await supabase.from('conversation_notes').insert({ conversation_id: id, text, author: state.me })
      if (error) throw new Error(error.message)
      await loadNotes(id)
    },
    async update(id, patch) {
      const row = {}
      if ('assignedTo' in patch) row.assigned_to = patch.assignedTo
      if ('status' in patch) row.status = patch.status
      if ('followUpAt' in patch) row.follow_up_at = patch.followUpAt
      if (Object.keys(row).length) {
        const { error } = await supabase.from('conversations').update(row).eq('id', id)
        if (error) throw new Error(error.message)
      }
      if (patch.deal) {
        const cur = state.deals[id]
        const conv = state.conversations.find(c => c.id === id)
        const { error } = cur
          ? await supabase.from('deals').update({ stage: patch.deal.stage }).eq('id', cur.id)
          : await supabase.from('deals').insert({ conversation_id: id, customer_id: conv?.customer_id || null, stage: patch.deal.stage, owner: state.me })
        if (error) throw new Error(error.message)
      }
      await loadConversations()
    },
    async findCandidates({ phone, taxId, email, name }) {
      const { data, error } = await supabase.rpc('find_customer_candidates', { p_phone: phone || null, p_tax_id: taxId || null, p_email: email || null, p_name: name || null })
      if (error) throw new Error(error.message)
      return data || []
    },
    async linkCustomer(id, customerId, evidence) {
      const { error } = await supabase.rpc('link_conversation_customer', { p_conversation_id: id, p_customer_id: customerId, p_evidence: evidence })
      if (error) throw new Error(error.message)
      if (customerId) delete state.summaries[customerId]
      await loadConversations()
    },
    async createCustomer(id, form) {
      const { data, error } = await supabase.rpc('create_customer_for_conversation', {
        p_conversation_id: id,
        p_data: { name: form.name, type: form.kind === 'company' ? 'นิติบุคคล' : 'บุคคลธรรมดา', phone: form.phone, email: form.email, tax_id: form.taxId,
          address: form.address, shipping_address: form.shippingAddress, notes: form.notes },
      })
      if (error) throw new Error(error.message)
      // same as the customer page: give the new customer a Drive folder (optional)
      try {
        const { createCustomerFolderClient } = await import('@/lib/driveClient')
        const { folderId } = await createCustomerFolderClient(data.code, data.name)
        if (folderId) await supabase.from('customers').update({ drive_folder_id: folderId }).eq('id', data.id)
      } catch { /* Drive is optional */ }
      await loadConversations()
      return data
    },
    async updateCustomer(id, form) {
      const conv = state.conversations.find(c => c.id === id)
      const { error } = await supabase.from('customers').update({
        name: form.name, type: form.kind === 'company' ? 'นิติบุคคล' : 'บุคคลธรรมดา', phone: form.phone || null, email: form.email || null,
        tax_id: form.taxId || null, address: form.address || null, shipping_address: form.shippingAddress || null, notes: form.notes || null,
      }).eq('id', conv.customer_id)
      if (error) throw new Error(error.message)
      await loadConversations()
    },
    markRead(id) {
      const c = state.conversations.find(x => x.id === id)
      if (!c?.unread) return
      c.unread = 0
      emit({ type: 'conversation', conversationId: id })
      supabase.rpc('mark_conversation_read', { p_conversation_id: id }).then(() => {})
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
  }
  return store
}
