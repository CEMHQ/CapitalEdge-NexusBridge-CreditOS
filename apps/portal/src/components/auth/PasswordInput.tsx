'use client'

import { useState, forwardRef } from 'react'
import { Eye, EyeOff } from 'lucide-react'

interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  id?: string
}

/**
 * Password input with show/hide visibility toggle.
 * Forwards ref so parent forms can manage focus.
 */
const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className = '', id, ...props }, ref) => {
    const [visible, setVisible] = useState(false)

    return (
      <div className="relative">
        <input
          {...props}
          id={id}
          ref={ref}
          type={visible ? 'text' : 'password'}
          className={[
            'w-full px-3 py-2 pr-10 border border-gray-300 rounded-md text-sm',
            'focus:outline-none focus:ring-2 focus:ring-gray-900',
            'disabled:bg-gray-50 disabled:text-gray-400',
            className,
          ].join(' ')}
          autoComplete={props.autoComplete ?? 'current-password'}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          tabIndex={-1}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600 transition-colors"
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    )
  }
)

PasswordInput.displayName = 'PasswordInput'

export default PasswordInput
