import { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { useApp } from '../../store/app-context'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { FileDropZone } from '../upload/FileDropZone'
import { canonGroup, isKoreanHistory } from '../../lib/normalization'
import { buildChecks } from '../../lib/prerequisite-check'
import { exportAllStudentSummary } from '../../lib/export'
import { readRowsFromSheet, XLSX } from '../../lib/xlsx-helpers'
import type { Row } from '../../types'

export function Step3Dashboard() {
  const { state, dispatch, mergedRows } = useApp()
  const [showDirectUpload, setShowDirectUpload] = useState(false)

  // direct upload handler
  const handleDirectUpload = useCallback(async (files: File[]) => {
    const f = files[0]
    if (!f) return
    const buf = await f.arrayBuffer()
    const wb = XLSX.read(buf)
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = readRowsFromSheet(ws)
    dispatch({ type: 'SET_OVERRIDE', rows })
  }, [dispatch])

  // student data aggregation
  const byStudent = useMemo(() => {
    const m = new Map<string, { key: string; 학년: number | null; 반: number | null; 번호: number | null; 이름: string | null; rows: Row[] }>()
    for (const r of mergedRows) {
      if (r.학년 == null || r.반 == null || r.번호 == null) continue
      const key = `${r.학년}-${r.반}-${r.번호}`
      const prev = m.get(key)
      if (!prev) m.set(key, { key, 학년: r.학년, 반: r.반, 번호: r.번호, 이름: r.이름 ?? null, rows: [r] })
      else prev.rows.push(r)
    }
    const arr = Array.from(m.values()).map((s) => {
      const total = s.rows.reduce((sum, r) => sum + (r.학점 || 0), 0)
      return { ...s, 총학점: total }
    })
    arr.sort((a, b) => (a.학년! - b.학년!) || (a.반! - b.반!) || (a.번호! - b.번호!))
    return { list: arr, map: m }
  }, [mergedRows])

  // class list
  const classes = useMemo(() => {
    const set = new Set<string>()
    for (const r of mergedRows) if (r.학년 != null && r.반 != null) set.add(`${r.학년}-${r.반}`)
    return Array.from(set).sort((a, b) => {
      const [ag, ac] = a.split('-').map(Number)
      const [bg, bc] = b.split('-').map(Number)
      return ag - bg || ac - bc
    })
  }, [mergedRows])

  const { selectedClass: klass, selectedStudent: selected, searchQuery: query } = state

  const studentsInClass = useMemo(() => {
    if (!klass) return []
    const [g, c] = klass.split('-').map(Number)
    const m = new Map<string, string>()
    for (const r of mergedRows) {
      if (r.학년 === g && r.반 === c && r.번호 != null) {
        const key = `${g}-${c}-${r.번호}`
        m.set(key, `${String(r.번호).padStart(2, '0')} ${r.이름 ?? ''}`)
      }
    }
    return Array.from(m, ([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label, 'ko'))
  }, [mergedRows, klass])

  const filtered = studentsInClass.filter((s) => s.label.includes(query))
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!selected) return
    const el = listRef.current?.querySelector(`button[data-key="${selected}"]`) as HTMLElement | null
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [selected])

  function handleListKey(e: React.KeyboardEvent) {
    if (!filtered.length) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const idx = filtered.findIndex((s) => s.key === selected)
      let next = idx
      if (e.key === 'ArrowDown') next = idx < 0 ? 0 : Math.min(idx + 1, filtered.length - 1)
      else next = idx < 0 ? 0 : Math.max(idx - 1, 0)
      dispatch({ type: 'SET_STUDENT', value: filtered[next].key })
    }
  }

  // student detail
  const studentDet = useMemo(() => {
    if (!selected) return null
    const s = byStudent.map.get(selected)
    if (!s) return null
    const list = s.rows.map((r) => ({
      교과: canonGroup(r.교과),
      과목명: r.과목명 || '',
      학점: r.학점 || 0,
      과목학년: r.과목학년 ?? null,
      과목학기: r.과목학기 ?? null,
    }))
    const grp = new Map<string, number>()
    for (const r of list) grp.set(r.교과, (grp.get(r.교과) || 0) + r.학점)
    const byGroup = Array.from(grp, ([교과, 총학점]) => ({ 교과, 총학점 }))
    return { 이름: s.이름, list, byGroup }
  }, [selected, byStudent])

  const totalStudents = useMemo(() => {
    const set = new Set<string>()
    for (const r of mergedRows) if (r.학년 != null && r.반 != null && r.번호 != null) set.add(`${r.학년}-${r.반}-${r.번호}`)
    return set.size
  }, [mergedRows])

  const avgCredits = useMemo(() => {
    if (!byStudent.list.length) return 0
    return Math.round(byStudent.list.reduce((s, r) => s + r.총학점, 0) / byStudent.list.length * 100) / 100
  }, [byStudent])

  if (!mergedRows.length && !showDirectUpload) {
    return (
      <div className="max-w-xl mx-auto text-center py-16 space-y-4">
        <div className="text-slate-400 text-5xl mb-4">📊</div>
        <h2 className="text-xl font-bold text-slate-700">데이터가 없습니다</h2>
        <p className="text-sm text-slate-500">Step 1에서 데이터를 업로드하거나, 정리완료.xlsx 파일을 직접 업로드하세요.</p>
        <div className="flex justify-center gap-3">
          <Button variant="secondary" onClick={() => dispatch({ type: 'SET_STEP', step: 1 })}>Step 1으로 이동</Button>
          <Button onClick={() => setShowDirectUpload(true)}>직접 업로드</Button>
        </div>
        {showDirectUpload && (
          <div className="mt-4 max-w-md mx-auto">
            <FileDropZone onFiles={handleDirectUpload} accept=".xlsx,.xls">
              <div className="py-4 text-sm text-slate-500">정리완료.xlsx 파일을 드래그하세요</div>
            </FileDropZone>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">이수현황 대시보드</h2>
          <p className="text-sm text-slate-500">학급과 학생을 선택하여 이수현황을 점검하세요.</p>
        </div>
        <div className="flex gap-2">
          {!state.overrideRows && (
            <Button variant="ghost" size="sm" onClick={() => setShowDirectUpload(!showDirectUpload)}>
              직접 업로드
            </Button>
          )}
          {state.overrideRows && (
            <Button variant="ghost" size="sm" onClick={() => dispatch({ type: 'CLEAR_OVERRIDE' })}>
              원본 데이터로 복원
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => exportAllStudentSummary(mergedRows)}>
            내보내기 (XLSX)
          </Button>
        </div>
      </div>

      {showDirectUpload && (
        <Card className="p-4">
          <FileDropZone onFiles={handleDirectUpload} accept=".xlsx,.xls">
            <div className="py-3 text-sm text-slate-500">정리완료.xlsx 파일을 드래그하거나 클릭하세요</div>
          </FileDropZone>
        </Card>
      )}

      {/* KPI */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="text-xs text-slate-500">총 행 수</div>
          <div className="text-xl font-bold font-mono">{mergedRows.length.toLocaleString()}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-slate-500">학생 수</div>
          <div className="text-xl font-bold font-mono">{totalStudents}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-slate-500">학생당 평균 학점</div>
          <div className="text-xl font-bold font-mono">{avgCredits}</div>
        </Card>
      </div>

      {/* Main layout */}
      <div className="grid md:grid-cols-4 gap-4">
        {/* Sidebar */}
        <div className="md:col-span-1 space-y-3">
          <Card className="p-4">
            <div className="text-sm font-semibold mb-2">학급 선택</div>
            <select
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-400"
              value={klass ?? ''}
              onChange={(e) => dispatch({ type: 'SET_CLASS', value: e.target.value || null })}
            >
              <option value="">학급을 선택하세요</option>
              {classes.map((k) => <option key={k} value={k}>{k.replace('-', '학년 ') + '반'}</option>)}
            </select>
          </Card>

          {klass && (
            <Card className="p-4">
              <div className="text-sm font-semibold mb-2">학생 검색</div>
              <input
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-400 mb-2"
                placeholder="이름 또는 번호"
                value={query}
                onChange={(e) => dispatch({ type: 'SET_QUERY', value: e.target.value })}
              />
              <div
                className="max-h-[600px] overflow-auto border border-slate-200 rounded-xl"
                onKeyDown={handleListKey}
                tabIndex={0}
                ref={listRef}
                role="listbox"
              >
                {filtered.map((s) => (
                  <button
                    key={s.key}
                    data-key={s.key}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-brand-50 ${selected === s.key ? 'bg-brand-100 font-medium text-brand-700' : ''}`}
                    onClick={() => dispatch({ type: 'SET_STUDENT', value: s.key })}
                    role="option"
                    aria-selected={selected === s.key}
                  >
                    {s.label}
                  </button>
                ))}
                {filtered.length === 0 && <div className="p-3 text-sm text-slate-400">검색 결과 없음</div>}
              </div>
            </Card>
          )}
        </div>

        {/* Detail panel */}
        <div className="md:col-span-3 space-y-4">
          {!selected && (
            <Card className="p-8 text-center">
              <div className="text-slate-400 text-4xl mb-3">👈</div>
              <div className="text-sm text-slate-500">좌측에서 학급과 학생을 선택하세요.</div>
            </Card>
          )}

          {selected && studentDet && (() => {
            const total = studentDet.list.reduce((s, r) => s + r.학점, 0)
            const foundation = new Set(['국어', '수학', '영어'])
            const baseOnly = studentDet.list.reduce((s, r) => s + (foundation.has(r.교과) ? r.학점 : 0), 0)
            const khOnly = studentDet.list.reduce((s, r) => s + (isKoreanHistory(r.과목명) ? r.학점 : 0), 0)
            const combined = baseOnly + khOnly
            const pct = total > 0 ? Math.round((combined / total) * 1000) / 10 : 0
            const checks = buildChecks(studentDet.list)
            const hasViolation = checks.hierarchyViolations.length > 0 || checks.prereqViolations.length > 0

            const studentLabel = studentsInClass.find((s) => s.key === selected)?.label ?? selected

            // group by 교과
            const groupMap = new Map<string, typeof studentDet.list>()
            for (const r of studentDet.list) {
              const arr = groupMap.get(r.교과) || []
              arr.push(r)
              groupMap.set(r.교과, arr)
            }
            const groups = Array.from(groupMap.entries()).sort((a, b) => a[0].localeCompare(b[0], 'ko'))

            return (
              <>
                {/* Student header */}
                <Card className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="text-lg font-bold">{klass?.replace('-', '학년 ') + '반'} · {studentLabel}</div>
                    </div>
                    {hasViolation && <Badge variant="danger">점검 필요</Badge>}
                    {!hasViolation && <Badge variant="success">정상</Badge>}
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    {/* Credits KPI */}
                    <div className="bg-slate-50 rounded-xl p-4">
                      <div className="text-xs text-slate-500">전체 이수학점</div>
                      <div className="text-3xl font-bold font-mono">{total}</div>
                      <div className="mt-2 text-sm text-slate-600">
                        기초교과 + 한국사: <span className="font-semibold">{baseOnly} + {khOnly}</span>
                        {' '}(<span className={pct > 50 ? 'text-rose-600 font-bold' : 'text-emerald-600'}>{pct}%</span>)
                      </div>
                      {pct > 50 && <div className="mt-1 text-xs text-rose-600 font-medium">⚠ 기초교과 비율 50% 초과</div>}
                    </div>

                    {/* Bar chart */}
                    <div className="bg-slate-50 rounded-xl p-4">
                      <div className="text-xs text-slate-500 mb-2">교과별 이수학점</div>
                      <div className="space-y-1.5">
                        {(() => {
                          const max = Math.max(1, ...studentDet.byGroup.map((x) => x.총학점))
                          return studentDet.byGroup.map((x) => (
                            <div key={x.교과} className="flex items-center gap-2">
                              <div className="w-24 text-xs text-slate-600 truncate" title={x.교과}>{x.교과}</div>
                              <div className="flex-1 h-2.5 bg-slate-200 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-brand-500 rounded-full transition-all duration-500"
                                  style={{ width: `${Math.round((x.총학점 / max) * 100)}%` }}
                                />
                              </div>
                              <div className="w-8 text-right text-xs font-mono">{x.총학점}</div>
                            </div>
                          ))
                        })()}
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Violation panel */}
                <Card className="p-5">
                  <div className="text-sm font-semibold mb-2">위계 과목 점검</div>
                  {!hasViolation && <div className="text-sm text-emerald-600">위계/선후수 위반 없음</div>}
                  {checks.hierarchyViolations.length > 0 && (
                    <div className="mb-2">
                      <div className="text-xs font-medium text-slate-700 mb-1">로마자 위계 위반</div>
                      <ul className="space-y-1">
                        {checks.hierarchyViolations.map((v, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <span className="text-rose-500 mt-0.5">●</span>
                            <span><strong>{v.base}</strong>: 이수 {v.have.join(', ')} → 누락 <span className="text-rose-600 font-medium">{v.missing.join(', ')}</span></span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {checks.prereqViolations.length > 0 && (
                    <ul className="space-y-1">
                      {checks.prereqViolations.map((v, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="text-amber-500 mt-0.5">●</span>
                          <span><strong>{v.course}</strong>: 선수 누락 → <span className="text-rose-600 font-medium">{v.missing.join(', ')}</span></span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                {/* Subject group tables */}
                <div className="grid sm:grid-cols-2 gap-4">
                  {groups.map(([g, list]) => {
                    const sorted = [...list].sort((a, b) => {
                      const ay = a.과목학년 ?? 9999; const by = b.과목학년 ?? 9999
                      if (ay !== by) return ay - by
                      const at = a.과목학기 ?? 9999; const bt = b.과목학기 ?? 9999
                      if (at !== bt) return at - bt
                      return (a.과목명 || '').localeCompare(b.과목명 || '', 'ko')
                    })
                    return (
                      <Card key={g} className="p-4">
                        <div className="font-semibold text-sm mb-2">{g}</div>
                        <div className="border border-slate-200 rounded-xl overflow-hidden">
                          <table className="w-full border-collapse text-sm">
                            <thead>
                              <tr className="bg-slate-50">
                                <th className="p-2 text-left text-xs font-semibold text-slate-600">과목명</th>
                                <th className="p-2 text-right text-xs font-semibold text-slate-600">학점</th>
                                <th className="p-2 text-left text-xs font-semibold text-slate-600">학년</th>
                                <th className="p-2 text-left text-xs font-semibold text-slate-600">학기</th>
                              </tr>
                            </thead>
                            <tbody>
                              {sorted.map((r, i) => (
                                <tr key={i} className="hover:bg-slate-50/80 even:bg-slate-50/30">
                                  <td className="p-2 border-t border-slate-100">{r.과목명}</td>
                                  <td className="p-2 border-t border-slate-100 text-right font-mono">{r.학점}</td>
                                  <td className="p-2 border-t border-slate-100 font-mono">{r.과목학년 ?? ''}</td>
                                  <td className="p-2 border-t border-slate-100 font-mono">{r.과목학기 ?? ''}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              </>
            )
          })()}
        </div>
      </div>
    </div>
  )
}
