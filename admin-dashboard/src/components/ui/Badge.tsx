import React from 'react'

type BadgeProps = {
  children: React.ReactNode
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'default'
  className?: string
  style?: React.CSSProperties
}

export function Badge({ children, variant = 'default', className = '', style }: BadgeProps) {
  const variantStyles = {
    success: {
      background: 'var(--success-bg)',
      color: 'var(--success)',
    },
    warning: {
      background: 'var(--warning-bg)',
      color: 'var(--warning)',
    },
    danger: {
      background: 'var(--danger-bg)',
      color: 'var(--danger)',
    },
    info: {
      background: 'var(--primary-soft)',
      color: 'var(--primary)',
    },
    default: {
      background: 'var(--surface-soft)',
      color: 'var(--text-secondary)',
      border: '1px solid var(--border)',
    }
  }

  return (
    <span
      className={`admin-badge ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 10px',
        borderRadius: '999px',
        fontSize: '12px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        ...variantStyles[variant],
        ...style
      }}
    >
      {children}
    </span>
  )
}
