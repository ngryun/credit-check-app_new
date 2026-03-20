import { useMemo } from 'react'
import { useApp } from '../../store/app-context'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { sortByGradeClassNumber } from '../../lib/data-merge'
import { toXlsx, downloadBlob } from '../../lib/xlsx-helpers'

export function Step2Review() {
  const { state, dispatch, mergedRows } = useApp()

  const preview = useMemo(() => mergedRows.slice(0, 300), [mergedRows])
  const cols = ['학년', '반', '번호', '이름', '과목학년', '과목학기', '교과', '과목명', '학점'] as const

  const sources = useMemo(() => {
    const s: string[] = []
    if (state.gradebookRows?.length) s.push(`교과학습발달상황 ${state.gradebookRows.length}행`)
    if (state.classlistRows?.length) s.push(`학생편성현황 ${state.classlistRows.length}행`)
    if (state.futureRows?.length) s.push(`미래과목선택 ${state.futureRows.length}행`)
    return s
  }, [state.gradebookRows, state.classlistRows, state.futureRows])

  const stats = state.futureStats

  function handleDownload() {
    const sorted = sortByGradeClassNumber(mergedRows)
    const blob = toXlsx(sorted)
    downloadBlob('정리완료.xlsx', blob)
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="mb-2">
        <h2 className="text-xl font-bold text-slate-800">데이터 확인</h2>
        <p className="text-sm text-slate-500 mt-1">업로드된 데이터가 자동으로 병합되었습니다.</p>
      </div>

      {/* KPI 요약 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="text-sm text-slate-500">총 행 수</div>
          <div className="text-2xl font-bold font-mono">{mergedRows.length.toLocaleString()}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-slate-500">데이터 소스</div>
          <div className="text-2xl font-bold">{sources.length}개</div>
        </Card>
        {stats && (
          <>
            <Card className="p-4">
              <div className="text-sm text-slate-500">미래 생성행</div>
              <div className="text-2xl font-bold font-mono text-emerald-600">{stats.produced}</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-slate-500">미매칭 과목</div>
              <div className="text-2xl font-bold font-mono text-amber-600">{Object.keys(stats.notInCatalog).length}</div>
            </Card>
          </>
        )}
      </div>

      {/* 소스 목록 */}
      <Card className="p-4">
        <div className="text-sm font-semibold text-slate-700 mb-2">병합 구성</div>
        <div className="flex flex-wrap gap-2">
          {sources.map((s) => <Badge key={s} variant="info">{s}</Badge>)}
          {sources.length === 0 && <span className="text-sm text-slate-400">데이터가 없습니다</span>}
        </div>
      </Card>

      {/* 미래선택 리포트 */}
      {stats && (Object.keys(stats.notInCatalog).length > 0 || Object.keys(stats.noFutureOffering).length > 0) && (
        <Card className="p-4 space-y-3">
          <div className="text-sm font-semibold text-slate-700">미래 과목선택 리포트</div>
          {Object.keys(stats.notInCatalog).length > 0 && (
            <div>
              <div className="text-xs text-slate-500 mb-1">DB에 과목명이 없음 (상위 20)</div>
              <div className="max-h-40 overflow-auto">
                <table className="w-full text-sm">
                  <thead><tr><th className="text-left p-1 text-slate-500">과목명</th><th className="text-right p-1 text-slate-500">건수</th></tr></thead>
                  <tbody>
                    {Object.entries(stats.notInCatalog).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, v]) => (
                      <tr key={k}><td className="p-1">{k}</td><td className="p-1 text-right font-mono">{v}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {Object.keys(stats.noFutureOffering).length > 0 && (
            <div>
              <div className="text-xs text-slate-500 mb-1">미래 개설이 없음 (상위 20)</div>
              <div className="max-h-40 overflow-auto">
                <table className="w-full text-sm">
                  <thead><tr><th className="text-left p-1 text-slate-500">과목명</th><th className="text-right p-1 text-slate-500">건수</th></tr></thead>
                  <tbody>
                    {Object.entries(stats.noFutureOffering).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, v]) => (
                      <tr key={k}><td className="p-1">{k}</td><td className="p-1 text-right font-mono">{v}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* 데이터 미리보기 */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold text-slate-700">데이터 미리보기</div>
          <span className="text-xs text-slate-400">상위 300행</span>
        </div>
        <div className="max-h-[400px] overflow-auto border border-slate-200 rounded-xl">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c} className="sticky top-0 bg-slate-50 border-b border-slate-200 p-2 text-left text-xs font-semibold text-slate-600">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50/80 even:bg-slate-50/30">
                  {cols.map((c) => (
                    <td key={c} className="border-b border-slate-100 p-2 font-mono text-xs">{r[c] ?? ''}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 액션 */}
      <div className="flex justify-between pt-4">
        <Button variant="secondary" onClick={() => dispatch({ type: 'SET_STEP', step: 1 })}>
          ← 이전
        </Button>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleDownload} disabled={!mergedRows.length}>
            XLSX 다운로드
          </Button>
          <Button onClick={() => dispatch({ type: 'SET_STEP', step: 3 })} disabled={!mergedRows.length}>
            대시보드로 이동 →
          </Button>
        </div>
      </div>
    </div>
  )
}
