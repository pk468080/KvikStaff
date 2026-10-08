import * as React from 'react'

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  icon?: React.ReactNode
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', size = 'md', icon, children, disabled, style, ...props }, ref) => {
    const baseStyle: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      fontWeight: 500,
      borderRadius: '8px',
      transition: 'all 0.2s ease',
      border: 'none',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.6 : 1,
      ...style
    }

    const sizeStyles = {
      sm: { padding: '6px 12px', fontSize: '13px' },
      md: { padding: '10px 16px', fontSize: '14px' },
      lg: { padding: '12px 24px', fontSize: '15px' }
    }

    const variantStyles = {
      primary: {
        background: 'var(--primary)',
        color: '#fff',
      },
      secondary: {
        background: 'var(--surface-soft)',
        color: 'var(--text)',
        border: '1px solid var(--border)'
      },
      danger: {
        background: 'var(--danger)',
        color: '#fff'
      },
      outline: {
        background: 'transparent',
        color: 'var(--primary)',
        border: '1px solid var(--primary)'
      },
      ghost: {
        background: 'transparent',
        color: 'var(--text-secondary)'
      }
    }

    return (
      <button
        ref={ref}
        className={`admin-btn ${className}`}
        style={{ ...baseStyle, ...sizeStyles[size], ...variantStyles[variant] }}
        disabled={disabled}
        {...props}
      >
        {icon && <span style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
