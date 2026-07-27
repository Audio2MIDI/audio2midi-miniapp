import { useTelegram } from './hooks/useTelegram'
import PianoRoll from './components/PianoRoll'
import Dashboard from './components/Dashboard'

function App() {
  const { isLoading, userId, colorScheme, isDev, initData, midiParam, fileUrl } = useTelegram()

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

  if (!isVisualizer) {
    return <Dashboard initData={initData} colorScheme={colorScheme} />
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
