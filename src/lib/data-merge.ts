import type { Row } from '../types'
import { toNum } from './normalization'

export function mergeAllData(
  gradebook: Row[] | null,
  classlist: Row[] | null,
  future: Row[] | null
): Row[] {
  const rows: Row[] = []
  if (gradebook) rows.push(...gradebook)
  if (classlist) rows.push(...classlist)
  if (future) rows.push(...future)
  return rows
}

export function sortByGradeClassNumber(rows: Row[]): Row[] {
  const cmp = (a: unknown, b: unknown) => {
    if (a == null && b == null) return 0
    if (a == null) return 1
    if (b == null) return -1
    const na = typeof a === 'number' ? a : Number(a)
    const nb = typeof b === 'number' ? b : Number(b)
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb
    return String(a).localeCompare(String(b))
  }
  return [...rows].sort(
    (r1, r2) => cmp(r1.학년, r2.학년) || cmp(r1.반, r2.반) || cmp(r1.번호, r2.번호)
  )
}

export function buildNameIndex(rows: Row[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const r of rows) {
    const g = toNum(r.학년)
    const c = toNum(r.반)
    const n = toNum(r.번호)
    const nm = r.이름
    if (g == null || c == null || n == null) continue
    const k = `${g}-${c}-${n}`
    if (nm && !m.has(k)) m.set(k, nm)
  }
  return m
}

export function buildBaseline(rows: Row[]): Map<string, { y: number; t: number }> {
  const m = new Map<string, { y: number; t: number }>()
  for (const r of rows) {
    const g = toNum(r.학년)
    const c = toNum(r.반)
    const n = toNum(r.번호)
    const sy = toNum(r.과목학년)
    const st = toNum(r.과목학기)
    if (g == null || c == null || n == null || sy == null) continue
    const k = `${g}-${c}-${n}`
    const cur = m.get(k) || { y: -Infinity, t: 0 }
    const cmpY = sy ?? -Infinity
    const cmpT = st ?? 0
    if (cmpY > cur.y || (cmpY === cur.y && cmpT > cur.t)) {
      m.set(k, { y: sy, t: st ?? 0 })
    }
  }
  return m
}
