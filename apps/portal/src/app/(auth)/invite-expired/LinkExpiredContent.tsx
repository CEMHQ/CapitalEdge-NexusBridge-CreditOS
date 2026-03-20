'use client'

import { useSearchParams } from 'next/navigation'

export function LinkExpiredContent() {
  const searchParams = useSearchParams()
  const type = searchParams.get('type')

  if (type === 'reset') {
    return <ResetLinkExpired />
  }

  return <InviteLinkExpired />
}

function InviteLinkExpired() {
  return (
    <>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-gray-900">Invitation link expired</h1>
        <p className="text-sm text-gray-500">
          This invitation link is no longer valid. For security purposes, invite links expire
          after 24 hours and can only be used once.
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 space-y-2">
        <p className="text-sm font-medium text-amber-800">What to do next</p>
        <p className="text-sm text-amber-700">
          Contact your NexusBridge administrator to request a new invitation. Once you receive
          a new email, complete your account setup within 24 hours.
        </p>
        <div className="text-sm text-amber-700 space-y-0.5 pt-1">
          <p>
            <span className="font-medium">Email: </span>
            <a href="mailto:support@nexusbridgelending.com" className="underline hover:text-amber-900">
              support@nexusbridgelending.com
            </a>
          </p>
          <p>
            <span className="font-medium">Phone: </span>
            <a href="tel:+18005551234" className="underline hover:text-amber-900">
              (800) 555-1234
            </a>
          </p>
        </div>
      </div>

      <div className="border-t border-gray-100 pt-4">
        <p className="text-center text-sm text-gray-500">
          Already set up your account?{' '}
          <a href="/login" className="text-gray-900 font-medium hover:underline">
            Sign in
          </a>
        </p>
      </div>
    </>
  )
}

function ResetLinkExpired() {
  return (
    <>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-gray-900">Password reset link expired</h1>
        <p className="text-sm text-gray-500">
          This password reset link is no longer valid. Reset links expire after 1 hour and
          can only be used once.
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 space-y-1">
        <p className="text-sm font-medium text-amber-800">What to do next</p>
        <p className="text-sm text-amber-700">
          Request a new password reset link from the sign-in page.
        </p>
      </div>

      <div className="border-t border-gray-100 pt-4 space-y-2">
        <a
          href="/forgot-password"
          className="block w-full text-center text-sm font-medium bg-gray-900 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors"
        >
          Request a new reset link
        </a>
        <p className="text-center text-sm text-gray-500">
          <a href="/login" className="text-gray-600 hover:text-gray-900 underline">
            Back to sign in
          </a>
        </p>
      </div>
    </>
  )
}
