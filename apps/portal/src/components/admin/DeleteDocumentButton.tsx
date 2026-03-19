'use client'

import { useRouter } from 'next/navigation'
import DeleteButton from './DeleteButton'

export default function DeleteDocumentButton({ documentId }: { documentId: string }) {
  const router = useRouter()
  return (
    <DeleteButton
      confirmMessage="This will permanently delete the document and remove it from storage."
      onDelete={async () => {
        const res = await fetch(`/api/documents/${documentId}`, { method: 'DELETE' })
        const data = await res.json()
        if (!res.ok) return { error: data.error ?? 'Delete failed' }
      }}
      onSuccess={() => router.push('/dashboard/admin/documents')}
    />
  )
}
