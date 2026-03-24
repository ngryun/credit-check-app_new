import { Badge } from '../ui/Badge'
import { FileDropZone } from './FileDropZone'
import type { ReactNode } from 'react'

type Status = 'idle' | 'loading' | 'done' | 'error'

interface Props {
  title: string
  subtitle?: string
  description: string
  hint?: ReactNode
  status: Status
  statusText?: string
  accept?: string
  multiple?: boolean
  optional?: boolean
  onFiles: (files: File[]) => void
  extra?: ReactNode
}

const statusBadge: Record<Status, { variant: 'default' | 'warning' | 'success' | 'danger'; label: string }> = {
  idle: { variant: 'default', label: '미업로드' },
  loading: { variant: 'warning', label: '처리중...' },
  done: { variant: 'success', label: '완료' },
  error: { variant: 'danger', label: '오류' },
}

export function FileUploadCard({ title, subtitle, description, hint, status, statusText, accept, multiple, optional, onFiles, extra }: Props) {
  const badge = statusBadge[status]
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-800 text-sm">{title}</span>
            {subtitle && <span className="text-xs text-slate-400">{subtitle}</span>}
            {optional && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">선택</span>}
          </div>
          <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">{description}</div>
        </div>
        <Badge variant={badge.variant}>
          {badge.label}{statusText ? ` ${statusText}` : ''}
        </Badge>
      </div>
      <FileDropZone onFiles={onFiles} accept={accept} multiple={multiple}>
        <div className="py-2.5 flex items-center justify-center gap-2">
          <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <span className="text-sm text-slate-500">
            클릭 또는 드래그하여 업로드
            {multiple && <span className="text-slate-400 ml-1">(복수 파일)</span>}
          </span>
        </div>
      </FileDropZone>
      {hint && <div className="text-xs text-slate-400 leading-relaxed">{hint}</div>}
      {extra}
    </div>
  )
}
