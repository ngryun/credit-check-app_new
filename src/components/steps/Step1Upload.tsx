import { useState, useCallback } from 'react'
import { useApp } from '../../store/app-context'
import { FileUploadCard } from '../upload/FileUploadCard'
import { Button } from '../ui/Button'
import { parseGradebookFilesAsync } from '../../lib/gradebook-parser'
import { parseClasslistFile } from '../../lib/classlist-parser'
import { parseCurriculumFile } from '../../lib/curriculum-catalog'
import { parseFutureSelectionFile } from '../../lib/future-selection'

type FileStatus = 'idle' | 'loading' | 'done' | 'error'

export function Step1Upload() {
  const { state, dispatch, nameIndex, baseline } = useApp()
  const [gbStatus, setGbStatus] = useState<FileStatus>(state.gradebookRows ? 'done' : 'idle')
  const [gbText, setGbText] = useState(state.gradebookRows ? `${state.gradebookRows.length}행` : '')
  const [clStatus, setClStatus] = useState<FileStatus>(state.classlistRows ? 'done' : 'idle')
  const [clText, setClText] = useState(state.classlistRows ? `${state.classlistRows.length}행` : '')
  const [curStatus, setCurStatus] = useState<FileStatus>(state.curriculumCatalog ? 'done' : 'idle')
  const [curText, setCurText] = useState(state.curriculumCatalog ? `${Object.keys(state.curriculumCatalog).length}과목` : '')
  const [futStatus, setFutStatus] = useState<FileStatus>(state.futureRows ? 'done' : 'idle')
  const [futText, setFutText] = useState(state.futureRows ? `${state.futureRows.length}행` : '')

  const handleGradebook = useCallback(async (files: File[]) => {
    setGbStatus('loading')
    try {
      const buffers = await Promise.all(files.map(async (f) => ({ buffer: await f.arrayBuffer(), name: f.name })))
      const result = await parseGradebookFilesAsync(buffers)
      dispatch({ type: 'SET_GRADEBOOK', rows: result.rows })
      setGbStatus('done')
      setGbText(`${result.rows.length}행`)
    } catch (e) {
      setGbStatus('error')
      setGbText(String(e instanceof Error ? e.message : e))
    }
  }, [dispatch])

  const handleClasslist = useCallback(async (files: File[]) => {
    setClStatus('loading')
    try {
      const f = files[0]
      const buf = await f.arrayBuffer()
      const result = await parseClasslistFile(buf, f.name)
      dispatch({ type: 'SET_CLASSLIST', rows: result.rows })
      setClStatus('done')
      setClText(`${result.rows.length}행`)
    } catch (e) {
      setClStatus('error')
      setClText(String(e instanceof Error ? e.message : e))
    }
  }, [dispatch])

  const handleCurriculum = useCallback(async (files: File[]) => {
    setCurStatus('loading')
    try {
      const f = files[0]
      const buf = await f.arrayBuffer()
      const catalog = await parseCurriculumFile(buf, f.name)
      dispatch({ type: 'SET_CURRICULUM', catalog })
      setCurStatus('done')
      setCurText(`${Object.keys(catalog).length}과목`)
    } catch (e) {
      setCurStatus('error')
      setCurText(String(e instanceof Error ? e.message : e))
    }
  }, [dispatch])

  const handleFuture = useCallback(async (files: File[]) => {
    if (!state.curriculumCatalog) {
      setFutStatus('error')
      setFutText('교육과정 DB를 먼저 업로드하세요')
      return
    }
    setFutStatus('loading')
    try {
      const f = files[0]
      const buf = await f.arrayBuffer()
      const result = await parseFutureSelectionFile(buf, f.name, state.curriculumCatalog, nameIndex, baseline)
      dispatch({ type: 'SET_FUTURE', rows: result.rows, stats: result.stats })
      setFutStatus('done')
      setFutText(`${result.rows.length}행`)
    } catch (e) {
      setFutStatus('error')
      setFutText(String(e instanceof Error ? e.message : e))
    }
  }, [dispatch, state.curriculumCatalog, nameIndex, baseline])

  const hasData = !!(state.gradebookRows?.length || state.classlistRows?.length || state.futureRows?.length)

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="mb-2">
        <h2 className="text-xl font-bold text-slate-800">데이터 업로드</h2>
        <p className="text-sm text-slate-500 mt-1">아래 파일들을 업로드하여 학생 이수과목 데이터베이스를 생성합니다.</p>
      </div>

      <FileUploadCard
        title="1. 교과학습발달상황"
        description="학교생활기록부 → 학생부 항목별 조회 → 교과학습발달상황 → XLS data"
        hint={<><strong>주의:</strong> xls 아닙니다. xls data 입니다. 복수 파일 업로드 가능합니다.</>}
        status={gbStatus}
        statusText={gbText}
        multiple
        onFiles={handleGradebook}
      />

      <FileUploadCard
        title="2. 학생편성현황"
        description="편제 및 과목개설관리 → 수강생편성 → 학생편성현황 → 엑셀출력"
        status={clStatus}
        statusText={clText}
        onFiles={handleClasslist}
      />

      <FileUploadCard
        title="3. 교육과정 DB"
        description="강원도교육청 교육과정DB 양식 (과목명/학점/교과/학년·학기 포함)"
        hint="예: 교육과정편제표_2025년입학.xlsx"
        status={curStatus}
        statusText={curText}
        accept=".xlsx,.xls"
        onFiles={handleCurriculum}
      />

      <FileUploadCard
        title="4. 학생 과목선택"
        description="고교학점제 수강신청 프로그램 → 수강신청 → 신청결과 → 템플릿 다운로드"
        hint={
          !state.curriculumCatalog
            ? <span className="text-amber-600">교육과정 DB를 먼저 업로드해야 합니다.</span>
            : '예: 2025입학생_수강신청일괄등록20250922.xlsx (값=1은 선택)'
        }
        status={futStatus}
        statusText={futText}
        accept=".xlsx,.xls"
        onFiles={handleFuture}
      />

      <div className="flex justify-end pt-4">
        <Button
          disabled={!hasData}
          onClick={() => dispatch({ type: 'SET_STEP', step: 2 })}
        >
          다음: 데이터 확인 →
        </Button>
      </div>
    </div>
  )
}
