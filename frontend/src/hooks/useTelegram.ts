import { useEffect, useState } from 'react'
import { parseTelegramStartParam } from '../routing'

// Piano Roll доступен всем юзерам
const ADMIN_IDS: number[] = []  // Пустой = доступ всем

interface TelegramUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
}

interface UseTelegramResult {
  isAdmin: boolean
  isLoading: boolean
  user: TelegramUser | null
  userId: number | null  // User ID for API calls
  colorScheme: 'light' | 'dark'
  isDev: boolean
  initData: string | null
  midiParam: string | null  // MIDI ID from start_param or URL
  fileUrl: string | null    // Direct MIDI file URL (e.g. S3)
  returnPath: string | null
  annotationInviteCode: string | null
}

interface TelegramWebApp {
  initData?: string
  initDataUnsafe?: {
    user?: TelegramUser
    start_param?: string
  }
  colorScheme?: 'light' | 'dark'
  ready: () => void
  expand: () => void
}

interface TelegramWindow extends Window {
  Telegram?: {
    WebApp?: TelegramWebApp
  }
}

interface TelegramState extends UseTelegramResult {
  webApp: TelegramWebApp | null
}

function getInitialTelegramState(): TelegramState {
  const webApp = (window as TelegramWindow).Telegram?.WebApp ?? null
  const params = new URLSearchParams(window.location.search)
  const fileUrl = params.get('file')
  const urlMidi = params.get('midi')
  const telegramUser = webApp?.initDataUnsafe?.user ?? null
  const startParam = webApp?.initDataUnsafe?.start_param
  const startRoute = parseTelegramStartParam(startParam)
  const midiParam = startParam ? startRoute.midiParam : urlMidi

  if (telegramUser) {
    return {
      webApp,
      isAdmin: ADMIN_IDS.length === 0 || ADMIN_IDS.includes(telegramUser.id),
      isLoading: false,
      user: telegramUser,
      userId: telegramUser.id,
      colorScheme: webApp?.colorScheme ?? 'dark',
      isDev: false,
      initData: webApp?.initData ?? null,
      midiParam,
      fileUrl,
      returnPath: startRoute.returnPath,
      annotationInviteCode: startRoute.annotationInviteCode,
    }
  }

  if (params.get('dev') === '1') {
    return {
      webApp,
      isAdmin: true,
      isLoading: false,
      user: { id: 0, first_name: 'Dev' },
      userId: null,
      colorScheme: webApp?.colorScheme ?? 'dark',
      isDev: true,
      initData: webApp?.initData ?? null,
      midiParam,
      fileUrl,
      returnPath: startRoute.returnPath,
      annotationInviteCode: startRoute.annotationInviteCode,
    }
  }

  const isPublicVisualizer = Boolean(fileUrl) || window.location.pathname === '/visualizer'
  return {
    webApp,
    isAdmin: isPublicVisualizer,
    isLoading: false,
    user: isPublicVisualizer ? { id: 0, first_name: 'Viewer' } : null,
    userId: null,
    colorScheme: webApp?.colorScheme ?? 'dark',
    isDev: false,
    initData: webApp?.initData ?? null,
    midiParam,
    fileUrl,
    returnPath: startRoute.returnPath,
    annotationInviteCode: startRoute.annotationInviteCode,
  }
}

export function useTelegram(): UseTelegramResult {
  const [state] = useState(getInitialTelegramState)

  useEffect(() => {
    state.webApp?.ready()
    state.webApp?.expand()
  }, [state.webApp])

  return state
}
