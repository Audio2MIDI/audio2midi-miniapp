import { useTelegram } from './hooks/useTelegram'
import PianoRoll from './components/PianoRoll'
import Dashboard from './components/Dashboard'
import NewProject from './components/NewProject'
import ProjectPage from './components/ProjectPage'
import Profile from './components/Profile'
import ResearchLab from './components/ResearchLab'
import Support from './components/Support'
import { safeEditorReturnPath } from './routing'

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
  const queryReturnPath = safeEditorReturnPath(
    new URLSearchParams(window.location.search).get('next'),
  )
  const returnPath = queryReturnPath ?? telegramReturnPath

  if (window.location.pathname.startsWith('/research/listening')) {
    return <ResearchLab />
  }

  if (window.location.pathname === '/support') {
    return <Support colorScheme={colorScheme} />
  }

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        color: 'var(--text-secondary)',
        fontSize: 16,
      }}>
        Загрузка...
      </div>
    )
  }

  const isVisualizer = Boolean(fileUrl || midiParam)
    || window.location.pathname === '/visualizer'

  if (window.location.pathname === '/new') {
    return <NewProject initData={initData} colorScheme={colorScheme} />
  }

  if (window.location.pathname === '/profile') {
    return <Profile initData={initData} colorScheme={colorScheme} />
  }

  const projectMatch = window.location.pathname.match(/^\/tracks\/([0-9a-f-]+)$/i)
  if (projectMatch) {
    return (
      <ProjectPage
        projectId={projectMatch[1]}
        initData={initData}
        colorScheme={colorScheme}
      />
    )
  }

  if (!isVisualizer) {
    return (
      <Dashboard
        initData={initData}
        colorScheme={colorScheme}
        returnPath={returnPath}
      />
    )
  }

  return (
    <div
      data-theme={colorScheme}
      style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}
    >
      {isDev && (
        <div style={{
          background: '#e94560',
          color: '#fff',
          textAlign: 'center',
          padding: '3px 8px',
          fontSize: 11,
          fontWeight: 600,
        }}>
          🛠 DEV MODE — open with ?dev=1{midiParam && ` | MIDI: ${midiParam}`}
        </div>
      )}
      <PianoRoll midiParam={midiParam} fileUrl={fileUrl} userId={userId} initData={initData} />
    </div>
  )
}

export default App
