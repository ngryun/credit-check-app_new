import { Badge } from '../ui/Badge'
import { FileDropZone } from './FileDropZone'
import type { ReactNode } from 'react'

type Status = 'idle' | 'loading' | 'done' | 'error'

interface Props {
  title: string
  description: string
  hint?: ReactNode
  status: Status
  statusText?: string
  accept?: string
  multiple?: boolean
  onFiles: (files: File[]) => void
  extra?: ReactNode
}

const statusBadge: Record<Status, { variant: 'default' | 'warning' | 'success' | 'danger'; label: string }> = {
  idle: { variant: 'default', label: '미업로드' },
  loading: { variant: 'warning', label: '처리중...' },
  done: { variant: 'success', label: '완료' },
  error: { variant: 'danger', label: '오류' },
}

export function FileUploadCard({ title, description, hint, status, statusText, accept, multiple, onFiles, extra }: Props) {
  const badge = statusBadge[status]
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-slate-800">{title}</div>
          <div className="text-sm text-slate-500 mt-0.5">{description}</div>
        </div>
        <Badge variant={badge.variant}>
          {badge.label}{statusText ? ` ${statusText}` : ''}
        </Badge>
      </div>
      <FileDropZone onFiles={onFiles} accept={accept} multiple={multiple}>
        <div className="py-4">
          <svg className="mx-auto h-8 w-8 text-slate-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <div className="text-sm text-slate-500">
            클릭 또는 파일을 드래그하여 업로드
            {multiple && <span className="text-slate-400 ml-1">(복수 파일 가능)</span>}
          </div>
        </div>
      </FileDropZone>
      {hint && <div className="text-xs text-slate-400">{hint}</div>}
      {extra}
    </div>
  )
}
