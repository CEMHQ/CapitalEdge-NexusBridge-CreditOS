import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/format'
import Link from 'next/link'
import DeleteDocumentRowButton from '@/components/admin/DeleteDocumentRowButton'

export default async function AdminDocumentsPage() {
  const supabase = await createClient()

  const { data: documents } = await supabase
    .from('documents')
    .select(`
      id,
      uploaded_by,
      owner_type,
      owner_id,
      document_type,
      file_name,
      file_size_bytes,
      review_status,
      rejection_reason,
      created_at,
      profiles!uploaded_by (
        full_name,
        email
      )
    `)
    .eq('upload_status', 'uploaded')
    .order('created_at', { ascending: false })

  const docs = documents ?? []

  // ── Batch-enrich owner labels ──────────────────────────────────────────────
  // For owner_type='application': direct FK → application_number
  // For owner_type='borrower':    uploaded_by → borrowers.profile_id → applications

  const appIds = [...new Set(docs.filter(d => d.owner_type === 'application').map(d => d.owner_id))]
  const borrowerProfileIds = [...new Set(
    docs.filter(d => d.owner_type === 'borrower' && d.uploaded_by).map(d => d.uploaded_by as string)
  )]

  const [{ data: directApps }, { data: borrowers }] = await Promise.all([
    appIds.length
      ? supabase.from('applications').select('id, application_number').in('id', appIds)
      : Promise.resolve({ data: [] as { id: string; application_number: string }[] }),
    borrowerProfileIds.length
      ? supabase.from('borrowers').select('id, profile_id').in('profile_id', borrowerProfileIds)
      : Promise.resolve({ data: [] as { id: string; profile_id: string }[] }),
  ])

  const directAppMap = Object.fromEntries((directApps ?? []).map(a => [a.id, a.application_number]))

  // Fetch most-recent application per borrower
  const borrowerIds = (borrowers ?? []).map(b => b.id)
  const { data: borrowerApps } = borrowerIds.length
    ? await supabase
        .from('applications')
        .select('id, borrower_id, application_number')
        .in('borrower_id', borrowerIds)
        .order('created_at', { ascending: false })
    : { data: [] as { id: string; borrower_id: string; application_number: string }[] }

  // Build: profile_id → most-recent application
  const profileAppMap: Record<string, { id: string; application_number: string }> = {}
  for (const b of (borrowers ?? [])) {
    const app = (borrowerApps ?? []).find(a => a.borrower_id === b.id)
    if (app) profileAppMap[b.profile_id] = { id: app.id, application_number: app.application_number }
  }

  function getOwner(doc: { owner_type: string; owner_id: string; uploaded_by: string | null }) {
    if (doc.owner_type === 'application') {
      const num = directAppMap[doc.owner_id]
      return { label: num ?? 'Application', link: `/dashboard/admin/applications/${doc.owner_id}` }
    }
    if (doc.owner_type === 'borrower' && doc.uploaded_by) {
      const app = profileAppMap[doc.uploaded_by]
      if (app) return { label: app.application_number, link: `/dashboard/admin/applications/${app.id}` }
    }
    return { label: doc.owner_type.charAt(0).toUpperCase() + doc.owner_type.slice(1), link: null }
  }

  const enriched = docs.map(d => ({ ...d, owner: getOwner(d) }))

  const pending   = enriched.filter((d) => d.review_status === 'pending_review')
  const inReview  = enriched.filter((d) => d.review_status === 'under_review')
  const completed = enriched.filter((d) => ['verified', 'rejected'].includes(d.review_status))

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Document Review</h1>
        <p className="text-sm text-gray-500 mt-1">
          {pending.length} pending · {inReview.length} in review
        </p>
      </div>

      <DocumentTable title="Pending Review" documents={pending} />
      <DocumentTable title="In Review" documents={inReview} />
      <DocumentTable title="Completed" documents={completed} collapsed />
    </div>
  )
}

function DocumentTable({
  title,
  documents,
  collapsed = false,
}: {
  title: string
  documents: any[]
  collapsed?: boolean
}) {
  if (documents.length === 0 && collapsed) return null

  return (
    <div>
      <h2 className="text-base font-semibold text-gray-900 mb-3">
        {title}
        <span className="ml-2 text-sm font-normal text-gray-400">{documents.length}</span>
      </h2>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Document</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Uploaded By</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Associated With</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Uploaded</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {documents.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-sm text-gray-400">
                  No documents.
                </td>
              </tr>
            )}
            {documents.map((doc) => {
              const uploader = Array.isArray(doc.profiles) ? doc.profiles[0] : doc.profiles
              const owner = doc.owner as { label: string; link: string | null }
              return (
                <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium text-gray-900">{doc.file_name}</p>
                    <p className="text-xs text-gray-400">{formatFileSize(doc.file_size_bytes)}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-900">{uploader?.full_name ?? '—'}</p>
                    <p className="text-xs text-gray-400">{uploader?.email ?? '—'}</p>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {owner.link ? (
                      <Link href={owner.link} className="font-medium text-gray-900 hover:underline">
                        {owner.label}
                      </Link>
                    ) : (
                      <span className="text-gray-600 capitalize">{owner.label}</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 capitalize">
                    {doc.document_type.replace(/_/g, ' ')}
                  </td>
                  <td className="px-6 py-4">
                    <ReviewBadge status={doc.review_status} />
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {formatDate(doc.created_at)}
                  </td>
                  <td className="px-6 py-4">
                    <Link
                      href={`/dashboard/admin/documents/${doc.id}`}
                      className="text-sm text-gray-900 font-medium hover:underline"
                    >
                      Review
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <DeleteDocumentRowButton documentId={doc.id} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ReviewBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending_review: 'bg-amber-50 text-amber-700',
    under_review:   'bg-blue-50 text-blue-700',
    verified:       'bg-green-50 text-green-700',
    rejected:       'bg-red-50 text-red-700',
  }
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  return (
    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${colors[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {label}
    </span>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
