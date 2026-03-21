'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getDefaultRoute, type UserRole } from '@/lib/auth/roles'
import { Button } from '@/components/ui/button'
import PasswordInput from '@/components/auth/PasswordInput'
import PasswordStrengthMeter, { analyzePassword } from '@/components/auth/PasswordStrengthMeter'

export default function SetPasswordPage() {
  const router = useRouter()
  const supabase = createClient()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const analysis = useMemo(() => analyzePassword(password), [password])
  const passwordsMatch = password.length > 0 && password === confirm

  const canSubmit = analysis.isValid && passwordsMatch

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!analysis.isValid) {
      setError(
        !analysis.meetsLength
          ? `Password must be at least 12 characters.`
          : 'Please choose a stronger password.'
      )
      return
    }

    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    const { data, error } = await supabase.auth.updateUser({ password })

    if (error) {
      // Session-expired errors mean the invite link has gone stale
      if (
        error.message.toLowerCase().includes('session') ||
        error.message.toLowerCase().includes('not found') ||
        error.message.toLowerCase().includes('expired')
      ) {
        setError(
          'Your setup session has expired. Please ask your administrator to send a new invitation.'
        )
      } else {
        setError(error.message)
      }
      setLoading(false)
      return
    }

    // Read role from DB — never from JWT metadata, which can be stale or spoofed
    const userId = data.user?.id
    let role: UserRole = 'investor'
    if (userId) {
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .single()
      role = (roleData?.role ?? 'investor') as UserRole
    }

    router.push(getDefaultRoute(role))
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md space-y-8 p-8 bg-white rounded-xl shadow-sm border border-gray-200">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Set your password</h1>
          <p className="mt-1 text-sm text-gray-500">
            Welcome to NexusBridge. Create a strong password to complete your account setup.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              New Password
            </label>
            <PasswordInput
              id="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
            <PasswordStrengthMeter password={password} confirm={confirm} />
          </div>

          <div>
            <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-1">
              Confirm Password
            </label>
            <PasswordInput
              id="confirm"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className={
                confirm.length > 0
                  ? passwordsMatch
                    ? 'border-green-400 focus:ring-green-500'
                    : 'border-red-300 focus:ring-red-400'
                  : ''
              }
            />
            {confirm.length > 0 && !passwordsMatch && (
              <p className="text-xs text-red-500 mt-1">Passwords do not match.</p>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button type="submit" disabled={loading || !canSubmit} className="w-full">
            {loading ? 'Setting password...' : 'Complete setup'}
          </Button>
        </form>
      </div>
    </div>
  )
}
