'use client'

import { useRouter } from 'next/navigation'
import DeleteButton from './DeleteButton'

export default function DeleteApplicationRowButton({ applicationId }: { applicationId: string }) {
  const router = useRouter()
  return (
    <DeleteButton
      confirmMessage="Permanently delete this application and all related data?"
      onDelete={async () => {
        const res = await fetch(`/api/applications/${applicationId}`, { method: 'DELETE' })
        const data = await res.json()
        if (!res.ok) return { error: data.error ?? 'Delete failed' }
      }}
      onSuccess={() => router.refresh()}
    />
  )
}
