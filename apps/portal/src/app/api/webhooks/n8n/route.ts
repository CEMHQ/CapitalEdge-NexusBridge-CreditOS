import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { n8nWebhookLimiter } from '@/lib/rate-limit/index'
import { applyRateLimit } from '@/lib/rate-limit/apply'
import { z } from 'zod'

// Supported actions n8n can call into the platform
const n8nActionSchema = z.discriminatedUnion('action', [
  z.object({
    action:          z.literal('create_task'),
    task_owner_type: z.string().trim().min(1),
    task_owner_id:   z.string().uuid(),
    title:           z.string().trim().min(2).max(200),
    description:     z.string().trim().max(1000).optional(),
    priority:        z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
    due_date:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    assigned_to:     z.string().uuid().nullable().optional(),
  }),
  z.object({
    action:              z.literal('send_notification'),
    recipient_profile_id: z.string().uuid(),
    subject:             z.string().trim().max(200).optional(),
    message:             z.string().trim().min(1).max(1000),
    link_url:            z.string().trim().max(500).optional(),
  }),
])

function verifyHmacSignature(
  body: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) return false
  // Node.js crypto — dynamic import for edge compatibility
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require('crypto') as typeof import('crypto')
    const expected = crypto
      .createHmac('sha256', secret)
      .update(body, 'utf8')
      .digest('hex')
    const sig = signature.startsWith('sha256=') ? signature.slice(7) : signature
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sig, 'hex'))
  } catch {
    return false
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text()

  // HMAC verification
  const secret = process.env.N8N_WEBHOOK_SECRET
  if (!secret) {
    console.error('[n8n-webhook] N8N_WEBHOOK_SECRET not configured')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  const signature = request.headers.get('x-n8n-signature')
  if (!verifyHmacSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // Rate limit by a fixed key ('n8n') — this endpoint has no user session
  const blocked = await applyRateLimit(n8nWebhookLimiter, 'n8n')
  if (blocked) return blocked

  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = n8nActionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid action', details: parsed.error.flatten() }, { status: 400 })
  }

  const adminClient = createAdminClient()

  if (parsed.data.action === 'create_task') {
    const { action: _action1, ...taskData } = parsed.data
    const { data, error } = await adminClient
      .from('tasks')
      .insert({ ...taskData, task_status: 'open', created_by: null })
      .select('id')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, task_id: data.id })
  }

  if (parsed.data.action === 'send_notification') {
    const { action: _action2, ...notifData } = parsed.data
    const { error } = await adminClient.from('notifications').insert({
      recipient_profile_id: notifData.recipient_profile_id,
      notification_type:    'in_app',
      subject:              notifData.subject ?? 'Notification',
      message:              notifData.message,
      link_url:             notifData.link_url ?? null,
      delivery_status:      'sent',
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unhandled action' }, { status: 400 })
}
