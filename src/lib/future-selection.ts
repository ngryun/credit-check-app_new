import * as XLSX from 'xlsx'
import type { Row, CurriculumCatalog, FutureStats } from '../types'
import { toNum } from './normalization'
import { loadWorkbookFromBufferOrText } from './xlsx-helpers'
import { parseYearTermFromText } from './curriculum-catalog'

function compareYearTerm(aY: number | null, aT: number | null, bY: number | null, bT: number | null): number {
  const ay = aY ?? -Infinity
  const by = bY ?? -Infinity
  const at = aT ?? 0
  const bt = bT ?? 0
  if (ay !== by) return ay - by
  return at - bt
}

function keyForName(g: number | null, c: number | null, n: number | null): string | null {
  if (g == null || c == null || n == null) return null
  return `${g}-${c}-${n}`
}

function isCourseTitleLike(s: string | null): boolean {
  if (!s) return false
  const t = String(s).trim()
  if (t === '') return false
  if (/^[A-Z]$/.test(t)) return false
  if (/^\d+[\-–\/]\d+$/.test(t)) return false
  if (/학년|학기/.test(t)) return false
  if (/^(?:\d{1,4}[A-Z]|[A-Z0-9]{6,})$/.test(t) || /^\d{6,}$/.test(t)) return false
  const yt = parseYearTermFromText(t)
  if (yt.y != null || yt.t != null) return false
  return /[가-힣]/.test(t) || /[A-Za-z]/.test(t) || /[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]/.test(t) || /[()（）]/.test(t)
}

function findCourseColumns(
  aoa: unknown[][],
  termRowIdx: number,
  startRow: number
): Map<number, string> {
  const headerRows = Math.min(4, aoa.length)
  const cols = new Map<number, string>()
  const maxC = Math.max(...aoa.slice(0, headerRows).map((r) => (r as unknown[])?.length || 0)) + 5
  for (let c = 3; c < maxC; c++) {
    let best: string | null = null
    let bestLen = 0
    let seen = false
    for (let r = 0; r < headerRows; r++) {
      if (r === termRowIdx) continue
      const v = (aoa[r] as unknown[])?.[c]
      if (v == null) continue
      seen = true
      const s = String(v).trim()
      if (isCourseTitleLike(s) && s.length > bestLen) { best = s; bestLen = s.length }
    }
    if (!seen || !best) continue
    cols.set(c, best)
  }
  if (typeof startRow === 'number') {
    const filtered = new Map<number, string>()
    for (const [ci, name] of cols) {
      let hasSel = false
      const limit = Math.min(aoa.length, startRow + 200)
      for (let r = startRow; r < limit; r++) {
        const v = (aoa[r] as unknown[])?.[ci]
        if (v === 1 || v === '1') { hasSel = true; break }
      }
      if (hasSel) filtered.set(ci, name)
    }
    return filtered
  }
  return cols
}

function detectTermByColumn(aoa: unknown[][]): { termMap: Map<number, { y: number | null; t: number | null }>; rowIndex: number } {
  const headerRows = Math.min(4, aoa.length)
  let bestRow = 1
  let bestCount = -1
  for (let r = 0; r < headerRows; r++) {
    const arr = (aoa[r] || []) as unknown[]
    let cnt = 0
    for (let c = 0; c < arr.length; c++) {
      const { y, t } = parseYearTermFromText(arr[c])
      if (y != null || t != null) cnt++
    }
    if (cnt > bestCount) { bestCount = cnt; bestRow = r }
  }
  const row = (aoa[bestRow] || []) as unknown[]
  const termMap = new Map<number, { y: number | null; t: number | null }>()
  let last = { y: null as number | null, t: null as number | null }
  const maxC = Math.max(...aoa.slice(0, headerRows).map((r) => (r as unknown[])?.length || 0)) + 5
  for (let c = 0; c < maxC; c++) {
    const cell = row[c]
    const yt = parseYearTermFromText(cell)
    if (yt.y != null || yt.t != null) last = { y: yt.y, t: yt.t }
    if (last.y != null) termMap.set(c, last)
  }
  return { termMap, rowIndex: bestRow }
}

function parseStudentId(id: unknown): { g: number; c: number; n: number } | null {
  if (id == null) return null
  const s = String(id).trim()
  if (!/^\d{5}$/.test(s)) return null
  return { g: Number(s[0]), c: Number(s.slice(1, 3)), n: Number(s.slice(3, 5)) }
}

export async function parseFutureSelectionFile(
  buffer: ArrayBuffer,
  fileName: string,
  catalog: CurriculumCatalog,
  nameIndex: Map<string, string>,
  baseline: Map<string, { y: number; t: number }>
): Promise<{ rows: Row[]; stats: FutureStats }> {
  const wb = await loadWorkbookFromBufferOrText(buffer, fileName)
  const wsName = wb.SheetNames[0]
  const ws = wb.Sheets[wsName]
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null }) as unknown[][]
  if (!aoa.length) return { rows: [], stats: { skippedNoId: 0, skippedNoCourse: 0, produced: 0, requiredAdded: 0, notInCatalog: {}, noFutureOffering: {} } }

  const { termMap: termByCol, rowIndex: termRowIdx } = detectTermByColumn(aoa)
  let start = 0
  for (let r = 0; r < aoa.length; r++) {
    const arr = (aoa[r] || []) as unknown[]
    const hasId = (/^\d{5}$/.test(String(arr[0] || '')) || /^\d{5}$/.test(String(arr[1] || '')) || /^\d{5}$/.test(String(arr[2] || '')))
    if (hasId) { start = r; break }
  }

  const resolveName = (g: number, c: number, n: number) => {
    const k = keyForName(g, c, n)
    return k ? (nameIndex.get(k) ?? null) : null
  }
  const getBaselineFor = (g: number, c: number, n: number) => {
    const k = keyForName(g, c, n)
    if (!k) return { y: g ?? null, t: 0 }
    return baseline.get(k) || { y: g ?? null, t: 0 }
  }

  const out: Row[] = []
  let skippedNoId = 0
  let skippedNoCourse = 0
  let produced = 0
  let requiredAdded = 0
  const notInCatalog = new Map<string, number>()
  const noFutureOffering = new Map<string, number>()
  const seen = new Set<string>()
  const studentSet = new Map<string, { g: number; c: number; n: number }>()

  const addStudent = (g: number, c: number, n: number) => {
    const k = keyForName(g, c, n)
    if (k) studentSet.set(k, { g, c, n })
  }
  for (const k of baseline.keys()) {
    const [g, c, n] = k.split('-').map(Number)
    addStudent(g, c, n)
  }

  let courseCols: Map<number, string> | null = null

  for (let r = start; r < aoa.length; r++) {
    const arr = (aoa[r] || []) as unknown[]
    const id3 = parseStudentId(arr[2])
    const id2 = parseStudentId(arr[1])
    const id1 = parseStudentId(arr[0])
    const cur = id3 || id2 || id1
    if (!cur) { skippedNoId++; continue }
    const { g, c, n } = cur
    addStudent(g, c, n)
    const 이름 = resolveName(g, c, n)
    const base = getBaselineFor(g, c, n)

    if (r === start) {
      courseCols = findCourseColumns(aoa, termRowIdx, start)
      if (catalog) {
        const filtered = new Map<number, string>()
        for (const [ci, name] of courseCols) { if (catalog[name]) filtered.set(ci, name) }
        courseCols = filtered
      }
    }

    for (const [ci, subName] of courseCols!) {
      const v = arr[ci]
      if (!(v === 1 || v === '1')) continue
      const list = catalog[subName]
      if (!list) {
        skippedNoCourse++
        notInCatalog.set(subName, (notInCatalog.get(subName) || 0) + 1)
        continue
      }
      const headerTerm = termByCol.get(ci) || null
      if (headerTerm && compareYearTerm(headerTerm.y, headerTerm.t, base.y, base.t) > 0) {
        const o = list.find((o) => o.과목학년 === headerTerm.y && o.과목학기 === headerTerm.t)
        if (!o) {
          skippedNoCourse++
          const key = `${subName}(${headerTerm.y}-${headerTerm.t})`
          noFutureOffering.set(key, (noFutureOffering.get(key) || 0) + 1)
          continue
        }
        const k = `${g}-${c}-${n}::${subName}::${o.과목학년 ?? ''}-${o.과목학기 ?? ''}`
        if (!seen.has(k)) {
          seen.add(k)
          out.push({ 학년: g, 반: c, 번호: n, 이름: 이름 ?? null, 과목학년: o.과목학년 ?? null, 과목학기: o.과목학기 ?? null, 교과: o.교과 ?? null, 과목명: subName, 학점: o.학점 ?? null, _source: 'future' })
          produced++
        }
        continue
      }
      const offerings = list
        .filter((o) => o.과목학년 != null && compareYearTerm(o.과목학년, o.과목학기, base.y, base.t) > 0)
        .sort((a, b) => compareYearTerm(a.과목학년, a.과목학기, b.과목학년, b.과목학기))
      if (!offerings.length) {
        skippedNoCourse++
        noFutureOffering.set(subName, (noFutureOffering.get(subName) || 0) + 1)
        continue
      }
      const o = offerings[0]
      const k = `${g}-${c}-${n}::${subName}::${o.과목학년 ?? ''}-${o.과목학기 ?? ''}`
      if (!seen.has(k)) {
        seen.add(k)
        out.push({ 학년: g, 반: c, 번호: n, 이름: 이름 ?? null, 과목학년: o.과목학년 ?? null, 과목학기: o.과목학기 ?? null, 교과: o.교과 ?? null, 과목명: subName, 학점: o.학점 ?? null, _source: 'future' })
        produced++
      }
    }
  }

  // 학교지정 과목 자동 추가
  const schoolWide: { subName: string; o: typeof catalog[string][number] }[] = []
  for (const [subName, list] of Object.entries(catalog)) {
    for (const o of list) {
      if (String(o.과목구분 || '').replace(/\s+/g, '') === '학교지정') schoolWide.push({ subName, o })
    }
  }
  for (const { g, c, n } of studentSet.values()) {
    const 이름 = resolveName(g, c, n)
    const base = getBaselineFor(g, c, n)
    for (const { subName, o } of schoolWide) {
      if (o.과목학년 == null) continue
      if (compareYearTerm(o.과목학년, o.과목학기, base.y, base.t) <= 0) continue
      const k = `${g}-${c}-${n}::${subName}::${o.과목학년 ?? ''}-${o.과목학기 ?? ''}`
      if (seen.has(k)) continue
      seen.add(k)
      out.push({ 학년: g, 반: c, 번호: n, 이름: 이름 ?? null, 과목학년: o.과목학년 ?? null, 과목학기: o.과목학기 ?? null, 교과: o.교과 ?? null, 과목명: subName, 학점: o.학점 ?? null, _source: 'future' })
      produced++
      requiredAdded++
    }
  }

  return {
    rows: out,
    stats: {
      skippedNoId,
      skippedNoCourse,
      produced,
      requiredAdded,
      notInCatalog: Object.fromEntries(notInCatalog),
      noFutureOffering: Object.fromEntries(noFutureOffering),
    },
  }
}
