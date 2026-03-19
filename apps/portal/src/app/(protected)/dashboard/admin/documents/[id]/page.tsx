'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

type Doc = {
  id: string
  file_name: string
  document_type: string
  review_status: string
  rejection_reason: string | null
  file_size_bytes: number
  owner_type: string
  created_at: string
  reviewed_at: string | null
  download_url: string | null
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending_review: 'bg-amber-50 text-amber-700 border-amber-200',
    under_review:   'bg-blue-50 text-blue-700 border-blue-200',
    verified:       'bg-green-50 text-green-700 border-green-200',
    rejected:       'bg-red-50 text-red-700 border-red-200',
  }
  const label: Record<string, string> = {
    pending_review: 'Pending Review',
    under_review:   'Under Review',
    verified:       'Verified',
    rejected:       'Rejected',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors[status] ?? 'bg-gray-50 text-gray-700 border-gray-200'}`}>
      {label[status] ?? status}
    </span>
  )
}

export default function AdminDocumentReviewPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [doc, setDoc]                     = useState<Doc | null>(null)
  const [loading, setLoading]             = useState(true)
  const [submitting, setSubmitting]       = useState(false)
  const [downloading, setDownloading]     = useState(false)
  const [rejectionReason, setRejection]   = useState('')
  const [error, setError]                 = useState<string | null>(null)
  const [successMsg, setSuccessMsg]       = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/documents/${id}`)
      .then((r) => r.json())
      .then((data) => { setDoc(data); setLoading(false) })
      .catch(() => { setError('Failed to load document.'); setLoading(false) })
  }, [id])

  async function handleDownload() {
    if (!doc?.download_url) return
    setDownloading(true)
    try {
      const res  = await fetch(doc.download_url)
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = doc.file_name
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Download failed. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  async function submit(reviewStatus: 'verified' | 'rejected') {
    setSubmitting(true)
    setError(null)
    const res = await fetch(`/api/documents/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        review_status:    reviewStatus,
        rejection_reason: reviewStatus === 'rejected' ? rejectionReason || null : null,
      }),
    })
    setSubmitting(false)
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Something went wrong.')
      return
    }
    setSuccessMsg(reviewStatus === 'verified' ? 'Document verified.' : 'Document rejected.')
    setDoc((prev) => prev ? { ...prev, review_status: reviewStatus } : prev)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-gray-400">
        Loading…
      </div>
    )
  }

  if (!doc || (doc as any).error) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/admin/documents" className="text-sm text-gray-500 hover:text-gray-900">
          ← Back to Documents
        </Link>
        <p className="text-sm text-red-600">Document not found.</p>
      </div>
    )
  }

  const isReviewed = ['verified', 'rejected'].includes(doc.review_status)

  return (
    <div className="max-w-2xl space-y-6">
      {/* Back */}
      <Link href="/dashboard/admin/documents" className="text-sm text-gray-500 hover:text-gray-900">
        ← Back to Documents
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 break-all">{doc.file_name}</h1>
          <p className="text-sm text-gray-500 mt-0.5 capitalize">
            {doc.document_type.replace(/_/g, ' ')} · {formatFileSize(doc.file_size_bytes)}
          </p>
        </div>
        <StatusBadge status={doc.review_status} />
      </div>

      {/* Document card */}
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        <div className="px-6 py-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Owner type</p>
            <p className="font-medium text-gray-900 capitalize">{doc.owner_type}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Uploaded</p>
            <p className="font-medium text-gray-900">{new Date(doc.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</p>
          </div>
          {doc.reviewed_at && (
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Reviewed</p>
              <p className="font-medium text-gray-900">{new Date(doc.reviewed_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</p>
            </div>
          )}
          {doc.rejection_reason && (
            <div className="col-span-2">
              <p className="text-xs text-gray-500 mb-0.5">Rejection reason</p>
              <p className="text-gray-700">{doc.rejection_reason}</p>
            </div>
          )}
        </div>

        {/* Download */}
        {doc.download_url && (
          <div className="px-6 py-4">
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="inline-flex items-center gap-2 text-sm font-medium text-gray-900 hover:underline disabled:opacity-50"
            >
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
              </svg>
              {downloading ? 'Downloading…' : 'Download document'}
            </button>
          </div>
        )}
      </div>

      {/* Review form — only shown if not yet reviewed */}
      {!isReviewed && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">Review Decision</h2>

          <div>
            <label className="block text-xs text-gray-500 mb-1.5">
              Rejection reason <span className="text-gray-400">(required if rejecting)</span>
            </label>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejection(e.target.value)}
              placeholder="Describe why the document is not acceptable…"
              rows={3}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button
              onClick={() => submit('verified')}
              disabled={submitting}
              className="flex-1 bg-gray-900 text-white text-sm font-medium py-2.5 rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Saving…' : 'Verify document'}
            </button>
            <button
              onClick={() => submit('rejected')}
              disabled={submitting || !rejectionReason.trim()}
              className="flex-1 bg-white text-red-600 border border-red-200 text-sm font-medium py-2.5 rounded-lg hover:bg-red-50 disabled:opacity-40 transition-colors"
            >
              Reject document
            </button>
          </div>
        </div>
      )}

      {/* Already reviewed */}
      {isReviewed && !successMsg && (
        <div className={`rounded-xl border px-6 py-4 text-sm ${doc.review_status === 'verified' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          This document has already been <strong>{doc.review_status}</strong>.
        </div>
      )}

      {successMsg && (
        <div className="rounded-xl border bg-green-50 border-green-200 px-6 py-4 flex items-center justify-between">
          <p className="text-sm text-green-800 font-medium">{successMsg}</p>
          <button onClick={() => router.push('/dashboard/admin/documents')} className="text-sm text-green-700 underline">
            Back to queue
          </button>
        </div>
      )}
    </div>
  )
}
