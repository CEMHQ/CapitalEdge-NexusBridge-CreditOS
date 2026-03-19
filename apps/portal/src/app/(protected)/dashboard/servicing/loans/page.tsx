export default function ServicingLoansPage() {
  return <ComingSoon title="Loans" phase={3} description="View all active and closed loans, payment history, amortization schedules, and draw activity." />
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
