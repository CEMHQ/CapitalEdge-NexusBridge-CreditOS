'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const DOCUMENT_TYPES = [
  { value: 'id',              label: 'Government-Issued ID' },
  { value: 'bank_statement',  label: 'Bank Statement' },
  { value: 'tax_return',      label: 'Tax Return' },
  { value: 'appraisal',       label: 'Property Appraisal' },
  { value: 'insurance',       label: 'Insurance Certificate' },
  { value: 'title_report',    label: 'Title Report' },
  { value: 'agreement',       label: 'Agreement / Contract' },
]

type UploadState = 'idle' | 'uploading' | 'success' | 'error'

type Doc = {
  id: string
  file_name: string
  document_type: string
  review_status: string
  rejection_reason: string | null
  file_size_bytes: number
  created_at: string
}

const STATUS_CONFIG: Record<string, { label: string; classes: string }> = {
  pending_review: { label: 'Pending Review',  classes: 'bg-amber-50 text-amber-700 border-amber-200' },
  under_review:   { label: 'Under Review',    classes: 'bg-blue-50 text-blue-700 border-blue-200' },
  verified:       { label: 'Verified',        classes: 'bg-green-50 text-green-700 border-green-200' },
  rejected:       { label: 'Rejected',        classes: 'bg-red-50 text-red-700 border-red-200' },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, classes: 'bg-gray-50 text-gray-700 border-gray-200' }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${cfg.classes}`}>
      {cfg.label}
    </span>
  )
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function BorrowerDocumentsPage() {
  const [documentType, setDocumentType] = useState(DOCUMENT_TYPES[0].value)
  const [uploadState, setUploadState]   = useState<UploadState>('idle')
  const [errorMsg, setErrorMsg]         = useState<string | null>(null)
  const [docs, setDocs]                 = useState<Doc[]>([])
  const [loadingDocs, setLoadingDocs]   = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)

  async function fetchDocs() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('documents')
      .select('id, file_name, document_type, review_status, rejection_reason, file_size_bytes, created_at')
      .eq('uploaded_by', user.id)
      .eq('upload_status', 'uploaded')
      .order('created_at', { ascending: false })
    setDocs(data ?? [])
    setLoadingDocs(false)
  }

  useEffect(() => { fetchDocs() }, [])

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file) return

    setUploadState('uploading')
    setErrorMsg(null)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // 1. Request a signed upload URL from the API
      const res = await fetch('/api/documents/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner_type:      'borrower',
          owner_id:        user.id,
          document_type:   documentType,
          file_name:       file.name,
          mime_type:       file.type,
          file_size_bytes: file.size,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Failed to get upload URL')
      }

      const { document_id, upload_url } = await res.json()

      // 2. Upload directly to Supabase Storage
      const uploadRes = await fetch(upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      })

      if (!uploadRes.ok) throw new Error('Upload to storage failed')

      // 3. Confirm upload
      await fetch(`/api/documents/${document_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm' }),
      })

      setUploadState('success')
      if (fileRef.current) fileRef.current.value = ''
      fetchDocs() // refresh list
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed')
      setUploadState('error')
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Documents</h1>
        <p className="text-sm text-gray-500 mt-1">
          Upload and track documents required for your loan application.
        </p>
      </div>

      {/* Upload form */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Upload a Document</h2>
        <form onSubmit={handleUpload} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Document Type</label>
            <select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              {DOCUMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">File</label>
            <input
              ref={fileRef}
              type="file"
              required
              accept="application/pdf,image/jpeg,image/jpg,image/png,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-gray-900 file:text-white hover:file:bg-gray-700"
            />
            <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG, DOC, DOCX — max 50 MB</p>
          </div>

          {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
          {uploadState === 'success' && (
            <p className="text-sm text-green-600">Document uploaded successfully.</p>
          )}

          <button
            type="submit"
            disabled={uploadState === 'uploading'}
            className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {uploadState === 'uploading' ? 'Uploading…' : 'Upload Document'}
          </button>
        </form>
      </div>

      {/* Document list */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Your Documents</h2>
        {loadingDocs ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : docs.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 px-6 py-8 text-center text-sm text-gray-400">
            No documents uploaded yet.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {docs.map((doc) => (
              <div key={doc.id} className="px-4 sm:px-6 py-4 flex items-start justify-between gap-3 sm:gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{doc.file_name}</p>
                  <p className="text-xs text-gray-400 mt-0.5 capitalize">
                    {doc.document_type.replace(/_/g, ' ')} · {formatFileSize(doc.file_size_bytes)} · {new Date(doc.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                  {doc.rejection_reason && (
                    <p className="text-xs text-red-600 mt-1">
                      <span className="font-medium">Reason: </span>{doc.rejection_reason}
                    </p>
                  )}
                </div>
                <StatusBadge status={doc.review_status} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
        <p className="text-sm font-medium text-blue-800">Documents are reviewed by our team</p>
        <p className="text-sm text-blue-700 mt-0.5">
          After upload, each document is verified before your application advances. You will be notified if anything is rejected or additional documents are needed.
        </p>
      </div>
    </div>
  )
}
