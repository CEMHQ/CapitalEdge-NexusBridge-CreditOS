'use client'

import { useMemo } from 'react'
import { Check, X } from 'lucide-react'
import { zxcvbn, zxcvbnOptions } from '@zxcvbn-ts/core'
import * as zxcvbnCommonPackage from '@zxcvbn-ts/language-common'
import * as zxcvbnEnPackage from '@zxcvbn-ts/language-en'

// Configure zxcvbn-ts once (module-level, runs on first import)
zxcvbnOptions.setOptions({
  translations: zxcvbnEnPackage.translations,
  graphs: zxcvbnCommonPackage.adjacencyGraphs,
  dictionary: {
    ...zxcvbnCommonPackage.dictionary,
    ...zxcvbnEnPackage.dictionary,
  },
})

// ─── Policy constants (NIST SP 800-63B, 2024 revision) ───────────────────────
export const PASSWORD_MIN_LENGTH = 12
export const PASSWORD_MIN_SCORE  = 2   // 0–4; "Fair" is the gate for submission

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PasswordCheckResult {
  score:        number          // 0–4
  isValid:      boolean         // meets all submission requirements
  entropy:      number          // estimated bits
  crackDisplay: string          // human-readable crack time
  suggestions:  string[]        // zxcvbn improvement hints
  warning:      string          // zxcvbn single-line warning
  meetsLength:  boolean
  meetsScore:   boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SCORE_META: Record<number, { label: string; color: string; barColor: string }> = {
  0: { label: 'Very weak',  color: 'text-red-600',    barColor: 'bg-red-500'    },
  1: { label: 'Weak',       color: 'text-orange-500', barColor: 'bg-orange-400' },
  2: { label: 'Fair',       color: 'text-yellow-600', barColor: 'bg-yellow-400' },
  3: { label: 'Good',       color: 'text-lime-600',   barColor: 'bg-lime-500'   },
  4: { label: 'Strong',     color: 'text-green-600',  barColor: 'bg-green-500'  },
}

/**
 * Run zxcvbn on the password and return a structured result.
 * Pure function — safe to call in useMemo.
 */
export function analyzePassword(password: string): PasswordCheckResult {
  if (!password) {
    return {
      score: 0, isValid: false, entropy: 0,
      crackDisplay: '—', suggestions: [], warning: '',
      meetsLength: false, meetsScore: false,
    }
  }

  const result      = zxcvbn(password)
  const meetsLength = password.length >= PASSWORD_MIN_LENGTH
  const meetsScore  = result.score >= PASSWORD_MIN_SCORE

  return {
    score:        result.score,
    isValid:      meetsLength && meetsScore,
    entropy:      result.guessesLog10 * Math.log2(10), // convert log10 → bits
    crackDisplay: result.crackTimesDisplay.offlineSlowHashing1e4PerSecond as string,
    suggestions:  result.feedback.suggestions ?? [],
    warning:      (result.feedback.warning as string) ?? '',
    meetsLength,
    meetsScore,
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  password: string
  /** Show the confirm-password match row when provided */
  confirm?: string
}

export default function PasswordStrengthMeter({ password, confirm }: Props) {
  const analysis = useMemo(() => analyzePassword(password), [password])

  const { score, meetsLength, meetsScore, crackDisplay, suggestions, warning, entropy } = analysis
  const meta = SCORE_META[score]

  // Bar width: score maps to 1–5 out of 5 filled segments
  const barPct = password ? ((score + 1) / 5) * 100 : 0

  const passwordsMatch = confirm !== undefined ? password === confirm && password.length > 0 : null

  return (
    <div className="space-y-3 mt-2">

      {/* ── Strength bar ─────────────────────────────────────────── */}
      {password.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-gray-500">Password strength</span>
            <span className={`text-xs font-semibold ${meta.color}`}>{meta.label}</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${meta.barColor}`}
              style={{ width: `${barPct}%` }}
            />
          </div>
          {entropy > 0 && (
            <p className="text-[11px] text-gray-400 mt-1">
              ~{Math.round(entropy)} bits of entropy · Time to crack: <span className="text-gray-600">{crackDisplay}</span>
            </p>
          )}
        </div>
      )}

      {/* ── Requirements checklist ───────────────────────────────── */}
      <div className="rounded-lg bg-gray-50 border border-gray-100 px-3.5 py-3 space-y-2">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Requirements</p>

        <Req met={meetsLength}>
          At least {PASSWORD_MIN_LENGTH} characters
          {password.length > 0 && !meetsLength && (
            <span className="text-gray-400 ml-1">({password.length}/{PASSWORD_MIN_LENGTH})</span>
          )}
        </Req>

        <Req met={meetsScore && password.length > 0}>
          Not a commonly used password
        </Req>

        {confirm !== undefined && (
          <Req met={passwordsMatch === true}>
            Passwords match
          </Req>
        )}
      </div>

      {/* ── zxcvbn feedback ──────────────────────────────────────── */}
      {password.length > 0 && (warning || suggestions.length > 0) && (
        <div className="rounded-lg bg-amber-50 border border-amber-100 px-3.5 py-3 space-y-1">
          {warning && (
            <p className="text-xs text-amber-800 font-medium">{warning}</p>
          )}
          {suggestions.map((s, i) => (
            <p key={i} className="text-xs text-amber-700">→ {s}</p>
          ))}
        </div>
      )}

    </div>
  )
}

// ─── Sub-component ────────────────────────────────────────────────────────────

function Req({ met, children }: { met: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center transition-colors ${
          met ? 'bg-green-500' : 'bg-gray-200'
        }`}
      >
        {met
          ? <Check size={10} strokeWidth={3} className="text-white" />
          : <X size={10} strokeWidth={3} className="text-gray-400" />
        }
      </span>
      <span className={`text-xs transition-colors ${met ? 'text-gray-700' : 'text-gray-500'}`}>
        {children}
      </span>
    </div>
  )
}
