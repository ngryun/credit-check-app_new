import * as XLSX from 'xlsx'
import type { Row } from '../types'
import { toNum, strip, normalizeKeys } from './normalization'
import { loadWorkbookFromBufferOrText } from './xlsx-helpers'

// 학년/반 텍스트 파서
export function parseClassText(text: string | null | undefined): { year: number | null; klass: number | null } {
  if (!text) return { year: null, klass: null }
  let s = String(text).replace(/\u00A0/g, ' ').trim()
  const fw = '０１２３４５６７８９'
  const hw = '0123456789'
  s = s.replace(/[０-９]/g, (ch) => hw[fw.indexOf(ch)])
  const map: Record<string, string> = { '일': '1', '이': '2', '삼': '3', '사': '4', '오': '5', '육': '6', '칠': '7', '팔': '8', '구': '9' }
  s = s.replace(/([일이삼사오육칠팔구])\s*(학\s*년|반)/g, (_, d, unit) => map[d] + unit.replace(/\s+/g, ''))

  let m = s.match(/(\d+)\s*학\s*년[^\d]*?(\d+)\s*반/i)
  if (m) return { year: Number(m[1]), klass: Number(m[2]) }

  const y = s.match(/(\d+)\s*학\s*년/i)
  const k = s.match(/(\d+)\s*반/i)
  if (y || k) return { year: y ? Number(y[1]) : null, klass: k ? Number(k[1]) : null }

  m = s.match(/(\d+)\s*[-~\/\.]\s*(\d+)/)
  if (m) return { year: Number(m[1]), klass: Number(m[2]) }

  const nums = (s.match(/\d+/g) || []).map((n) => Number(n))
  if (nums.length >= 2) return { year: nums[0], klass: nums[1] }
  return { year: null, klass: null }
}

function isHeaderLike(row: Record<string, unknown>): boolean {
  const vals = Object.values(row).map((v) => (v == null ? '' : String(v)))
  const first = vals[0] || ''
  return first.includes('번 호') || vals.includes('성 명') || vals.includes('학 년') || vals.includes('학 기')
}

function isSummaryOrPageRow(row: Record<string, unknown>): boolean {
  const vals = Object.values(row).map((v) => (v == null ? '' : String(v)))
  const first = vals[0]
  const subj = row['과목'] || row['과목명'] || row['과목코드']
  if (/이수학점/.test(first)) return true
  if (/^\s*\d+\s*\/\s*\d+\s*$/.test(first) && Object.keys(row).length <= 3) return true
  if ((first === '' || first === 'None') && (!subj || String(subj).trim() === '')) return true
  return false
}

function cleanGradebook(
  rows: Record<string, unknown>[],
  classInfo: string | null
): { columns: string[]; rows: Row[] } {
  let data = rows.map(normalizeKeys)
  data = data.filter((r) => !isHeaderLike(r) && !isSummaryOrPageRow(r))

  const idKeys = ['번호', '성명', '학년', '학기', '반']
  const last: Record<string, unknown> = { 번호: null, 성명: null, 학년: null, 학기: null, 반: null }
  data = data.map((r) => {
    for (const k of idKeys) {
      if (r[k] == null || r[k] === '') r[k] = last[k]
      else last[k] = r[k]
    }
    return r
  })

  const numericKeys = ['번호', '학년', '반', '학기', '학점', '학점수', '석차등급', '수강자수']
  numericKeys.forEach((k) => data.forEach((r) => { if (k in r) r[k] = toNum(r[k]) }))

  data.forEach((r) => {
    if (r['교과'] == null && r['교과명'] != null) r['교과'] = r['교과명']
    if (r['교과'] == null && r['교과군'] != null) r['교과'] = r['교과군']
  })

  const { year: fallbackYear, klass: fallbackClass } = parseClassText(classInfo)

  data.forEach((r) => {
    if ((r['학년'] == null || r['학년'] === '') && fallbackYear != null) r['학년'] = fallbackYear
    if (r['반'] == null || r['반'] === '' || r['반'] === 0) {
      if (fallbackClass != null) r['반'] = fallbackClass
    }
  })

  data.forEach((r) => { if (r['이름'] == null && r['성명'] != null) r['이름'] = r['성명'] })
  data = data.filter((r) => { const subj = r['과목'] ?? r['과 목']; return subj != null && String(subj).trim() !== '' })

  const columns = ['학년', '반', '번호', '이름', '과목학년', '과목학기', '교과', '과목명', '학점']
  const rowsOut: Row[] = data.map((r) => ({
    학년: toNum(fallbackYear) ?? null,
    반: toNum(fallbackClass) ?? null,
    번호: toNum(r['번호']),
    이름: r['이름'] != null ? String(r['이름']) : (r['성명'] != null ? String(r['성명']) : null),
    과목학년: toNum(r['학년']),
    과목학기: toNum(r['학기']),
    교과: r['교과'] != null ? String(r['교과']) : null,
    과목명: r['과목'] != null ? String(r['과목']) : null,
    학점: toNum(r['학점'] ?? r['학점수']),
  }))
  return { columns, rows: rowsOut }
}

export function readRowsFromWorkbook(wb: XLSX.WorkBook): { classInfo: string | null; rows: Record<string, unknown>[] } {
  const name = wb.SheetNames[0]
  const ws = wb.Sheets[name]
  const cellVal = (c: string) => { const v = ws[c]; return v ? (v.w ?? v.v) : null }
  const preferred = ['A3', 'A2', 'B3', 'A1']
  let cls: string | null = null
  for (const addr of preferred) {
    const v = cellVal(addr)
    if (v != null && /학|반/.test(String(v))) { cls = String(v); break }
  }
  if (!cls) {
    const cols = ['A', 'B', 'C', 'D', 'E']
    outer: for (let r = 1; r <= 8; r++) {
      for (const col of cols) {
        const addr = `${col}${r}`
        const v = cellVal(addr)
        if (v == null) continue
        const s = String(v)
        if (!/학|반/.test(s)) continue
        const p = parseClassText(s)
        if (p.year != null || p.klass != null) { cls = s; break outer }
      }
    }
  }

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null }) as unknown[][]
  if (!aoa.length) return { classInfo: cls, rows: [] }

  const stripS = (x: unknown) => (x == null ? '' : String(x).replace(/\s+/g, ''))
  const headerCandidates = ['번호', '성명', '학년', '학기', '과목', '교과']
  let headerIndex = 0
  let maxHits = -1
  const scanLimit = Math.min(20, aoa.length)
  for (let i = 0; i < scanLimit; i++) {
    const row = aoa[i] || []
    let hits = 0
    for (const cell of row) { if (headerCandidates.includes(stripS(cell))) hits++ }
    if (hits > maxHits && hits >= 2) { headerIndex = i; maxHits = hits }
  }

  const header = (aoa[headerIndex] || []).map((h) => (h == null ? '' : String(h)))
  const result = aoa.slice(headerIndex + 1).map((arr) => {
    const obj: Record<string, unknown> = {}
    header.forEach((h, i) => { obj[h] = i < (arr as unknown[]).length ? (arr as unknown[])[i] : null })
    return obj
  })
  return { classInfo: cls, rows: result }
}

export async function parseGradebookFilesAsync(
  files: { buffer: ArrayBuffer; name: string }[]
): Promise<{ rows: Row[] }> {
  const combined: Row[] = []
  for (const f of files) {
    const wb = await loadWorkbookFromBufferOrText(f.buffer, f.name)
    const { classInfo, rows } = readRowsFromWorkbook(wb)
    const cleaned = cleanGradebook(rows, classInfo)
    if (cleaned?.rows) combined.push(...cleaned.rows.map(r => ({ ...r, _source: 'gradebook' as const })))
  }
  return { rows: combined }
}
