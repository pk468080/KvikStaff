import * as React from 'react'

type PageHeaderProps = {
  title: string
  description?: string
  action?: React.ReactNode
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: '24px',
        gap: '16px',
        flexWrap: 'wrap'
      }}
    >
      <div>
        <h1
          style={{
            margin: 0,
            fontSize: '24px',
            fontWeight: 700,
            color: 'var(--text)'
          }}
        >
          {title}
        </h1>
        {description && (
          <p
            style={{
              margin: '8px 0 0',
              color: 'var(--text-secondary)',
              fontSize: '14px'
            }}
          >
            {description}
          </p>
        )}
      </div>

      {action && (
        <div style={{ display: 'flex', gap: '12px' }}>
          {action}
        </div>
      )}
    </div>
  )
}
