export default function BorrowerDocumentsPage() {
  return <ComingSoon title="Documents" phase={3} description="Upload and manage loan documents, view signing requests, and track document review status." />
}

function ComingSoon({ title, phase, description }: { title: string; phase: number; description: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <p className="text-sm font-medium text-gray-900">{description}</p>
        <p className="text-xs text-gray-400 mt-2">Available in Phase {phase}</p>
      </div>
    </div>
  )
}
