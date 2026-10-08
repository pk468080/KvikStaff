import * as React from 'react'

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  children: React.ReactNode
}

export function Card({ children, className = '', style, ...props }: CardProps) {
  return (
    <div
      className={`admin-card ${className}`}
      style={{
        background: 'var(--surface)',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(10,57,114,0.05))',
        ...style
      }}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className = '', style, ...props }: CardProps) {
  return (
    <div
      className={`admin-card-header ${className}`}
      style={{
        padding: '20px 24px',
        borderBottom: '1px solid var(--border)',
        ...style
      }}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardContent({ children, className = '', style, ...props }: CardProps) {
  return (
    <div
      className={`admin-card-content ${className}`}
      style={{
        padding: '24px',
        ...style
      }}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardTitle({ children, className = '', style, ...props }: CardProps) {
  return (
    <h3
      className={`admin-card-title ${className}`}
      style={{
        margin: 0,
        fontSize: '16px',
        fontWeight: 600,
        color: 'var(--text)',
        ...style
      }}
      {...props}
    >
      {children}
    </h3>
  )
}
