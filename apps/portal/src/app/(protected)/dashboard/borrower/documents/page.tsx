'use client'

import { useState, useRef } from 'react'
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

export default function BorrowerDocumentsPage() {
  const [documentType, setDocumentType] = useState(DOCUMENT_TYPES[0].value)
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [uploadedDocs, setUploadedDocs] = useState<{ name: string; type: string }[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

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
          owner_type: 'borrower',
          owner_id: user.id,
          document_type: documentType,
          file_name: file.name,
          mime_type: file.type,
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

      // 3. Confirm upload is complete
      await fetch(`/api/documents/${document_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm' }),
      })

      setUploadedDocs((prev) => [...prev, { name: file.name, type: documentType }])
      setUploadState('success')
      if (fileRef.current) fileRef.current.value = ''
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
          Upload documents required for your loan application.
        </p>
      </div>

      {/* Upload form */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
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
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              className="w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-gray-900 file:text-white hover:file:bg-gray-700"
            />
            <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG, DOC up to 50 MB</p>
          </div>

          {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

          {uploadState === 'success' && (
            <p className="text-sm text-green-600">Document uploaded successfully.</p>
          )}

          <button
            type="submit"
            disabled={uploadState === 'uploading'}
            className="inline-flex items-center px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {uploadState === 'uploading' ? 'Uploading…' : 'Upload Document'}
          </button>
        </form>
      </div>

      {/* Uploaded this session */}
      {uploadedDocs.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Uploaded This Session</h2>
          <ul className="space-y-2">
            {uploadedDocs.map((doc, i) => (
              <li key={i} className="flex items-center gap-3 text-sm">
                <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                <span className="text-gray-900 font-medium">{doc.name}</span>
                <span className="text-gray-400 text-xs capitalize">{doc.type.replace(/_/g, ' ')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Pending review notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
        <p className="text-sm font-medium text-blue-800">Documents are reviewed by our team</p>
        <p className="text-sm text-blue-700 mt-0.5">
          After upload, each document is verified before your application advances. You will be notified if anything is rejected or additional documents are needed.
        </p>
      </div>
    </div>
  )
}
