import * as React from 'react'

type EmptyStateProps = {
  title: string
  description?: string
  icon?: React.ReactNode
  action?: React.ReactNode
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '64px 32px',
        textAlign: 'center',
        background: 'var(--surface-soft)',
        borderRadius: 'var(--radius)',
        border: '1px dashed var(--border)'
      }}
    >
      {icon && (
        <div style={{ color: 'var(--muted)', marginBottom: '16px', fontSize: '32px' }}>
          {icon}
        </div>
      )}
      <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>
        {title}
      </h3>
      {description && (
        <p style={{ margin: '0 0 24px 0', fontSize: '14px', color: 'var(--text-secondary)', maxWidth: '400px' }}>
          {description}
        </p>
      )}
      {action && <div>{action}</div>}
    </div>
  )
}
