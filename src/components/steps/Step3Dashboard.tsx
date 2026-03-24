import { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { useApp } from '../../store/app-context'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { FileDropZone } from '../upload/FileDropZone'
import { canonGroup, isKoreanHistory } from '../../lib/normalization'
import { buildChecks } from '../../lib/prerequisite-check'
import { exportAllStudentSummary } from '../../lib/export'
import { downloadStandaloneHtml } from '../../lib/standalone-export'
import { readRowsFromSheet, XLSX } from '../../lib/xlsx-helpers'
import type { Row, CurriculumCatalog } from '../../types'
import { SimulationModal } from '../dashboard/SimulationModal'

/* ─────────── helpers ─────────── */

type DetailRow = {
  교과: string
  과목명: string
  학점: number
  과목학년: number | null
  과목학기: number | null
  isFuture: boolean
}

const SEMESTERS = [
  { y: 1, t: 1, label: '1-1' },
  { y: 1, t: 2, label: '1-2' },
  { y: 2, t: 1, label: '2-1' },
  { y: 2, t: 2, label: '2-2' },
  { y: 3, t: 1, label: '3-1' },
  { y: 3, t: 2, label: '3-2' },
]

function semLabel(y: number | null, t: number | null) {
  if (y == null) return '미정'
  if (t == null) return `${y}학년`
  return `${y}-${t}`
}

/* ─────────── main ─────────── */

export function Step3Dashboard() {
  const { state, dispatch, mergedRows, baseline } = useApp()
  const [showDirectUpload, setShowDirectUpload] = useState(false)
  const [viewTab, setViewTab] = useState<'subject' | 'semester'>('subject')

  const handleDirectUpload = useCallback(async (files: File[]) => {
    const f = files[0]
    if (!f) return
    const buf = await f.arrayBuffer()
    const wb = XLSX.read(buf)
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = readRowsFromSheet(ws)
    dispatch({ type: 'SET_OVERRIDE', rows })
  }, [dispatch])

  /* ── student aggregation ── */
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

  /* ── class list ── */
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

  /* ── student detail ── */
  const studentDet = useMemo(() => {
    if (!selected) return null
    const s = byStudent.map.get(selected)
    if (!s) return null
    const list: DetailRow[] = s.rows.map((r) => ({
      교과: canonGroup(r.교과),
      과목명: r.과목명 || '',
      학점: r.학점 || 0,
      과목학년: r.과목학년 ?? null,
      과목학기: r.과목학기 ?? null,
      isFuture: r._source === 'future',
    }))
    const grp = new Map<string, number>()
    for (const r of list) grp.set(r.교과, (grp.get(r.교과) || 0) + r.학점)
    const byGroup = Array.from(grp, ([교과, 총학점]) => ({ 교과, 총학점 }))
    return { 이름: s.이름, list, byGroup }
  }, [selected, byStudent])

  /* ── per-student violation map ── */
  const violationMap = useMemo(() => {
    const m = new Map<string, boolean>()
    for (const s of byStudent.list) {
      const list = s.rows.map((r) => ({
        교과: canonGroup(r.교과),
        과목명: r.과목명 || '',
        학점: r.학점 || 0,
        과목학년: r.과목학년 ?? null,
        과목학기: r.과목학기 ?? null,
      }))
      const checks = buildChecks(list)
      m.set(s.key, checks.hierarchyViolations.length > 0 || checks.prereqViolations.length > 0)
    }
    return m
  }, [byStudent])

  /* ── empty state ── */
  if (!mergedRows.length && !showDirectUpload) {
    return (
      <div className="max-w-xl mx-auto text-center py-20 space-y-5">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-100 to-brand-200 flex items-center justify-center mx-auto">
          <svg className="w-8 h-8 text-brand-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" /></svg>
        </div>
        <h2 className="text-xl font-bold text-slate-800">데이터가 없습니다</h2>
        <p className="text-sm text-slate-500 leading-relaxed">Step 1에서 데이터를 업로드하거나,<br/>정리완료.xlsx 파일을 직접 업로드하세요.</p>
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
    <div className="space-y-5">
      {/* ═══ Header ═══ */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">이수현황 대시보드</h2>
          <p className="text-sm text-slate-500 mt-0.5">학급과 학생을 선택하여 이수현황을 점검하세요.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {!state.isEmbedded && !state.overrideRows && (
            <Button variant="ghost" size="sm" onClick={() => setShowDirectUpload(!showDirectUpload)}>직접 업로드</Button>
          )}
          {!state.isEmbedded && state.overrideRows && (
            <Button variant="ghost" size="sm" onClick={() => dispatch({ type: 'CLEAR_OVERRIDE' })}>원본 데이터로 복원</Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => exportAllStudentSummary(mergedRows)}>
            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
            내보내기
          </Button>
          {!state.isEmbedded && (
            <Button variant="secondary" size="sm" onClick={() => downloadStandaloneHtml(mergedRows)}>
              <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" /></svg>
              담임선생님용 공유파일
            </Button>
          )}
        </div>
      </div>

      {showDirectUpload && (
        <Card className="p-4">
          <FileDropZone onFiles={handleDirectUpload} accept=".xlsx,.xls">
            <div className="py-3 text-sm text-slate-500">정리완료.xlsx 파일을 드래그하거나 클릭하세요</div>
          </FileDropZone>
        </Card>
      )}

      {/* ═══ Main Layout ═══ */}
      <div className="grid md:grid-cols-[280px_1fr] gap-5">
        {/* ── Sidebar ── */}
        <div className="space-y-4">
          <Card className="p-0 overflow-hidden">
            <div className="px-4 pt-4 pb-3">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">학급 선택</div>
              <select
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400 transition-shadow"
                value={klass ?? ''}
                onChange={(e) => dispatch({ type: 'SET_CLASS', value: e.target.value || null })}
              >
                <option value="">학급을 선택하세요</option>
                {classes.map((k) => <option key={k} value={k}>{k.replace('-', '학년 ') + '반'}</option>)}
              </select>
            </div>

            {klass && (
              <div className="border-t border-slate-100">
                <div className="px-4 pt-3 pb-2">
                  <div className="relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                    <input
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400 transition-shadow placeholder:text-slate-400"
                      placeholder="이름 또는 번호 검색"
                      value={query}
                      onChange={(e) => dispatch({ type: 'SET_QUERY', value: e.target.value })}
                    />
                  </div>
                </div>
                <div
                  className="max-h-[560px] overflow-auto"
                  onKeyDown={handleListKey}
                  tabIndex={0}
                  ref={listRef}
                  role="listbox"
                >
                  {filtered.map((s) => {
                    const hasIssue = violationMap.get(s.key) ?? false
                    return (
                      <button
                        key={s.key}
                        data-key={s.key}
                        className={`w-full text-left px-4 py-2.5 text-sm transition-all duration-150 border-l-2 flex items-center justify-between
                          ${selected === s.key
                            ? 'bg-brand-50 border-l-brand-500 text-brand-700 font-medium'
                            : 'border-l-transparent hover:bg-slate-50 text-slate-700'
                          }`}
                        onClick={() => dispatch({ type: 'SET_STUDENT', value: s.key })}
                        role="option"
                        aria-selected={selected === s.key}
                      >
                        <span>{s.label}</span>
                        {hasIssue && <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" title="점검 필요" />}
                      </button>
                    )
                  })}
                  {filtered.length === 0 && <div className="px-4 py-6 text-sm text-slate-400 text-center">검색 결과 없음</div>}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* ── Detail Panel ── */}
        <div className="space-y-5">
          {!selected && (
            <Card className="p-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
              </div>
              <div className="text-sm text-slate-500">좌측에서 학급과 학생을 선택하세요.</div>
            </Card>
          )}

          {selected && studentDet && <StudentDetailPanel
            klass={klass}
            selected={selected}
            studentDet={studentDet}
            studentsInClass={studentsInClass}
            viewTab={viewTab}
            setViewTab={setViewTab}
            catalog={state.curriculumCatalog}
            baseline={baseline.get(selected) ?? { y: 0, t: 0 }}
          />}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════
   Student Detail Panel (extracted for clarity)
   ═══════════════════════════════════════════════ */

function StudentDetailPanel({
  klass,
  selected,
  studentDet,
  studentsInClass,
  viewTab,
  setViewTab,
  catalog,
  baseline,
}: {
  klass: string | null
  selected: string
  studentDet: { 이름: string | null; list: DetailRow[]; byGroup: { 교과: string; 총학점: number }[] }
  studentsInClass: { key: string; label: string }[]
  viewTab: 'subject' | 'semester'
  setViewTab: (v: 'subject' | 'semester') => void
  catalog: CurriculumCatalog | null
  baseline: { y: number; t: number }
}) {
  const [showSim, setShowSim] = useState(false)
  const total = studentDet.list.reduce((s, r) => s + r.학점, 0)
  const completedCredits = studentDet.list.filter(r => !r.isFuture).reduce((s, r) => s + r.학점, 0)
  const futureCredits = studentDet.list.filter(r => r.isFuture).reduce((s, r) => s + r.학점, 0)
  const foundation = new Set(['국어', '수학', '영어'])
  const baseOnly = studentDet.list.reduce((s, r) => s + (foundation.has(r.교과) ? r.학점 : 0), 0)
  const khOnly = studentDet.list.reduce((s, r) => s + (isKoreanHistory(r.과목명) ? r.학점 : 0), 0)
  const combined = baseOnly + khOnly
  const pct = total > 0 ? Math.round((combined / total) * 1000) / 10 : 0
  const checks = buildChecks(studentDet.list)
  const hasViolation = checks.hierarchyViolations.length > 0 || checks.prereqViolations.length > 0
  const studentLabel = studentsInClass.find((s) => s.key === selected)?.label ?? selected

  // group by 교과
  const groupMap = new Map<string, DetailRow[]>()
  for (const r of studentDet.list) {
    const arr = groupMap.get(r.교과) || []
    arr.push(r)
    groupMap.set(r.교과, arr)
  }
  const groups = Array.from(groupMap.entries()).sort((a, b) => a[0].localeCompare(b[0], 'ko'))

  // group by semester
  const semMap = new Map<string, DetailRow[]>()
  for (const r of studentDet.list) {
    const key = semLabel(r.과목학년, r.과목학기)
    const arr = semMap.get(key) || []
    arr.push(r)
    semMap.set(key, arr)
  }
  const semGroups = SEMESTERS
    .map((s) => ({ ...s, rows: semMap.get(s.label) || [] }))
    .filter((s) => s.rows.length > 0)

  return (
    <>
      {/* ── Student Header ── */}
      <Card className="p-0 overflow-hidden">
        <div className="bg-gradient-to-r from-brand-600 via-brand-500 to-indigo-500 px-6 py-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-white/70 mb-0.5">{klass?.replace('-', '학년 ') + '반'}</div>
              <div className="text-xl font-bold tracking-tight">{studentLabel}</div>
            </div>
            <div>
              {hasViolation
                ? <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-white/20 backdrop-blur-sm text-white border border-white/20">
                    <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" /> 점검 필요
                  </span>
                : <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-white/20 backdrop-blur-sm text-white border border-white/20">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" /> 정상
                  </span>
              }
            </div>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
          {/* Total credits */}
          <div className="px-6 py-5">
            <div className="text-xs font-medium text-slate-400 mb-1">전체 이수학점</div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900 tabular-nums">{total}</span>
              <span className="text-xs text-slate-400">학점</span>
            </div>
            <div className="flex gap-3 mt-2">
              <span className="inline-flex items-center gap-1 text-xs">
                <span className="w-2 h-2 rounded-full bg-brand-500" /> 이수 {completedCredits}
              </span>
              {futureCredits > 0 && (
                <span className="inline-flex items-center gap-1 text-xs">
                  <span className="w-2 h-2 rounded-full bg-amber-400" /> 예정 {futureCredits}
                </span>
              )}
            </div>
          </div>

          {/* Foundation ratio */}
          <div className="px-6 py-5">
            <div className="text-xs font-medium text-slate-400 mb-1">기초교과 + 한국사</div>
            <div className="flex items-baseline gap-2">
              <span className={`text-3xl font-bold tabular-nums ${pct > 50 ? 'text-rose-600' : 'text-slate-900'}`}>{pct}%</span>
            </div>
            <div className="text-xs text-slate-500 mt-2">
              기초교과 {baseOnly} + 한국사 {khOnly} = {combined}학점
            </div>
            {pct > 50 && <div className="text-xs text-rose-500 font-medium mt-1">50% 초과 — 점검 필요</div>}
          </div>

          {/* Bar chart mini */}
          <div className="px-6 py-5">
            <div className="text-xs font-medium text-slate-400 mb-2">교과별 학점</div>
            <div className="space-y-1.5">
              {(() => {
                const max = Math.max(1, ...studentDet.byGroup.map((x) => x.총학점))
                return studentDet.byGroup.sort((a, b) => b.총학점 - a.총학점).map((x) => (
                  <div key={x.교과} className="flex items-center gap-2">
                    <div className="w-16 text-[11px] text-slate-500 truncate" title={x.교과}>{x.교과}</div>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-brand-400 to-brand-500 rounded-full transition-all duration-700"
                        style={{ width: `${Math.round((x.총학점 / max) * 100)}%` }}
                      />
                    </div>
                    <div className="w-5 text-right text-[11px] font-semibold tabular-nums text-slate-600">{x.총학점}</div>
                  </div>
                ))
              })()}
            </div>
          </div>
        </div>
      </Card>

      {/* ── Violation Panel ── */}
      <ViolationPanel checks={checks} hasViolation={hasViolation} />

      {/* ── View Tabs + Simulation Button ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
          <TabButton active={viewTab === 'subject'} onClick={() => setViewTab('subject')}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>
            교과(군)별
          </TabButton>
          <TabButton active={viewTab === 'semester'} onClick={() => setViewTab('semester')}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
            학기별 타임라인
          </TabButton>
        </div>

        {catalog && (
          <button
            onClick={() => setShowSim(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-gradient-to-r from-violet-600 to-brand-600 text-white hover:from-violet-700 hover:to-brand-700 shadow-sm hover:shadow-md transition-all duration-200"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" /></svg>
            시뮬레이션
          </button>
        )}
      </div>

      {/* ── Simulation Modal ── */}
      {showSim && catalog && (
        <SimulationModal
          catalog={catalog}
          completedCourses={studentDet.list.filter(r => !r.isFuture).map(r => ({
            과목명: r.과목명, 교과: r.교과, 학점: r.학점, 과목학년: r.과목학년, 과목학기: r.과목학기,
          }))}
          futureCourses={studentDet.list.filter(r => r.isFuture).map(r => ({
            과목명: r.과목명, 교과: r.교과, 학점: r.학점, 과목학년: r.과목학년, 과목학기: r.과목학기,
          }))}
          baseline={baseline}
          onClose={() => setShowSim(false)}
        />
      )}

      {/* ── Subject Group View ── */}
      {viewTab === 'subject' && (
        <div className="grid sm:grid-cols-2 gap-4">
          {groups.map(([g, list]) => {
            const sorted = [...list].sort((a, b) => {
              const ay = a.과목학년 ?? 9999; const by_ = b.과목학년 ?? 9999
              if (ay !== by_) return ay - by_
              const at = a.과목학기 ?? 9999; const bt = b.과목학기 ?? 9999
              if (at !== bt) return at - bt
              return (a.과목명 || '').localeCompare(b.과목명 || '', 'ko')
            })
            const groupCredits = sorted.reduce((s, r) => s + r.학점, 0)
            const hasFuture = sorted.some(r => r.isFuture)
            return (
              <Card key={g} className="p-0 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-slate-800">{g}</span>
                    {hasFuture && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                  </div>
                  <span className="text-xs font-medium text-slate-400 tabular-nums">{groupCredits}학점</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50/80">
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">과목명</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 w-14">학점</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-slate-500 w-16">학기</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((r, i) => (
                      <tr
                        key={i}
                        className={`transition-colors ${
                          r.isFuture
                            ? 'bg-amber-50/50 hover:bg-amber-50'
                            : 'hover:bg-slate-50/80'
                        }`}
                      >
                        <td className="px-4 py-2.5 border-t border-slate-50">
                          <div className="flex items-center gap-2">
                            <span className={r.isFuture ? 'text-amber-800' : 'text-slate-800'}>{r.과목명}</span>
                            {r.isFuture && (
                              <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-600">예정</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 border-t border-slate-50 text-right tabular-nums text-slate-600">{r.학점}</td>
                        <td className="px-3 py-2.5 border-t border-slate-50 text-center tabular-nums text-slate-500 text-xs">{semLabel(r.과목학년, r.과목학기)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )
          })}
        </div>
      )}

      {/* ── Semester Timeline View (2cols x 3rows grid) ── */}
      {viewTab === 'semester' && (
        <div className="grid grid-cols-2 gap-4">
          {SEMESTERS.map((sem) => {
            const rows = semMap.get(sem.label) || []
            const isFutureSem = rows.some(r => r.isFuture)
            const semCredits = rows.reduce((s, r) => s + r.학점, 0)
            const sorted = [...rows].sort((a, b) => a.교과.localeCompare(b.교과, 'ko') || a.과목명.localeCompare(b.과목명, 'ko'))
            const isEmpty = rows.length === 0
            return (
              <Card key={sem.label} className={`p-0 overflow-hidden ${isEmpty ? 'opacity-40' : ''}`}>
                {/* Semester header */}
                <div className={`flex items-center justify-between px-4 py-3 border-b ${
                  isFutureSem
                    ? 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-100'
                    : 'bg-gradient-to-r from-slate-50 to-white border-slate-100'
                }`}>
                  <div className="flex items-center gap-2.5">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs ${
                      isFutureSem
                        ? 'bg-amber-100 text-amber-700'
                        : isEmpty
                          ? 'bg-slate-100 text-slate-400'
                          : 'bg-brand-100 text-brand-700'
                    }`}>
                      {sem.label}
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-slate-800">{sem.y}학년 {sem.t}학기</div>
                      {!isEmpty && <div className="text-xs text-slate-500">{rows.length}과목 · {semCredits}학점</div>}
                    </div>
                  </div>
                  {isFutureSem && (
                    <Badge variant="warning">수강예정</Badge>
                  )}
                </div>

                {/* Course chips */}
                <div className="px-4 py-3 min-h-[60px]">
                  {isEmpty ? (
                    <div className="text-xs text-slate-400 py-2">수강 과목 없음</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {sorted.map((r, i) => (
                        <div
                          key={i}
                          className={`group relative inline-flex items-center gap-1.5 pl-2.5 pr-2.5 py-1.5 rounded-lg text-[13px] transition-all duration-200 ${
                            r.isFuture
                              ? 'bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 hover:shadow-sm hover:shadow-amber-100'
                              : 'bg-slate-50 border border-slate-200 text-slate-700 hover:bg-white hover:shadow-sm'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${r.isFuture ? 'bg-amber-400' : 'bg-brand-400'}`} />
                          <span className="font-medium">{r.과목명}</span>
                          <span className={`text-[11px] tabular-nums ${r.isFuture ? 'text-amber-500' : 'text-slate-400'}`}>{r.학점}</span>
                          {/* Tooltip */}
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded-lg bg-slate-800 text-white text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg z-10">
                            {r.교과} · {r.학점}학점
                            {r.isFuture && ' · 수강 예정'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}

/* ═══════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════ */

function ViolationPanel({ checks, hasViolation }: {
  checks: ReturnType<typeof buildChecks>
  hasViolation: boolean
}) {
  if (!hasViolation) {
    return (
      <Card className="p-4 flex items-center gap-3 bg-emerald-50/50 border-emerald-100">
        <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </div>
        <div>
          <div className="text-sm font-medium text-emerald-800">위계/선후수 위반 없음</div>
          <div className="text-xs text-emerald-600">모든 과목이 정상적으로 이수되고 있습니다.</div>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-0 overflow-hidden border-rose-100">
      <div className="px-5 py-3 bg-rose-50 border-b border-rose-100 flex items-center gap-2">
        <svg className="w-4 h-4 text-rose-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
        <span className="text-sm font-semibold text-rose-800">위계 과목 점검 결과</span>
        <span className="ml-auto text-xs text-rose-500 font-medium">{checks.hierarchyViolations.length + checks.prereqViolations.length}건</span>
      </div>
      <div className="px-5 py-4 space-y-3">
        {checks.hierarchyViolations.map((v, i) => (
          <div key={`h-${i}`} className="flex items-start gap-3">
            <span className="mt-0.5 w-5 h-5 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            </span>
            <div className="text-sm">
              <span className="font-semibold text-slate-800">{v.base}</span>
              <span className="text-slate-500"> — 이수 {v.have.join(', ')}, 누락 </span>
              <span className="text-rose-600 font-semibold">{v.missing.join(', ')}</span>
            </div>
          </div>
        ))}
        {checks.prereqViolations.map((v, i) => (
          <div key={`p-${i}`} className="flex items-start gap-3">
            <span className="mt-0.5 w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            </span>
            <div className="text-sm">
              <span className="font-semibold text-slate-800">{v.course}</span>
              <span className="text-slate-500"> — 선수 누락 </span>
              <span className="text-rose-600 font-semibold">{v.missing.join(', ')}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
        active
          ? 'bg-white text-brand-700 shadow-sm'
          : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  )
}

