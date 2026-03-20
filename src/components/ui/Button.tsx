import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const styles: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm',
  secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 shadow-sm',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'sm' | 'md'
}

export function Button({ variant = 'primary', size = 'md', className = '', children, ...rest }: Props) {
  const base = 'inline-flex items-center justify-center font-medium rounded-xl transition-colors disabled:opacity-50 disabled:pointer-events-none'
  const sz = size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-5 py-2.5 text-sm'
  return (
    <button className={`${base} ${sz} ${styles[variant]} ${className}`} {...rest}>
      {children}
    </button>
  )
}
