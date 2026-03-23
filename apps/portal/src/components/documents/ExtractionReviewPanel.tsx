'use client'

import { useEffect, useState, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type FieldMapping = {
  id: string
  source_field: string
  target_entity: string
  target_field: string
  extracted_value: string | null
  confidence: number | null
  status: 'pending' | 'accepted' | 'rejected' | 'overridden'
  override_value: string | null
  reviewed_by: string | null
  reviewed_at: string | null
}

type Extraction = {
  id: string
  provider_name: 'ocrolus' | 'argyle' | 'manual'
  extraction_status: string
  confidence_score: number | null
  provider_job_id: string | null
  failure_reason: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
}

type ExtractionDetail = Extraction & {
  field_mappings: FieldMapping[]
}

type ExtractionData = {
  extractions: Extraction[]
  latest: ExtractionDetail | null
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ExtractionStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending:    { label: 'Pending',    cls: 'bg-gray-50 text-gray-600 border-gray-200' },
    processing: { label: 'Processing', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    completed:  { label: 'Completed',  cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    reviewed:   { label: 'Reviewed',   cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    accepted:   { label: 'Accepted',   cls: 'bg-green-50 text-green-700 border-green-200' },
    rejected:   { label: 'Rejected',   cls: 'bg-red-50 text-red-700 border-red-200' },
    failed:     { label: 'Failed',     cls: 'bg-red-50 text-red-600 border-red-200' },
  }
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-gray-50 text-gray-600 border-gray-200' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {label}
    </span>
  )
}

function ConfidenceBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-gray-400">—</span>
  const cls =
    score >= 95 ? 'text-green-700 bg-green-50' :
    score >= 85 ? 'text-amber-700 bg-amber-50' :
                  'text-red-700 bg-red-50'
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-mono font-medium ${cls}`}>
      {score.toFixed(0)}%
    </span>
  )
}

// ─── Field row with inline accept/reject/override controls ────────────────────

type FieldRowProps = {
  mapping: FieldMapping
  localState: FieldReviewState
  onChange: (id: string, state: FieldReviewState) => void
}

type FieldReviewState = {
  status: 'pending' | 'accepted' | 'rejected' | 'overridden'
  overrideValue: string
}

function FieldRow({ mapping, localState, onChange }: FieldRowProps) {
  const { status, overrideValue } = localState
  const isAlreadyReviewed = mapping.reviewed_at !== null

  const displayValue = mapping.status === 'overridden'
    ? mapping.override_value
    : mapping.extracted_value

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-x-4 gap-y-1.5 py-3 border-b border-gray-100 last:border-0 ${isAlreadyReviewed ? 'opacity-60' : ''}`}>
      {/* Field info */}
      <div className="min-w-0">
        <p className="text-xs text-gray-500 font-medium capitalize">
          {mapping.target_entity} · {mapping.target_field.replace(/_/g, ' ')}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          from <span className="font-mono">{mapping.source_field}</span>
        </p>
      </div>

      {/* Extracted value + confidence */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm text-gray-900 font-medium truncate">
            {displayValue ?? <span className="text-gray-400 italic">No value extracted</span>}
          </p>
          <ConfidenceBadge score={mapping.confidence} />
        </div>

        {/* Override input — shown when status is overridden */}
        {status === 'overridden' && (
          <input
            type="text"
            value={overrideValue}
            onChange={(e) => onChange(mapping.id, { status: 'overridden', overrideValue: e.target.value })}
            placeholder="Enter corrected value…"
            className="mt-1.5 w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gray-900"
            disabled={isAlreadyReviewed}
          />
        )}
      </div>

      {/* Action buttons */}
      {!isAlreadyReviewed && (
        <div className="flex items-center gap-1 flex-wrap sm:flex-nowrap">
          <button
            onClick={() => onChange(mapping.id, { status: 'accepted', overrideValue: '' })}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
              status === 'accepted'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-green-50 hover:text-green-700'
            }`}
          >
            Accept
          </button>
          <button
            onClick={() => onChange(mapping.id, { status: 'rejected', overrideValue: '' })}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
              status === 'rejected'
                ? 'bg-red-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-700'
            }`}
          >
            Reject
          </button>
          <button
            onClick={() => onChange(mapping.id, {
              status: status === 'overridden' ? 'pending' : 'overridden',
              overrideValue: overrideValue,
            })}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
              status === 'overridden'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-indigo-50 hover:text-indigo-700'
            }`}
          >
            Override
          </button>
        </div>
      )}

      {/* Already reviewed indicator */}
      {isAlreadyReviewed && (
        <div className="flex items-center">
          <ExtractionStatusBadge status={mapping.status} />
        </div>
      )}
    </div>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────

type Props = {
  documentId: string
  documentType: string
  uploadStatus: string
}

export function ExtractionReviewPanel({ documentId, documentType, uploadStatus }: Props) {
  const [data, setData]                   = useState<ExtractionData | null>(null)
  const [loading, setLoading]             = useState(true)
  const [triggering, setTriggering]       = useState(false)
  const [submitting, setSubmitting]       = useState(false)
  const [applying, setApplying]           = useState(false)
  const [error, setError]                 = useState<string | null>(null)
  const [successMsg, setSuccessMsg]       = useState<string | null>(null)

  // Per-field local review state (before submission)
  const [fieldStates, setFieldStates]     = useState<Record<string, FieldReviewState>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/documents/${documentId}/extraction`)
      if (!res.ok) throw new Error('Failed to load extraction data')
      const json: ExtractionData = await res.json()
      setData(json)

      // Initialise local field states from whatever is already in the DB
      if (json.latest?.field_mappings) {
        const init: Record<string, FieldReviewState> = {}
        for (const m of json.latest.field_mappings) {
          init[m.id] = {
            status:        m.reviewed_at ? m.status : 'pending',
            overrideValue: m.override_value ?? '',
          }
        }
        setFieldStates(init)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [documentId])

  useEffect(() => { void load() }, [load])

  async function handleTrigger(provider: 'ocrolus' | 'argyle') {
    setTriggering(true)
    setError(null)
    setSuccessMsg(null)
    const res = await fetch(`/api/documents/${documentId}/extract`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ provider }),
    })
    setTriggering(false)
    if (!res.ok) {
      const d = await res.json()
      setError(d.error ?? 'Failed to trigger extraction')
      return
    }
    setSuccessMsg(`Submitted to ${provider === 'ocrolus' ? 'Ocrolus' : 'Argyle'} for extraction. Results will appear once the job completes.`)
    void load()
  }

  async function handleSubmitReview(decision?: 'accepted' | 'rejected') {
    if (!data?.latest) return
    setSubmitting(true)
    setError(null)

    const fieldReviews = Object.entries(fieldStates)
      .filter(([, s]) => s.status !== 'pending')
      .map(([id, s]) => ({
        field_mapping_id: id,
        status:           s.status,
        override_value:   s.status === 'overridden' ? s.overrideValue : undefined,
      }))

    if (fieldReviews.length === 0 && !decision) {
      setError('Review at least one field before submitting.')
      setSubmitting(false)
      return
    }

    const res = await fetch(`/api/documents/${documentId}/extraction`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        extraction_id:       data.latest.id,
        field_reviews:       fieldReviews,
        extraction_decision: decision,
      }),
    })
    setSubmitting(false)
    if (!res.ok) {
      const d = await res.json()
      setError(d.error ?? 'Failed to save review')
      return
    }
    setSuccessMsg('Review saved.')
    void load()
  }

  async function handleApply() {
    if (!data?.latest) return
    setApplying(true)
    setError(null)
    const res = await fetch(`/api/documents/${documentId}/extraction/apply`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ extraction_id: data.latest.id }),
    })
    setApplying(false)
    const d = await res.json()
    if (!res.ok) {
      setError(d.error ?? 'Failed to apply fields')
      return
    }
    const targets = (d.applied_to as string[]).join(', ')
    setSuccessMsg(`Applied ${d.fields_applied} field(s) to: ${targets}.${d.warnings ? ` Warnings: ${d.warnings.join('; ')}` : ''}`)
    void load()
  }

  function updateFieldState(id: string, state: FieldReviewState) {
    setFieldStates(prev => ({ ...prev, [id]: state }))
  }

  // Determine which providers are relevant for this document type
  const supportsOcrolus = ['bank_statement', 'tax_return', 'pay_stub', 'w2'].includes(documentType)
  const supportsArgyle  = ['pay_stub', 'w2'].includes(documentType)
  const canTrigger      = uploadStatus === 'uploaded'

  const latest = data?.latest ?? null
  const isProcessing = latest?.extraction_status === 'processing' || latest?.extraction_status === 'pending'
  const canReview    = latest && ['completed', 'reviewed'].includes(latest.extraction_status)
  const canApply     = latest && ['accepted', 'reviewed'].includes(latest.extraction_status)

  const pendingFields   = Object.values(fieldStates).filter(s => s.status === 'pending').length
  const reviewedFields  = Object.values(fieldStates).filter(s => s.status !== 'pending').length
  const overrideInvalid = Object.values(fieldStates).some(
    s => s.status === 'overridden' && !s.overrideValue.trim()
  )

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <p className="text-sm text-gray-400">Loading extraction data…</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
      {/* Header */}
      <div className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Document Intelligence</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Extract structured data from this document using OCR
          </p>
        </div>

        {/* Trigger buttons */}
        {canTrigger && !isProcessing && (
          <div className="flex items-center gap-2 flex-wrap">
            {supportsOcrolus && (
              <button
                onClick={() => handleTrigger('ocrolus')}
                disabled={triggering}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                {triggering ? 'Submitting…' : 'Extract via Ocrolus'}
              </button>
            )}
            {supportsArgyle && (
              <button
                onClick={() => handleTrigger('argyle')}
                disabled={triggering}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {triggering ? 'Submitting…' : 'Extract via Argyle'}
              </button>
            )}
            {!supportsOcrolus && !supportsArgyle && (
              <span className="text-xs text-gray-400">
                Automatic extraction not available for this document type
              </span>
            )}
          </div>
        )}

        {isProcessing && (
          <div className="flex items-center gap-2 text-xs text-blue-700">
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            Extraction in progress…
          </div>
        )}

        {!canTrigger && (
          <span className="text-xs text-gray-400">Upload the document before extracting data</span>
        )}
      </div>

      {/* Status messages */}
      {(error || successMsg) && (
        <div className={`px-4 sm:px-6 py-3 text-sm ${error ? 'text-red-700 bg-red-50' : 'text-green-700 bg-green-50'}`}>
          {error ?? successMsg}
        </div>
      )}

      {/* No extractions yet */}
      {!latest && !isProcessing && (
        <div className="px-4 sm:px-6 py-8 text-center">
          <p className="text-sm text-gray-400">No extraction data yet. Trigger an extraction above.</p>
        </div>
      )}

      {/* Latest extraction summary */}
      {latest && (
        <>
          <div className="px-4 sm:px-6 py-4 flex flex-wrap items-center gap-4 text-xs text-gray-500">
            <span>
              Provider: <span className="font-medium text-gray-800 capitalize">{latest.provider_name}</span>
            </span>
            <span>
              Status: <ExtractionStatusBadge status={latest.extraction_status} />
            </span>
            {latest.confidence_score !== null && (
              <span>
                Confidence: <ConfidenceBadge score={latest.confidence_score} />
              </span>
            )}
            <span>
              Run: {new Date(latest.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            {data && data.extractions.length > 1 && (
              <span className="text-gray-400">({data.extractions.length} total runs)</span>
            )}
          </div>

          {/* Failure reason */}
          {latest.extraction_status === 'failed' && latest.failure_reason && (
            <div className="px-4 sm:px-6 py-3 bg-red-50 text-sm text-red-700">
              Extraction failed: {latest.failure_reason}
            </div>
          )}

          {/* Field mappings */}
          {canReview && latest.field_mappings.length > 0 && (
            <div className="px-4 sm:px-6 py-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-gray-700">
                  Extracted Fields
                  {reviewedFields > 0 && (
                    <span className="ml-2 text-gray-400">
                      {reviewedFields}/{latest.field_mappings.length} reviewed
                    </span>
                  )}
                </p>
                {pendingFields > 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const all: Record<string, FieldReviewState> = {}
                        for (const m of latest.field_mappings) {
                          if (!m.reviewed_at) all[m.id] = { status: 'accepted', overrideValue: '' }
                        }
                        setFieldStates(prev => ({ ...prev, ...all }))
                      }}
                      className="text-xs text-gray-500 hover:text-green-700 underline"
                    >
                      Accept all
                    </button>
                    <span className="text-gray-300">|</span>
                    <button
                      onClick={() => {
                        const all: Record<string, FieldReviewState> = {}
                        for (const m of latest.field_mappings) {
                          if (!m.reviewed_at) all[m.id] = { status: 'rejected', overrideValue: '' }
                        }
                        setFieldStates(prev => ({ ...prev, ...all }))
                      }}
                      className="text-xs text-gray-500 hover:text-red-700 underline"
                    >
                      Reject all
                    </button>
                  </div>
                )}
              </div>

              <div>
                {latest.field_mappings.map(m => (
                  <FieldRow
                    key={m.id}
                    mapping={m}
                    localState={fieldStates[m.id] ?? { status: 'pending', overrideValue: '' }}
                    onChange={updateFieldState}
                  />
                ))}
              </div>
            </div>
          )}

          {canReview && latest.field_mappings.length === 0 && (
            <div className="px-4 sm:px-6 py-4 text-sm text-gray-400">
              Extraction completed but no mappable fields were found.
            </div>
          )}

          {/* Review actions */}
          {canReview && !latest.reviewed_at && latest.field_mappings.length > 0 && (
            <div className="px-4 sm:px-6 py-4 flex flex-wrap items-center gap-3">
              <button
                onClick={() => handleSubmitReview('accepted')}
                disabled={submitting || overrideInvalid || reviewedFields === 0}
                className="px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-40 transition-colors"
              >
                {submitting ? 'Saving…' : 'Save review & accept'}
              </button>
              <button
                onClick={() => handleSubmitReview('rejected')}
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium bg-white text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-40 transition-colors"
              >
                Reject extraction
              </button>
              {overrideInvalid && (
                <p className="text-xs text-amber-600">Fill in override values before saving.</p>
              )}
            </div>
          )}

          {/* Apply to application */}
          {canApply && latest.reviewed_at && (
            <div className="px-4 sm:px-6 py-4 flex flex-wrap items-center gap-3 bg-gray-50 rounded-b-xl">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-700">Apply to application</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Write accepted fields to the application, borrower, and property records.
                  This action is recorded in the audit log.
                </p>
              </div>
              <button
                onClick={handleApply}
                disabled={applying || latest.extraction_status === 'accepted'}
                className="shrink-0 px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
              >
                {applying ? 'Applying…' : latest.extraction_status === 'accepted' ? 'Applied' : 'Apply to application'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
