import type { StepId } from '../../types'

const steps: { id: StepId; label: string }[] = [
  { id: 1, label: '데이터 업로드' },
  { id: 2, label: '데이터 확인' },
  { id: 3, label: '이수현황 대시보드' },
]

interface Props {
  current: StepId
  onStep: (id: StepId) => void
  canAdvance: boolean
}

export function StepIndicator({ current, onStep, canAdvance }: Props) {
  return (
    <div className="flex items-center gap-2">
      {steps.map((s, i) => {
        const done = s.id < current
        const active = s.id === current
        const clickable = s.id < current || (s.id === current) || (s.id === current + 1 && canAdvance)
        return (
          <div key={s.id} className="flex items-center gap-2">
            {i > 0 && (
              <div className={`w-8 h-0.5 ${done ? 'bg-brand-500' : 'bg-slate-200'}`} />
            )}
            <button
              onClick={() => clickable && onStep(s.id)}
              disabled={!clickable}
              className={`
                flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                ${active ? 'bg-brand-600 text-white shadow-sm' : ''}
                ${done ? 'bg-brand-50 text-brand-700 hover:bg-brand-100' : ''}
                ${!done && !active ? 'text-slate-400' : ''}
                ${clickable && !active ? 'cursor-pointer' : ''}
                ${!clickable ? 'cursor-default' : ''}
              `}
            >
              <span className={`
                flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold
                ${active ? 'bg-white text-brand-600' : ''}
                ${done ? 'bg-brand-500 text-white' : ''}
                ${!done && !active ? 'bg-slate-200 text-slate-500' : ''}
              `}>
                {done ? '✓' : s.id}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          </div>
        )
      })}
    </div>
  )
}
