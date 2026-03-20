import type { HTMLAttributes } from 'react'

export function Card({ className = '', children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`bg-white border border-slate-200 rounded-2xl shadow-sm ${className}`} {...rest}>
      {children}
    </div>
  )
}
