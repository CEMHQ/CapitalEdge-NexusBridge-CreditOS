export default function InviteExpiredPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md space-y-6 p-8 bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-gray-900">Invitation link expired</h1>
          <p className="text-sm text-gray-500">
            This invitation link is no longer valid. For security purposes, invite links expire
            after 24 hours and can only be used once.
          </p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 space-y-1">
          <p className="text-sm font-medium text-amber-800">What to do next</p>
          <p className="text-sm text-amber-700">
            Contact your NexusBridge administrator to request a new invitation. Once you receive
            a new email, complete your account setup within 24 hours.
          </p>
        </div>

        <div className="border-t border-gray-100 pt-4">
          <p className="text-center text-sm text-gray-500">
            Already set up your account?{' '}
            <a href="/login" className="text-gray-900 font-medium hover:underline">
              Sign in
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
