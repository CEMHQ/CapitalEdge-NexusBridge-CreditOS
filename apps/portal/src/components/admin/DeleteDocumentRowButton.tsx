'use client'

import { useRouter } from 'next/navigation'
import DeleteButton from './DeleteButton'

export default function DeleteDocumentRowButton({ documentId }: { documentId: string }) {
  const router = useRouter()
  return (
    <DeleteButton
      confirmMessage="Permanently delete this document and remove it from storage?"
      onDelete={async () => {
        const res = await fetch(`/api/documents/${documentId}`, { method: 'DELETE' })
        const data = await res.json()
        if (!res.ok) return { error: data.error ?? 'Delete failed' }
      }}
      onSuccess={() => router.refresh()}
    />
  )
}
