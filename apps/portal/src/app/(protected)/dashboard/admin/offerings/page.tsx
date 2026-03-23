import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/auth/roles'
import { formatDate } from '@/lib/format'
import { redirect } from 'next/navigation'
import CreateOfferingForm from '@/components/offerings/CreateOfferingForm'
import EditOfferingStatusButton from '@/components/offerings/EditOfferingStatusButton'
import EditOfferingFieldsForm from '@/components/offerings/EditOfferingFieldsForm'
import DeleteOfferingButton from '@/components/offerings/DeleteOfferingButton'
import ManageOfferingDocuments from '@/components/offerings/ManageOfferingDocuments'

// ─── Status display helpers ──────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  draft:      'bg-gray-100 text-gray-600',
  qualified:  'bg-blue-100 text-blue-700',
  active:     'bg-green-100 text-green-700',
  suspended:  'bg-amber-100 text-amber-700',
  closed:     'bg-slate-100 text-slate-600',
  terminated: 'bg-red-100 text-red-700',
}

const TYPE_BADGE: Record<string, string> = {
  reg_a:  'bg-indigo-50 text-indigo-700',
  reg_d:  'bg-violet-50 text-violet-700',
  reg_cf: 'bg-teal-50 text-teal-700',
}

type OfferingDoc = {
  id: string
  document_type: string
  label: string
  file_path: string
  filed_at: string | null
  effective_date: string | null
}

type Offering = {
  id: string
  offering_type: string
  offering_status: string
  title: string
  description: string | null
  max_offering_amount: number
  min_investment: number
  max_investment: number | null
  per_share_price: number | null
  shares_offered: number | null
  sec_file_number: string | null
  qualification_date: string | null
  offering_open_date: string | null
  offering_close_date: string | null
  jurisdiction_restrictions: string[]
  created_at: string
  funds: { id: string; fund_name: string } | null
  offering_documents: OfferingDoc[]
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function AdminOfferingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const role = await getUserRole(supabase, user!.id)
  if (!['admin', 'manager'].includes(role)) redirect('/dashboard/admin')

  const isAdmin = role === 'admin'
  const adminClient = createAdminClient()

  const { data: rawOfferings } = await adminClient
    .from('offerings')
    .select(`
      id, offering_type, offering_status, title, description,
      max_offering_amount, min_investment, max_investment,
      per_share_price, shares_offered,
      sec_file_number, qualification_date,
      offering_open_date, offering_close_date,
      jurisdiction_restrictions, created_at,
      funds ( id, fund_name ),
      offering_documents (
        id, document_type, label, file_path, filed_at, effective_date
      )
    `)
    .order('created_at', { ascending: false })

  const offerings = (rawOfferings ?? []) as unknown as Offering[]

  // Fund list for the create form dropdown
  const { data: funds } = await adminClient
    .from('funds')
    .select('id, fund_name')
    .order('fund_name')

  const fundOptions = (funds ?? []) as { id: string; fund_name: string }[]

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Offerings</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage Reg A, Reg D, and Reg CF offering campaigns with SEC filing metadata and investor documents.
          </p>
        </div>
        {isAdmin && <CreateOfferingForm funds={fundOptions} />}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(['active', 'draft', 'qualified', 'closed'] as const).map(status => {
          const count = offerings.filter(o => o.offering_status === status).length
          return (
            <div key={status} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
              <p className="text-xs text-gray-400 capitalize">{status}</p>
              <p className="text-2xl font-semibold text-gray-900 mt-0.5">{count}</p>
            </div>
          )
        })}
      </div>

      {/* Offering list */}
      {offerings.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-sm text-gray-500">No offerings yet. Create the first one above.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {offerings.map(offering => (
            <OfferingCard
              key={offering.id}
              offering={offering}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}

    </div>
  )
}

// ─── OfferingCard ─────────────────────────────────────────────────────────────

function OfferingCard({ offering, isAdmin }: { offering: Offering; isAdmin: boolean }) {
  const restricted = Array.isArray(offering.jurisdiction_restrictions)
    ? offering.jurisdiction_restrictions
    : []

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header row */}
      <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_BADGE[offering.offering_type] ?? 'bg-gray-100 text-gray-600'}`}>
              {offering.offering_type.replace('_', ' ').toUpperCase()}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_BADGE[offering.offering_status] ?? 'bg-gray-100 text-gray-600'}`}>
              {offering.offering_status}
            </span>
          </div>
          <h3 className="text-base font-semibold text-gray-900">{offering.title}</h3>
          {offering.funds && (
            <p className="text-xs text-gray-500 mt-0.5">{offering.funds.fund_name}</p>
          )}
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2 shrink-0">
            <EditOfferingFieldsForm
              offeringId={offering.id}
              current={offering}
            />
            <EditOfferingStatusButton
              offeringId={offering.id}
              currentStatus={offering.offering_status}
            />
            <DeleteOfferingButton
              offeringId={offering.id}
              title={offering.title}
              disabled={offering.offering_status === 'active'}
            />
          </div>
        )}
      </div>

      {/* Key terms grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-5 pb-4 border-t border-gray-50 pt-4">
        <Stat label="Max Offering"   value={`$${Number(offering.max_offering_amount).toLocaleString()}`} />
        <Stat label="Min Investment" value={`$${Number(offering.min_investment).toLocaleString()}`} />
        <Stat label="Opens"          value={offering.offering_open_date  ? formatDate(offering.offering_open_date)  : '—'} />
        <Stat label="Closes"         value={offering.offering_close_date ? formatDate(offering.offering_close_date) : '—'} />
      </div>

      {/* SEC filing row */}
      {(offering.sec_file_number || offering.qualification_date) && (
        <div className="flex flex-wrap gap-4 px-5 pb-4 text-xs text-gray-500">
          {offering.sec_file_number && (
            <span>SEC File: <span className="font-medium text-gray-900">{offering.sec_file_number}</span></span>
          )}
          {offering.qualification_date && (
            <span>Qualified: <span className="font-medium text-gray-900">{formatDate(offering.qualification_date)}</span></span>
          )}
          {restricted.length > 0 && (
            <span>Restricted states: <span className="font-medium text-gray-900">{restricted.join(', ')}</span></span>
          )}
        </div>
      )}

      {/* Documents section */}
      <div className="border-t border-gray-100 px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-gray-700">
            Offering Documents
            <span className="ml-1.5 text-gray-400">({offering.offering_documents.length})</span>
          </p>
          {isAdmin && (
            <ManageOfferingDocuments offeringId={offering.id} />
          )}
        </div>

        {offering.offering_documents.length === 0 ? (
          <p className="text-xs text-gray-400">No documents attached.</p>
        ) : (
          <div className="space-y-2">
            {offering.offering_documents.map(doc => (
              <DocumentRow key={doc.id} doc={doc} offeringId={offering.id} isAdmin={isAdmin} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── DocumentRow ─────────────────────────────────────────────────────────────

const DOC_TYPE_LABELS: Record<string, string> = {
  form_1a:           'Form 1-A',
  form_1a_amendment: 'Form 1-A/A',
  form_1k:           'Form 1-K',
  form_1sa:          'Form 1-SA',
  form_1u:           'Form 1-U',
  offering_circular: 'Offering Circular',
  supplement:        'Supplement',
  other:             'Document',
}

function DocumentRow({
  doc,
  offeringId,
  isAdmin,
}: {
  doc: OfferingDoc
  offeringId: string
  isAdmin: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <div>
        <span className="font-medium text-gray-800">{doc.label}</span>
        <span className="text-gray-400 ml-1.5">
          {DOC_TYPE_LABELS[doc.document_type] ?? doc.document_type}
          {doc.filed_at && ` · Filed ${formatDate(doc.filed_at)}`}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <a
          href={`/api/offerings/${doc.id}/document`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-600 hover:text-indigo-800 font-medium"
        >
          Download
        </a>
        {isAdmin && (
          <DeleteDocumentButton offeringId={offeringId} docId={doc.id} label={doc.label} />
        )}
      </div>
    </div>
  )
}

// ─── DeleteDocumentButton (inline — no state needed beyond a fetch) ───────────
// Uses a form action pattern for simplicity; full client component lives separately.

import DeleteOfferingDocumentButton from '@/components/offerings/DeleteOfferingDocumentButton'

function DeleteDocumentButton({ offeringId, docId, label }: { offeringId: string; docId: string; label: string }) {
  return <DeleteOfferingDocumentButton offeringId={offeringId} docId={docId} label={label} />
}

// ─── Stat ─────────────────────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm font-medium text-gray-900 mt-0.5">{value}</p>
    </div>
  )
}
