import * as XLSX from 'xlsx'
import type { Row } from '../types'
import { canonGroup, isKoreanHistory } from './normalization'
import { buildChecksString } from './prerequisite-check'

export function exportAllStudentSummary(rows: Row[]) {
  const groupSet = new Set<string>()
  for (const r of rows) groupSet.add(canonGroup(r.교과))
  const groups = Array.from(groupSet).sort((a, b) => a.localeCompare(b, 'ko'))

  const byStu = new Map<string, { 학년: number | null; 반: number | null; 번호: number | null; 이름: string | null; list: Row[] }>()
  for (const r of rows) {
    if (r.학년 == null || r.반 == null || r.번호 == null) continue
    const key = `${r.학년}-${r.반}-${r.번호}`
    const ent = byStu.get(key) || { 학년: r.학년, 반: r.반, 번호: r.번호, 이름: r.이름 ?? null, list: [] }
    ent.list.push(r)
    byStu.set(key, ent)
  }
  const foundation = new Set(['국어', '수학', '영어'])

  const header = ['학년', '반', '번호', '이름', ...groups, '전체이수학점', '기초교과학점', '한국사학점', '기초교과+한국사비율(%)', '점검']
  const aoa: unknown[][] = [header]

  const keys = Array.from(byStu.keys()).sort((a, b) => {
    const [ag, ac, an] = a.split('-').map(Number)
    const [bg, bc, bn] = b.split('-').map(Number)
    return (ag - bg) || (ac - bc) || (an - bn)
  })

  for (const key of keys) {
    const s = byStu.get(key)!
    const list = s.list.map((r) => ({
      교과: canonGroup(r.교과),
      과목명: r.과목명 || '',
      학점: r.학점 || 0,
      과목학년: r.과목학년 ?? null,
      과목학기: r.과목학기 ?? null,
    }))
    const grp = new Map<string, number>()
    for (const r of list) grp.set(r.교과, (grp.get(r.교과) || 0) + (r.학점 || 0))
    const total = list.reduce((sum, r) => sum + (r.학점 || 0), 0)
    const baseOnly = list.reduce((sum, r) => sum + (foundation.has(r.교과) ? (r.학점 || 0) : 0), 0)
    const khOnly = list.reduce((sum, r) => sum + (isKoreanHistory(r.과목명) ? (r.학점 || 0) : 0), 0)
    const pct = total > 0 ? Math.round(((baseOnly + khOnly) / total) * 1000) / 10 : 0

    const checkParts: string[] = []
    const hierarchyCheck = buildChecksString(list)
    if (hierarchyCheck) checkParts.push(hierarchyCheck)
    if (pct > 50) checkParts.push('기초교과 비율 초과')
    const check = checkParts.join(' | ')

    const row: unknown[] = [s.학년, s.반, s.번호, s.이름 ?? '']
    for (const g of groups) row.push(grp.get(g) || 0)
    row.push(total, baseOnly, khOnly, pct, check)
    aoa.push(row)
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '학생별 요약')
  XLSX.writeFile(wb, '학생별_요약.xlsx', { compression: true })
}
