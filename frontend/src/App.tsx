import { lazy, Suspense, type ReactNode } from 'react'

import { useTelegram } from './hooks/useTelegram'
import { openResultItemId, paymentReturnIntent, safeEditorReturnPath } from './routing'
import { ProductLoading } from './components/ProductFrame'

const Billing = lazy(() => import('./components/Billing'))
const Dashboard = lazy(() => import('./components/Dashboard'))
const NewProject = lazy(() => import('./components/NewProject'))
const PaymentReturn = lazy(() => import('./components/PaymentReturn'))
const PianoRoll = lazy(() => import('./components/PianoRoll'))
const Profile = lazy(() => import('./components/Profile'))
const ProjectPage = lazy(() => import('./components/ProjectPage'))
const ReelsStudio = lazy(() => import('./components/ReelsStudio'))
const ResearchLab = lazy(() => import('./components/ResearchLab'))
const DatasetAuditLab = lazy(() => import('./components/DatasetAuditLab'))
const Support = lazy(() => import('./components/Support'))
const AnalyticsDashboard = lazy(() => import('./components/AnalyticsDashboard'))
const OpenResult = lazy(() => import('./components/OpenResult'))
const BrowserHandoff = lazy(() => import('./components/BrowserHandoff'))

function route(content: ReactNode) {
  return <Suspense fallback={<ProductLoading />}>{content}</Suspense>
}

function App() {
  const {
    isLoading,
    userId,
    colorScheme,
    isDev,
    initData,
    midiParam,
    fileUrl,
    returnPath: telegramReturnPath,
  } = useTelegram()
  const queryReturnPath = safeEditorReturnPath(new URLSearchParams(window.location.search).get('next'))
  const returnPath = queryReturnPath ?? telegramReturnPath

  if (window.location.pathname.startsWith('/research/dataset-audit')) {
    return route(<DatasetAuditLab initData={initData} colorScheme={colorScheme} />)
  }

  if (
    window.location.pathname.startsWith('/research/listening')
    || window.location.pathname.startsWith('/research/review')
  ) {
    return route(<ResearchLab initData={initData} colorScheme={colorScheme} />)
  }
  if (window.location.pathname === '/support') return route(<Support colorScheme={colorScheme} />)
  if (window.location.pathname === '/handoff') return route(<BrowserHandoff colorScheme={colorScheme} />)
  if (window.location.pathname === '/billing') return route(<Billing colorScheme={colorScheme} />)
  if (window.location.pathname === '/payment/return') {
    return route(
      <PaymentReturn
        colorScheme={colorScheme}
        intentId={paymentReturnIntent(window.location.search)}
      />,
    )
  }

  const reelsMatch = window.location.pathname.match(/^\/internal\/reels(?:\/([0-9a-f-]+))?$/i)
  if (reelsMatch) return route(<ReelsStudio candidateId={reelsMatch[1]} colorScheme={colorScheme} />)
  if (window.location.pathname === '/internal/analytics') return route(<AnalyticsDashboard colorScheme={colorScheme} />)
  if (isLoading) return <ProductLoading />

  const resultItemId = openResultItemId(window.location.pathname)
  if (resultItemId) {
    return route(<OpenResult itemId={resultItemId} initData={initData} colorScheme={colorScheme} />)
  }

  const isVisualizer = Boolean(fileUrl || midiParam) || window.location.pathname === '/visualizer'
  if (window.location.pathname === '/new') return route(<NewProject initData={initData} colorScheme={colorScheme} />)
  if (window.location.pathname === '/profile') return route(<Profile initData={initData} colorScheme={colorScheme} />)

  const projectMatch = window.location.pathname.match(/^\/tracks\/([0-9a-f-]+)$/i)
  if (projectMatch) {
    return route(<ProjectPage projectId={projectMatch[1]} initData={initData} colorScheme={colorScheme} />)
  }

  if (!isVisualizer) return route(<Dashboard initData={initData} colorScheme={colorScheme} returnPath={returnPath} />)

  return route(
    <div data-theme={colorScheme} style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {isDev && (
        <div style={{ background: '#e94560', color: '#fff', textAlign: 'center', padding: '3px 8px', fontSize: 11, fontWeight: 600 }}>
          🛠 DEV MODE — open with ?dev=1{midiParam && ` | MIDI: ${midiParam}`}
        </div>
      )}
      <PianoRoll midiParam={midiParam} fileUrl={fileUrl} userId={userId} initData={initData} />
    </div>,
  )
}

export default App
