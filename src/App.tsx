import { AppProvider, useApp } from './store/app-context'
import { StepIndicator } from './components/steps/StepIndicator'
import { Step1Upload } from './components/steps/Step1Upload'
import { Step2Review } from './components/steps/Step2Review'
import { Step3Dashboard } from './components/steps/Step3Dashboard'

function AppContent() {
  const { state, dispatch, hasAnyData } = useApp()

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white/95 backdrop-blur border-b border-slate-200 fixed top-0 left-0 right-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-sm font-bold">C</span>
            </div>
            <h1 className="text-lg font-bold text-slate-800 hidden sm:block">학점 이수 점검</h1>
          </div>
          <StepIndicator
            current={state.currentStep}
            onStep={(id) => dispatch({ type: 'SET_STEP', step: id })}
            canAdvance={hasAnyData}
          />
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-6 pt-[72px]">
        {state.currentStep === 1 && <Step1Upload />}
        {state.currentStep === 2 && <Step2Review />}
        {state.currentStep === 3 && <Step3Dashboard />}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  )
}
