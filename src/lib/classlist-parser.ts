import * as XLSX from 'xlsx'
import type { Row } from '../types'
import { toNum } from './normalization'
import { loadWorkbookFromBufferOrText } from './xlsx-helpers'

function extractFirstNumber(text: unknown): number | null {
  if (text == null) return null
  const s = String(text)
  const m = s.match(/\d+(?:\.\d+)?/)
  return m ? Number(m[0]) : null
}

function parseSubjectWithCredit(text: unknown): { name: string | null; credit: number | null } {
  if (text == null) return { name: null, credit: null }
  const s = String(text).trim()
  const m = s.match(/^(.*?)[\(（]\s*([\d.]+)\s*[\)）]\s*$/)
  if (m) return { name: m[1].trim(), credit: Number(m[2]) }
  return { name: s, credit: null }
}

export async function parseClasslistFile(
  buffer: ArrayBuffer,
  fileName: string
): Promise<{ rows: Row[] }> {
  const wb = await loadWorkbookFromBufferOrText(buffer, fileName)
  const name = wb.SheetNames[0]
  const ws = wb.Sheets[name]
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null }) as unknown[][]
  const dataRows = aoa.slice(2)
  const outRows: Row[] = []

  for (const arr of dataRows) {
    const a = arr as unknown[]
    const subjTermRaw = a[1]
    const subjYearRaw = a[2]
    const subjectGroup = a[3]
    const subjectWithCredit = a[4]
    const gradeText = a[6]
    const classText = a[7]
    const numberRaw = a[8]
    const nameRaw = a[9]

    if (!(typeof classText === 'string' || typeof classText === 'number')) continue
    const classStr = String(classText).trim()
    const classMatch = classStr.match(/^(\d+)\s*반$/)
    if (!classMatch) continue

    const gradeMatch = String(gradeText ?? '').match(/(\d+)/)
    const 학년 = gradeMatch ? Number(gradeMatch[1]) : null
    const 반 = Number(classMatch[1])
    const 번호 = toNum(numberRaw)
    const 이름 = nameRaw != null ? String(nameRaw).trim() : null

    if (이름 && /[()（）]/.test(이름)) continue

    const 과목학기 = extractFirstNumber(subjTermRaw)
    const 과목학년 = extractFirstNumber(subjYearRaw)
    const 교과 = subjectGroup != null ? String(subjectGroup) : null
    const { name: 과목명, credit: 학점 } = parseSubjectWithCredit(subjectWithCredit)

    if (이름 == null && 번호 == null && 과목명 == null) continue

    outRows.push({ 학년, 반, 번호, 이름, 과목학년, 과목학기, 교과, 과목명, 학점 })
  }
  return { rows: outRows }
}
