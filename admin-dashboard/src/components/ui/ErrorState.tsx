import React from 'react'
import { Button } from './Button'

type ErrorStateProps = {
  title?: string
  message: string
  onRetry?: () => void
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }: ErrorStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 32px',
        textAlign: 'center',
        background: 'var(--danger-bg)',
        borderRadius: 'var(--radius)',
        color: 'var(--danger)'
      }}
    >
      <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 600 }}>
        {title}
      </h3>
      <p style={{ margin: '0 0 24px 0', fontSize: '14px', opacity: 0.9 }}>
        {message}
      </p>
      {onRetry && (
        <Button variant="danger" onClick={onRetry}>
          Try Again
        </Button>
      )}
    </div>
  )
}
