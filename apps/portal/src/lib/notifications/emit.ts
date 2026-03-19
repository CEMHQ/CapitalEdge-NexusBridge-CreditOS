import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

type NotificationParams = {
  recipientProfileId: string
  subject?: string
  message: string
  linkUrl?: string
}

// Fire-and-forget in-app notification insert.
// Never throws — errors are logged but do not surface to callers.
export async function emitNotification(params: NotificationParams): Promise<void> {
  try {
    const adminClient = createAdminClient()
    await adminClient.from('notifications').insert({
      recipient_profile_id: params.recipientProfileId,
      notification_type:    'in_app',
      subject:              params.subject ?? null,
      message:              params.message,
      link_url:             params.linkUrl ?? null,
      delivery_status:      'sent',
      sent_at:              new Date().toISOString(),
    })
  } catch (err) {
    console.error('[notifications] Failed to emit notification:', err)
  }
}
