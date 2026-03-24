export type RowSource = 'gradebook' | 'classlist' | 'future'

export type Row = {
  학년: number | null
  반: number | null
  번호: number | null
  이름: string | null
  과목학년: number | null
  과목학기: number | null
  교과: string | null
  과목명: string | null
  학점: number | null
  _source?: RowSource
}

export type Dataset = {
  rows: Row[]
}

export type CurriculumEntry = {
  과목명: string
  교과: string | null
  학점: number | null
  과목학년: number | null
  과목학기: number | null
  과목구분: string | null
}

export type CurriculumCatalog = Record<string, CurriculumEntry[]>

/** 선택그룹별 과목 수 제약 조건 */
export type SelectionGroupConstraint = {
  그룹명: string
  학기: string          // e.g. "1-1", "2-1" 등
  최소선택: number
  최대선택: number
}

/** 파서 결과: 교육과정 + 선택그룹 제약 */
export type CurriculumParseResult = {
  catalog: CurriculumCatalog
  constraints: SelectionGroupConstraint[]
}

export type FutureStats = {
  skippedNoId: number
  skippedNoCourse: number
  produced: number
  requiredAdded: number
  notInCatalog: Record<string, number>
  noFutureOffering: Record<string, number>
}

export type StepId = 1 | 2 | 3
