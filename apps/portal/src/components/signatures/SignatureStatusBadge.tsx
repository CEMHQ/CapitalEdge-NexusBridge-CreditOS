const STATUS_STYLES: Record<string, string> = {
  draft:    'bg-gray-100 text-gray-500',
  sent:     'bg-blue-50 text-blue-700',
  viewed:   'bg-yellow-50 text-yellow-700',
  signed:   'bg-green-50 text-green-700',
  declined: 'bg-red-50 text-red-700',
  expired:  'bg-orange-50 text-orange-700',
  voided:   'bg-gray-100 text-gray-400',
}

const STATUS_LABELS: Record<string, string> = {
  draft:    'Draft',
  sent:     'Awaiting Signature',
  viewed:   'Viewed',
  signed:   'Signed',
  declined: 'Declined',
  expired:  'Expired',
  voided:   'Voided',
}

export default function SignatureStatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}
