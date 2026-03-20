import { createContext, useContext, useReducer, useMemo, type ReactNode, type Dispatch } from 'react'
import type { Row, CurriculumCatalog, FutureStats, StepId } from '../types'
import { mergeAllData, buildNameIndex, buildBaseline } from '../lib/data-merge'

interface AppState {
  currentStep: StepId
  gradebookRows: Row[] | null
  classlistRows: Row[] | null
  curriculumCatalog: CurriculumCatalog | null
  futureRows: Row[] | null
  futureStats: FutureStats | null
  overrideRows: Row[] | null // for direct xlsx upload in step 3
  selectedClass: string | null
  selectedStudent: string | null
  searchQuery: string
}

type Action =
  | { type: 'SET_STEP'; step: StepId }
  | { type: 'SET_GRADEBOOK'; rows: Row[] }
  | { type: 'SET_CLASSLIST'; rows: Row[] }
  | { type: 'SET_CURRICULUM'; catalog: CurriculumCatalog }
  | { type: 'SET_FUTURE'; rows: Row[]; stats: FutureStats }
  | { type: 'SET_OVERRIDE'; rows: Row[] }
  | { type: 'CLEAR_OVERRIDE' }
  | { type: 'SET_CLASS'; value: string | null }
  | { type: 'SET_STUDENT'; value: string | null }
  | { type: 'SET_QUERY'; value: string }

const initialState: AppState = {
  currentStep: 1,
  gradebookRows: null,
  classlistRows: null,
  curriculumCatalog: null,
  futureRows: null,
  futureStats: null,
  overrideRows: null,
  selectedClass: null,
  selectedStudent: null,
  searchQuery: '',
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_STEP': return { ...state, currentStep: action.step }
    case 'SET_GRADEBOOK': return { ...state, gradebookRows: action.rows }
    case 'SET_CLASSLIST': return { ...state, classlistRows: action.rows }
    case 'SET_CURRICULUM': return { ...state, curriculumCatalog: action.catalog }
    case 'SET_FUTURE': return { ...state, futureRows: action.rows, futureStats: action.stats }
    case 'SET_OVERRIDE': return { ...state, overrideRows: action.rows }
    case 'CLEAR_OVERRIDE': return { ...state, overrideRows: null }
    case 'SET_CLASS': return { ...state, selectedClass: action.value, selectedStudent: null }
    case 'SET_STUDENT': return { ...state, selectedStudent: action.value }
    case 'SET_QUERY': return { ...state, searchQuery: action.value }
    default: return state
  }
}

interface AppContextValue {
  state: AppState
  dispatch: Dispatch<Action>
  mergedRows: Row[]
  nameIndex: Map<string, string>
  baseline: Map<string, { y: number; t: number }>
  hasAnyData: boolean
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  const mergedRows = useMemo(() => {
    if (state.overrideRows) return state.overrideRows
    return mergeAllData(state.gradebookRows, state.classlistRows, state.futureRows)
  }, [state.gradebookRows, state.classlistRows, state.futureRows, state.overrideRows])

  const nameIndex = useMemo(() => {
    const rows: Row[] = []
    if (state.gradebookRows) rows.push(...state.gradebookRows)
    if (state.classlistRows) rows.push(...state.classlistRows)
    return buildNameIndex(rows)
  }, [state.gradebookRows, state.classlistRows])

  const baseline = useMemo(() => {
    const rows: Row[] = []
    if (state.gradebookRows) rows.push(...state.gradebookRows)
    if (state.classlistRows) rows.push(...state.classlistRows)
    return buildBaseline(rows)
  }, [state.gradebookRows, state.classlistRows])

  const hasAnyData = mergedRows.length > 0

  const value = useMemo(
    () => ({ state, dispatch, mergedRows, nameIndex, baseline, hasAnyData }),
    [state, mergedRows, nameIndex, baseline, hasAnyData]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be inside AppProvider')
  return ctx
}
