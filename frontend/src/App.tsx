import { useTelegram } from './hooks/useTelegram'
import PianoRoll from './components/PianoRoll'

function App() {
  const { isAdmin, isLoading, userId, colorScheme, isDev, initData, midiParam, fileUrl } = useTelegram()

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

  if (!isAdmin) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        gap: 16,
        color: 'var(--text-secondary)',
      }}>
        <div style={{ fontSize: 64 }}>🔒</div>
        <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)' }}>
          Доступ ограничён
        </div>
        <div style={{ fontSize: 14 }}>
          Это приложение доступно только администраторам.
        </div>
      </div>
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
