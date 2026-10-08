import * as React from 'react'

export function DataTable({ children, className = '', style }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div style={{ overflowX: 'auto', width: '100%' }}>
      <table
        className={`admin-data-table ${className}`}
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          textAlign: 'left',
          fontSize: '14px',
          ...style
        }}
      >
        {children}
      </table>
    </div>
  )
}

export function TableHeader({ children }: { children: React.ReactNode }) {
  return <thead>{children}</thead>
}

export function TableBody({ children }: { children: React.ReactNode }) {
  return <tbody>{children}</tbody>
}

export function TableRow({ children, className = '', style, onClick }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={`admin-table-row ${className}`}
      style={{
        borderBottom: '1px solid var(--border)',
        transition: 'background-color 0.2s',
        cursor: onClick ? 'pointer' : 'default',
        ...style
      }}
      onClick={onClick}
    >
      {children}
    </tr>
  )
}

export function TableHead({ children, className = '', style }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={className}
      style={{
        padding: '12px 16px',
        fontWeight: 600,
        color: 'var(--text-secondary)',
        textTransform: 'uppercase',
        fontSize: '11px',
        letterSpacing: '0.5px',
        background: 'var(--surface-soft)',
        ...style
      }}
    >
      {children}
    </th>
  )
}

export function TableCell({ children, className = '', style }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={className}
      style={{
        padding: '16px',
        color: 'var(--text)',
        verticalAlign: 'middle',
        ...style
      }}
    >
      {children}
    </td>
  )
}
