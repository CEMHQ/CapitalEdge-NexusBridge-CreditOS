'use client'

import { useRouter } from 'next/navigation'
import DeleteButton from '@/components/admin/DeleteButton'

export default function DeleteWorkflowButton({ triggerId }: { triggerId: string }) {
  const router = useRouter()

  return (
    <DeleteButton
      label="Delete"
      confirmMessage="Delete this workflow trigger?"
      onDelete={async () => {
        const res = await fetch(`/api/admin/workflows/${triggerId}`, { method: 'DELETE' })
        const data = await res.json()
        if (!res.ok) return { error: data.error ?? 'Delete failed' }
      }}
      onSuccess={() => router.refresh()}
    />
  )
}
