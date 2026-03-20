import * as XLSX from 'xlsx'
import type { Row } from '../types'
import { toNum, toStr } from './normalization'

export function readRowsFromSheet(ws: XLSX.WorkSheet): Row[] {
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null }) as unknown[][]
  if (!aoa.length) return []
  const header = (aoa[0] || []).map((h) => (h == null ? '' : String(h)))
  const idx = (k: string) => header.indexOf(k)
  const col = {
    y: idx('학년'), c: idx('반'), n: idx('번호'), name: idx('이름'),
    sy: idx('과목학년'), st: idx('과목학기'), group: idx('교과'), subj: idx('과목명'), credit: idx('학점'),
  }
  return aoa.slice(1).map((r: unknown[]) => ({
    학년: toNum(r[col.y]), 반: toNum(r[col.c]), 번호: toNum(r[col.n]),
    이름: toStr(r[col.name]), 과목학년: toNum(r[col.sy]), 과목학기: toNum(r[col.st]),
    교과: toStr(r[col.group]), 과목명: toStr(r[col.subj]), 학점: toNum(r[col.credit]),
  }))
}

export async function loadWorkbookFromBufferOrText(
  src: ArrayBuffer | string,
  nameHint?: string
): Promise<XLSX.WorkBook> {
  const lower = (nameHint || '').toLowerCase()
  if (typeof src === 'string' || lower.endsWith('.csv')) {
    const text = typeof src === 'string' ? src : new TextDecoder('utf-8').decode(new Uint8Array(src))
    const sheet = (XLSX.utils as any).csv_to_sheet(text)
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null })
    return { SheetNames: ['CSV'], Sheets: { CSV: XLSX.utils.aoa_to_sheet(aoa) } } as XLSX.WorkBook
  }
  return XLSX.read(src, { cellDates: false })
}

export function toXlsx(rows: Record<string, unknown>[], sheetName = 'cleaned'): Blob {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

export function downloadBlob(filename: string, blob: Blob) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

export function writeXlsxFile(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, filename, { compression: true })
}

export { XLSX }
