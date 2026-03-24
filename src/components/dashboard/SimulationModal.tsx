import { useMemo, useState, useCallback, useEffect } from 'react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { canonGroup } from '../../lib/normalization'
import type { CurriculumCatalog, CurriculumEntry } from '../../types'

/* ─────────── types ─────────── */

type CompletedCourse = {
  과목명: string
  교과: string
  학점: number
  과목학년: number | null
  과목학기: number | null
}

type SemCourse = CurriculumEntry & { key: string }

const SEMESTERS = [
  { y: 1, t: 1, label: '1-1' },
  { y: 1, t: 2, label: '1-2' },
  { y: 2, t: 1, label: '2-1' },
  { y: 2, t: 2, label: '2-2' },
  { y: 3, t: 1, label: '3-1' },
  { y: 3, t: 2, label: '3-2' },
]

/* ─────────── component ─────────── */

export function SimulationModal({
  catalog,
  completedCourses,
  futureCourses,
  baseline,
  onClose,
}: {
  catalog: CurriculumCatalog
  completedCourses: CompletedCourse[]
  futureCourses: CompletedCourse[]
  baseline: { y: number; t: number }
  onClose: () => void
}) {
  // Build set of completed course keys (학기+과목명)
  const completedKeys = useMemo(() => {
    const s = new Set<string>()
    for (const c of completedCourses) {
      s.add(`${c.과목학년}-${c.과목학기}::${c.과목명}`)
    }
    return s
  }, [completedCourses])

  // Build initial future selection keys
  const initialFutureKeys = useMemo(() => {
    const s = new Set<string>()
    for (const c of futureCourses) {
      s.add(`${c.과목학년}-${c.과목학기}::${c.과목명}`)
    }
    return s
  }, [futureCourses])

  // All catalog courses grouped by semester
  const semesterCourses = useMemo(() => {
    const map = new Map<string, SemCourse[]>()
    for (const sem of SEMESTERS) map.set(sem.label, [])

    for (const [과목명, entries] of Object.entries(catalog)) {
      for (const entry of entries) {
        if (entry.과목학년 == null || entry.과목학기 == null) continue
        const semKey = `${entry.과목학년}-${entry.과목학기}`
        const arr = map.get(semKey)
        if (arr) {
          arr.push({ ...entry, 과목명, key: `${semKey}::${과목명}` })
        }
      }
    }

    // Sort each semester's courses by 교과 then 과목명
    for (const arr of map.values()) {
      arr.sort((a, b) =>
        (a.교과 ?? '').localeCompare(b.교과 ?? '', 'ko') ||
        a.과목명.localeCompare(b.과목명, 'ko')
      )
    }

    return map
  }, [catalog])

  // Simulation state: set of selected future course keys
  const [selected, setSelected] = useState<Set<string>>(initialFutureKeys)

  // Reset selections when student changes
  useEffect(() => {
    setSelected(new Set(initialFutureKeys))
  }, [initialFutureKeys])

  const toggle = useCallback((key: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  // Check if a semester is in the past
  const isPastSem = useCallback((y: number, t: number) => {
    if (y < baseline.y) return true
    if (y === baseline.y && t <= baseline.t) return true
    return false
  }, [baseline])

  // Compute 교과(군)별 credit summary from completed + selected future
  const creditSummary = useMemo(() => {
    const grp = new Map<string, { completed: number; simulated: number }>()

    // Completed courses
    for (const c of completedCourses) {
      const g = canonGroup(c.교과)
      const prev = grp.get(g) || { completed: 0, simulated: 0 }
      prev.completed += c.학점
      grp.set(g, prev)
    }

    // Selected future courses from catalog
    for (const [semLabel, courses] of semesterCourses) {
      for (const c of courses) {
        if (!selected.has(c.key)) continue
        if (completedKeys.has(c.key)) continue // already counted
        const g = canonGroup(c.교과)
        const prev = grp.get(g) || { completed: 0, simulated: 0 }
        prev.simulated += c.학점 ?? 0
        grp.set(g, prev)
      }
    }

    return Array.from(grp.entries())
      .map(([교과, v]) => ({ 교과, ...v, total: v.completed + v.simulated }))
      .sort((a, b) => b.total - a.total)
  }, [completedCourses, semesterCourses, selected, completedKeys])

  const totalCompleted = creditSummary.reduce((s, x) => s + x.completed, 0)
  const totalSimulated = creditSummary.reduce((s, x) => s + x.simulated, 0)
  const totalAll = totalCompleted + totalSimulated

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative mt-8 mb-8 w-[95vw] max-w-[1200px] max-h-[calc(100vh-4rem)] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="shrink-0 px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-violet-50 to-brand-50">
          <div>
            <h3 className="text-lg font-bold text-slate-900">수강 시뮬레이션</h3>
            <p className="text-xs text-slate-500 mt-0.5">교육과정의 과목을 선택/해제하여 교과(군)별 학점 변화를 확인하세요.</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl hover:bg-slate-100 flex items-center justify-center transition-colors">
            <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto">
          <div className="flex">
            {/* Left: Semester grid */}
            <div className="flex-1 p-5 overflow-auto">
              <div className="grid grid-cols-2 gap-4">
                {SEMESTERS.map((sem) => {
                  const courses = semesterCourses.get(sem.label) || []
                  const past = isPastSem(sem.y, sem.t)
                  const semSelected = courses.filter(c => selected.has(c.key) || completedKeys.has(c.key)).length
                  const semCredits = courses
                    .filter(c => selected.has(c.key) || completedKeys.has(c.key))
                    .reduce((s, c) => s + (c.학점 ?? 0), 0)

                  return (
                    <Card key={sem.label} className="p-0 overflow-hidden">
                      <div className={`flex items-center justify-between px-4 py-2.5 border-b ${
                        past
                          ? 'bg-slate-50 border-slate-100'
                          : 'bg-gradient-to-r from-violet-50 to-brand-50 border-brand-100'
                      }`}>
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                            past ? 'bg-slate-200 text-slate-500' : 'bg-brand-100 text-brand-700'
                          }`}>
                            {sem.label}
                          </div>
                          <div>
                            <div className="font-semibold text-sm text-slate-800">{sem.y}학년 {sem.t}학기</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-slate-500">{semSelected}/{courses.length}과목</div>
                          <div className="text-xs font-semibold text-slate-700 tabular-nums">{semCredits}학점</div>
                        </div>
                      </div>

                      <div className="px-3 py-2 max-h-[280px] overflow-auto">
                        {courses.length === 0 ? (
                          <div className="text-xs text-slate-400 py-3 text-center">개설 과목 없음</div>
                        ) : (
                          <div className="space-y-0.5">
                            {courses.map((c) => {
                              const isCompleted = completedKeys.has(c.key)
                              const isChecked = isCompleted || selected.has(c.key)
                              const isSchoolRequired = (c.과목구분 ?? '').replace(/\s+/g, '') === '학교지정'
                              return (
                                <label
                                  key={c.key}
                                  className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-all duration-150 ${
                                    isCompleted
                                      ? 'bg-slate-50 opacity-60'
                                      : isChecked
                                        ? 'bg-brand-50/70 hover:bg-brand-50'
                                        : 'hover:bg-slate-50'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    disabled={isCompleted}
                                    onChange={() => !isCompleted && toggle(c.key)}
                                    className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 focus:ring-offset-0 disabled:opacity-40 shrink-0"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className={`text-sm truncate ${isChecked ? 'font-medium text-slate-800' : 'text-slate-600'}`}>
                                        {c.과목명}
                                      </span>
                                      {isSchoolRequired && (
                                        <span className="shrink-0 px-1 py-0.5 rounded text-[9px] font-semibold bg-slate-200 text-slate-500">필수</span>
                                      )}
                                      {isCompleted && (
                                        <span className="shrink-0 px-1 py-0.5 rounded text-[9px] font-semibold bg-emerald-100 text-emerald-600">이수</span>
                                      )}
                                    </div>
                                    <div className="text-[11px] text-slate-400 mt-0.5">
                                      {canonGroup(c.교과)} · {c.학점}학점
                                    </div>
                                  </div>
                                </label>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </Card>
                  )
                })}
              </div>
            </div>

            {/* Right: Credit summary sidebar */}
            <div className="w-[300px] shrink-0 border-l border-slate-100 bg-slate-50/50 p-5 overflow-auto">
              <div className="sticky top-0">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">교과(군)별 학점</div>

                {/* Total KPI */}
                <Card className="p-4 mb-4">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-slate-900 tabular-nums">{totalAll}</div>
                    <div className="text-xs text-slate-500 mt-1">총 학점</div>
                  </div>
                  <div className="flex justify-center gap-4 mt-3">
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <span className="w-2.5 h-2.5 rounded-full bg-brand-500" /> 이수 {totalCompleted}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <span className="w-2.5 h-2.5 rounded-full bg-violet-400" /> 시뮬 {totalSimulated}
                    </span>
                  </div>
                </Card>

                {/* Per-group breakdown */}
                <div className="space-y-2">
                  {creditSummary.map((g) => {
                    const max = Math.max(1, ...creditSummary.map(x => x.total))
                    const completedPct = (g.completed / max) * 100
                    const simPct = (g.simulated / max) * 100
                    return (
                      <div key={g.교과}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-slate-700 truncate" title={g.교과}>{g.교과}</span>
                          <span className="text-xs tabular-nums text-slate-500 shrink-0 ml-2">
                            {g.completed}
                            {g.simulated > 0 && <span className="text-violet-500"> +{g.simulated}</span>}
                          </span>
                        </div>
                        <div className="h-2 bg-slate-200 rounded-full overflow-hidden flex">
                          <div
                            className="h-full bg-brand-500 transition-all duration-300"
                            style={{ width: `${completedPct}%` }}
                          />
                          <div
                            className="h-full bg-violet-400 transition-all duration-300"
                            style={{ width: `${simPct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>

                {creditSummary.length === 0 && (
                  <div className="text-sm text-slate-400 text-center py-4">과목을 선택하세요</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-6 py-3 border-t border-slate-100 bg-white flex items-center justify-between">
          <div className="text-xs text-slate-500">
            이수완료 과목은 변경할 수 없습니다. 미래 학기의 과목만 선택/해제 가능합니다.
          </div>
          <Button variant="secondary" size="sm" onClick={onClose}>닫기</Button>
        </div>
      </div>
    </div>
  )
}
