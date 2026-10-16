import { pushMessage, jobStatusFlex, NOTIFY_STATUSES } from '@/lib/line'
import { supabaseAdmin, requireUser } from '@/lib/supabaseAdmin'

/**
 * POST /api/line/notify-status — แจ้งลูกค้าทาง LINE เมื่อสถานะ Job Order เปลี่ยน
 * Header: Authorization: Bearer <supabase access token ของพนักงาน>
 * Body: { jobOrderId }
 * ส่งเฉพาะสถานะใน NOTIFY_STATUSES และไม่ส่งซ้ำสถานะเดิม
 */
export async function POST(req) {
  try {
    if (!(await requireUser(req))) return Response.json({ error: 'unauthorized' }, { status: 401 })
    const { jobOrderId } = await req.json()
    if (!jobOrderId) return Response.json({ error: 'jobOrderId required' }, { status: 400 })

    const db = supabaseAdmin()
    const { data: job, error } = await db
      .from('job_orders')
      .select('id, code, status, item_desc, due_date, line_notified_status, customers(line_user_id)')
      .eq('id', jobOrderId).single()
    if (error) throw error

    const to = job.customers?.line_user_id
    if (!to) return Response.json({ sent: false, reason: 'customer not linked to LINE' })
    if (!NOTIFY_STATUSES.includes(job.status)) return Response.json({ sent: false, reason: 'status not notified' })
    if (job.line_notified_status === job.status) return Response.json({ sent: false, reason: 'already sent' })

    await pushMessage(to, [jobStatusFlex(job)])
    await db.from('job_orders').update({ line_notified_status: job.status }).eq('id', job.id)
    return Response.json({ sent: true })
  } catch (err) {
    console.error('[line/notify-status]', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
