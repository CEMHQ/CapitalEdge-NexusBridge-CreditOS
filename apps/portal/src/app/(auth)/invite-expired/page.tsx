import { Suspense } from 'react'
import { LinkExpiredContent } from './LinkExpiredContent'

export default function LinkExpiredPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md space-y-6 p-8 bg-white rounded-xl shadow-sm border border-gray-200">
        <Suspense fallback={<LinkExpiredFallback />}>
          <LinkExpiredContent />
        </Suspense>
      </div>
    </div>
  )
}

function LinkExpiredFallback() {
  return (
    <>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-gray-900">Link expired</h1>
        <p className="text-sm text-gray-500">This link is no longer valid.</p>
      </div>
      <div className="border-t border-gray-100 pt-4">
        <p className="text-center text-sm text-gray-500">
          <a href="/login" className="text-gray-900 font-medium hover:underline">Back to sign in</a>
        </p>
      </div>
    </>
  )
}
