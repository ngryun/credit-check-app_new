import * as XLSX from 'xlsx'
import type { CurriculumCatalog, CurriculumEntry, SelectionGroupConstraint, CurriculumParseResult } from '../types'
import { toNum } from './normalization'
import { loadWorkbookFromBufferOrText } from './xlsx-helpers'

/* ── 학기 텍스트 파서 (기존 호환) ── */
export function parseYearTermFromText(txt: unknown): { y: number | null; t: number | null } {
  if (!txt) return { y: null, t: null }
  const s = String(txt).trim()
  const dash = s.match(/(\d+)\s*[-\/–]\s*(\d+)/)
  if (dash) return { y: Number(dash[1]), t: Number(dash[2]) }
  const ym = s.match(/(\d+)\s*학년/)
  const tm = s.match(/(\d+)\s*학기/)
  return { y: ym ? Number(ym[1]) : null, t: tm ? Number(tm[1]) : null }
}

/* ── 6개 학기 매핑 (G~L열, 인덱스 6~11) ── */
const SEMESTER_MAP: { col: number; year: number; term: number }[] = [
  { col: 6, year: 1, term: 1 },   // G열 → 1-1
  { col: 7, year: 1, term: 2 },   // H열 → 1-2
  { col: 8, year: 2, term: 1 },   // I열 → 2-1
  { col: 9, year: 2, term: 2 },   // J열 → 2-2
  { col: 10, year: 3, term: 1 },  // K열 → 3-1
  { col: 11, year: 3, term: 2 },  // L열 → 3-2
]

/* ── 메타정보 행에서 선택 제약 파싱 ── */
function parseConstraintRow(text: string, groupName: string): SelectionGroupConstraint[] {
  // 예: "학기 별 과목수 최소선택 : 5 ~ 최대선택 : 5"
  const minMatch = text.match(/최소선택\s*[:：]\s*(\d+)/)
  const maxMatch = text.match(/최대선택\s*[:：]\s*(\d+)/)
  if (!minMatch || !maxMatch) return []

  const min = Number(minMatch[1])
  const max = Number(maxMatch[1])

  // 학기별로 동일한 제약이 적용된다고 가정 (학기 구분 없이)
  // 추후 학기별 개별 제약이 필요하면 확장
  return [{ 그룹명: groupName, 학기: 'all', 최소선택: min, 최대선택: max }]
}

/* ── 헤더 행 자동 감지 ── */
function findHeaderRow(aoa: unknown[][]): number {
  for (let r = 0; r < Math.min(aoa.length, 10); r++) {
    const row = (aoa[r] || []) as unknown[]
    const joined = row.map(v => v == null ? '' : String(v).trim().replace(/\s+/g, '')).join('|')
    // 핵심 헤더 키워드가 포함된 행 찾기
    if (joined.includes('과목명') || joined.includes('과목')) {
      if (joined.includes('교과') || joined.includes('과목구분') || joined.includes('과목유형')) {
        return r
      }
    }
  }
  return 0 // 못 찾으면 0행
}

/* ── 헤더 기반 컬럼 인덱스 매핑 ── */
function detectColumns(header: string[]): {
  ixKind: number; ixGroup: number; ixType: number; ixName: number;
  semesterCols: { col: number; year: number; term: number }[]
} {
  const norm = header.map(h => h.replace(/\s+/g, ''))

  const ixKind = norm.findIndex(h => h === '과목구분')
  const ixGroup = norm.findIndex(h => h.includes('교과') && !h.includes('유형'))
  const ixType = norm.findIndex(h => h === '과목유형')
  const ixName = norm.findIndex(h => h === '과목명' || h === '과목')

  // 학기 컬럼: 헤더에 "1-1", "1학년1학기" 등이 있으면 자동 매핑
  const semesterCols: { col: number; year: number; term: number }[] = []
  for (let i = 0; i < norm.length; i++) {
    const parsed = parseYearTermFromText(norm[i])
    if (parsed.y && parsed.t) {
      semesterCols.push({ col: i, year: parsed.y, term: parsed.t })
    }
  }

  // 학기 헤더를 못 찾으면 고정 위치(G~L, 인덱스 6~11) 사용
  if (semesterCols.length === 0) {
    semesterCols.push(...SEMESTER_MAP)
  }

  return { ixKind, ixGroup, ixType, ixName, semesterCols }
}

/* ── 세로 구조 감지 (기존 양식 호환) ── */
function isVerticalFormat(header: string[]): boolean {
  const norm = header.map(h => h.replace(/\s+/g, ''))
  return norm.includes('학기') && norm.includes('과목명') && norm.includes('학점')
}

/* ── 기존 세로 구조 파서 (호환 유지) ── */
function buildCurriculumCatalogVertical(aoa: unknown[][], headerRow: number): CurriculumParseResult {
  const header = ((aoa[headerRow] || []) as unknown[]).map(v => v == null ? '' : String(v).trim())
  const idx = (label: string) => header.findIndex(h => h.replace(/\s+/g, '') === label)
  const ixSem = idx('학기')
  const ixSub = idx('과목명')
  const ixCred = idx('학점')
  const ixGroup = idx('교과군')
  const ixKind = idx('과목구분')

  const cat: CurriculumCatalog = {}
  for (let r = headerRow + 1; r < aoa.length; r++) {
    const row = (aoa[r] || []) as unknown[]
    const sem = ixSem >= 0 ? row[ixSem] : null
    const { y: subYear, t: subTerm } = parseYearTermFromText(sem)
    const subName = ixSub >= 0 ? (row[ixSub] != null ? String(row[ixSub]).trim() : null) : null
    const credit = ixCred >= 0 ? toNum(row[ixCred]) : null
    const group = ixGroup >= 0 ? (row[ixGroup] != null ? String(row[ixGroup]).trim() : null) : null
    const kind = ixKind >= 0 ? (row[ixKind] != null ? String(row[ixKind]).trim() : null) : null
    if (!subName) continue
    const rec: CurriculumEntry = { 과목명: subName, 교과: group, 학점: credit, 과목학년: subYear, 과목학기: subTerm, 과목구분: kind }
    if (!cat[subName]) cat[subName] = []
    cat[subName].push(rec)
  }
  return { catalog: cat, constraints: [] }
}

/* ── 새 가로 피벗 구조 파서 (편성표 양식) ── */
function buildCurriculumCatalogPivot(aoa: unknown[][], headerRow: number): CurriculumParseResult {
  const header = ((aoa[headerRow] || []) as unknown[]).map(v => v == null ? '' : String(v).trim())
  const { ixKind, ixGroup, ixType, ixName, semesterCols } = detectColumns(header)

  const cat: CurriculumCatalog = {}
  const constraints: SelectionGroupConstraint[] = []

  // 병합셀 처리: 이전 값 기억
  let lastKind = ''
  let lastGroup = ''

  for (let r = headerRow + 1; r < aoa.length; r++) {
    const row = (aoa[r] || []) as unknown[]
    if (!row || row.every(v => v == null || String(v).trim() === '')) continue // 빈 행 스킵

    // A열: 과목구분 (병합셀 → 빈 셀이면 이전 값 상속)
    const rawKind = ixKind >= 0 ? row[ixKind] : null
    if (rawKind != null && String(rawKind).trim() !== '') {
      lastKind = String(rawKind).trim()
    }

    // B열: 교과군 (병합셀 → 빈 셀이면 이전 값 상속)
    const rawGroup = ixGroup >= 0 ? row[ixGroup] : null
    if (rawGroup != null && String(rawGroup).trim() !== '') {
      lastGroup = String(rawGroup).trim()
    }

    // D열: 과목명 — 비어있으면 메타정보 행
    const rawName = ixName >= 0 ? row[ixName] : null
    const subName = rawName != null ? String(rawName).trim() : ''

    if (!subName) {
      // 메타정보 행: 선택그룹 제약 조건 파싱
      const rowText = row.map(v => v == null ? '' : String(v)).join(' ')
      if (rowText.includes('최소선택') || rowText.includes('최대선택')) {
        constraints.push(...parseConstraintRow(rowText, lastKind))
      }
      continue
    }

    // C열: 과목유형
    const rawType = ixType >= 0 ? row[ixType] : null
    const subType = rawType != null ? String(rawType).trim() : null

    // G~L열: 학기별 학점 → 0이 아닌 곳마다 엔트리 생성
    for (const sem of semesterCols) {
      const creditVal = toNum(row[sem.col])
      if (creditVal != null && creditVal > 0) {
        const entry: CurriculumEntry = {
          과목명: subName,
          교과: lastGroup || null,
          학점: creditVal,
          과목학년: sem.year,
          과목학기: sem.term,
          과목구분: lastKind || subType || null,
        }
        if (!cat[subName]) cat[subName] = []
        cat[subName].push(entry)
      }
    }
  }

  return { catalog: cat, constraints }
}

/* ── 메인 빌드 함수: 양식 자동 감지 ── */
function buildCurriculumCatalog(wb: XLSX.WorkBook): CurriculumParseResult {
  const name = wb.SheetNames[0]
  const ws = wb.Sheets[name]
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null }) as unknown[][]
  if (!aoa.length) return { catalog: {}, constraints: [] }

  const headerRow = findHeaderRow(aoa)
  const header = ((aoa[headerRow] || []) as unknown[]).map(v => v == null ? '' : String(v).trim())

  // 세로 구조(기존 양식) vs 가로 피벗(편성표 양식) 자동 판별
  if (isVerticalFormat(header)) {
    return buildCurriculumCatalogVertical(aoa, headerRow)
  }

  return buildCurriculumCatalogPivot(aoa, headerRow)
}

/* ── 공개 API (기존 호환 유지) ── */
export async function parseCurriculumFile(
  buffer: ArrayBuffer,
  fileName: string
): Promise<CurriculumCatalog> {
  const wb = await loadWorkbookFromBufferOrText(buffer, fileName)
  const result = buildCurriculumCatalog(wb)
  return result.catalog
}

/** 확장 API: 교육과정 + 선택그룹 제약 조건 함께 반환 */
export async function parseCurriculumFileWithConstraints(
  buffer: ArrayBuffer,
  fileName: string
): Promise<CurriculumParseResult> {
  const wb = await loadWorkbookFromBufferOrText(buffer, fileName)
  return buildCurriculumCatalog(wb)
}
