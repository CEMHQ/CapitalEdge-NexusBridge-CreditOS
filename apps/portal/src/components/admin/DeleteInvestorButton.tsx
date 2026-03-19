'use client'

import { useRouter } from 'next/navigation'
import DeleteButton from './DeleteButton'

export default function DeleteInvestorButton({ investorId }: { investorId: string }) {
  const router = useRouter()
  return (
    <DeleteButton
      confirmMessage="Permanently delete this investor record?"
      onDelete={async () => {
        const res = await fetch(`/api/admin/investors/${investorId}`, { method: 'DELETE' })
        const data = await res.json()
        if (!res.ok) return { error: data.error ?? 'Delete failed' }
      }}
      onSuccess={() => router.refresh()}
    />
  )
}
