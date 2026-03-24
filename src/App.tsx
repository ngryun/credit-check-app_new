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
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-brand-500 to-brand-700 rounded-lg flex items-center justify-center shadow-sm">
              <svg className="w-[18px] h-[18px] text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 00-.491 6.347A48.62 48.62 0 0112 20.904a48.62 48.62 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.636 50.636 0 00-2.658-.813A59.906 59.906 0 0112 3.493a59.903 59.903 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15v-3.375c0-.621.504-1.125 1.125-1.125h8.25c.621 0 1.125.504 1.125 1.125V15" /></svg>
            </div>
            <h1 className="text-sm font-bold text-slate-800 hidden sm:block">고교학점제 학점 이수 현황 확인 및 과목선택 시뮬레이션</h1>
          </div>
          {!state.isEmbedded && (
            <StepIndicator
              current={state.currentStep}
              onStep={(id) => dispatch({ type: 'SET_STEP', step: id })}
              canAdvance={hasAnyData}
            />
          )}
          {state.isEmbedded && (
            <span className="text-xs text-slate-400 hidden sm:block">담임교사용 열람 전용</span>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-6 pt-[72px]">
        {state.currentStep === 1 && <Step1Upload />}
        {state.currentStep === 2 && <Step2Review />}
        {state.currentStep === 3 && <Step3Dashboard />}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white mt-12">
        <div className="max-w-7xl mx-auto px-4 py-6 text-center text-xs text-slate-400 leading-relaxed">
          <p>&copy; 2026 Namgung Yeon (Selak High School). Some rights reserved.</p>
          <p className="mt-1">
            Licensed under{' '}
            <a href="https://creativecommons.org/licenses/by-nc/4.0/" target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-brand-600 underline underline-offset-2">CC BY-NC 4.0</a>
          </p>
          <p className="mt-1">
            <a href="https://namgungyeon.tistory.com" target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-brand-600 underline underline-offset-2">namgungyeon.tistory.com</a>
          </p>
        </div>
      </footer>
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
