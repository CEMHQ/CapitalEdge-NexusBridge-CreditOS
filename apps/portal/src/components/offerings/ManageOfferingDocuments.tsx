'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, Upload, CheckCircle } from 'lucide-react'

interface Props {
  offeringId: string
}

const DOC_TYPES = [
  { value: 'form_1a',           label: 'Form 1-A' },
  { value: 'form_1a_amendment', label: 'Form 1-A/A' },
  { value: 'form_1k',           label: 'Form 1-K (Annual Report)' },
  { value: 'form_1sa',          label: 'Form 1-SA (Semi-Annual)' },
  { value: 'form_1u',           label: 'Form 1-U (Current Event)' },
  { value: 'offering_circular', label: 'Offering Circular' },
  { value: 'supplement',        label: 'Supplement' },
  { value: 'other',             label: 'Other' },
]

const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.doc', '.docx']

type UploadState = 'idle' | 'uploading' | 'done'

export default function ManageOfferingDocuments({ offeringId }: Props) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [open, setOpen]             = useState(false)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [uploadProgress, setUploadProgress] = useState(0)

  const [form, setForm] = useState({
    document_type: 'offering_circular',
    label:         '',
    filed_at:      '',
  })
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [filePath, setFilePath]         = useState<string>('')

  function reset() {
    setForm({ document_type: 'offering_circular', label: '', filed_at: '' })
    setSelectedFile(null)
    setFilePath('')
    setUploadState('idle')
    setUploadProgress(0)
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setSelectedFile(file)
    setFilePath('')
    setUploadState('idle')
    setError(null)

    // Auto-fill label from filename if blank
    if (file && !form.label) {
      const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ')
      setForm(f => ({ ...f, label: baseName }))
    }
  }

  async function uploadFile(): Promise<string | null> {
    if (!selectedFile) return null

    setUploadState('uploading')
    setUploadProgress(0)
    setError(null)

    // 1. Get signed upload URL from our API
    const urlRes = await fetch(`/api/admin/offerings/${offeringId}/documents/upload-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename:     selectedFile.name,
        content_type: selectedFile.type,
      }),
    })

    const urlData = await urlRes.json()
    if (!urlRes.ok) {
      setError(urlData.error ?? 'Failed to get upload URL')
      setUploadState('idle')
      return null
    }

    const { upload_url, file_path } = urlData as { upload_url: string; file_path: string }

    // 2. PUT the file directly to Supabase Storage via the signed URL
    // Use XMLHttpRequest for progress tracking
    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', upload_url)
        xhr.setRequestHeader('Content-Type', selectedFile.type)
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100))
          }
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve()
          } else {
            reject(new Error(`Upload failed: ${xhr.status}`))
          }
        }
        xhr.onerror = () => reject(new Error('Network error during upload'))
        xhr.send(selectedFile)
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      setUploadState('idle')
      return null
    }

    setUploadProgress(100)
    setUploadState('done')
    setFilePath(file_path)
    return file_path
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    let resolvedFilePath = filePath

    // Upload file first if not already done
    if (uploadState !== 'done') {
      if (!selectedFile) {
        setError('Please select a file to upload')
        setLoading(false)
        return
      }
      const uploaded = await uploadFile()
      if (!uploaded) {
        setLoading(false)
        return
      }
      resolvedFilePath = uploaded
    }

    // Save document metadata
    const res = await fetch(`/api/admin/offerings/${offeringId}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        document_type: form.document_type,
        label:         form.label,
        file_path:     resolvedFilePath,
        filed_at:      form.filed_at || undefined,
      }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error ?? 'Failed to attach document')
      return
    }

    setOpen(false)
    reset()
    router.refresh()
  }

  const hasFile = selectedFile !== null

  return (
    <>
      <button
        onClick={() => { setOpen(true); reset() }}
        className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
      >
        <Plus size={13} />
        Attach Document
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">Attach Offering Document</h3>
              <button
                onClick={() => { setOpen(false); reset() }}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">

              {/* Document type */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Document Type *</label>
                <select
                  value={form.document_type}
                  onChange={e => setForm(f => ({ ...f, document_type: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  {DOC_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {/* Display label */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Display Label *</label>
                <input
                  required
                  type="text"
                  value={form.label}
                  onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="NexusBridge Capital LP Offering Circular"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>

              {/* File picker */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  File *
                  <span className="text-gray-400 font-normal ml-1">PDF, DOCX, JPG, PNG, WEBP — max 50 MB</span>
                </label>

                {/* Hidden native input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ALLOWED_EXTENSIONS.join(',')}
                  onChange={handleFileChange}
                  className="hidden"
                  aria-label="Choose file"
                />

                {uploadState === 'idle' && !hasFile && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-lg px-3 py-4 text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
                  >
                    <Upload size={16} />
                    Choose file or drag &amp; drop
                  </button>
                )}

                {hasFile && uploadState === 'idle' && (
                  <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2">
                    <span className="text-xs text-gray-700 flex-1 truncate">{selectedFile!.name}</span>
                    <button
                      type="button"
                      onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                      className="text-gray-400 hover:text-gray-700"
                    >
                      <X size={13} />
                    </button>
                  </div>
                )}

                {uploadState === 'uploading' && (
                  <div className="space-y-1">
                    <p className="text-xs text-gray-500">Uploading {selectedFile!.name}…</p>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400 text-right">{uploadProgress}%</p>
                  </div>
                )}

                {uploadState === 'done' && (
                  <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                    <CheckCircle size={13} />
                    <span className="truncate">{selectedFile!.name} — uploaded</span>
                  </div>
                )}
              </div>

              {/* Filed date */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Filed Date (SEC)</label>
                <input
                  type="date"
                  value={form.filed_at}
                  onChange={e => setForm(f => ({ ...f, filed_at: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>

              {error && (
                <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setOpen(false); reset() }}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || uploadState === 'uploading' || !hasFile}
                  className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Saving…' : uploadState === 'uploading' ? 'Uploading…' : 'Attach'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
