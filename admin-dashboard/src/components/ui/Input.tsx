import React from 'react'

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string
  error?: string
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', label, error, style, ...props }, ref) => {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%', ...style }}>
        {label && (
          <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`admin-input ${className}`}
          style={{
            padding: '10px 12px',
            fontSize: '14px',
            border: `1px solid ${error ? 'var(--danger)' : 'var(--border)'}`,
            borderRadius: '8px',
            background: 'var(--surface)',
            color: 'var(--text)',
            outline: 'none',
            transition: 'border-color 0.2s',
            width: '100%'
          }}
          {...props}
        />
        {error && (
          <span style={{ fontSize: '12px', color: 'var(--danger)' }}>
            {error}
          </span>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'
