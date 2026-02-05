import { useEffect, useState } from 'react'

const ADMIN_IDS = [371331803]

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
}

export function useTelegram(): UseTelegramResult {
  const [isAdmin, setIsAdmin] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState<TelegramUser | null>(null)
  const [userId, setUserId] = useState<number | null>(null)
  const [colorScheme, setColorScheme] = useState<'light' | 'dark'>('dark')
  const [isDev, setIsDev] = useState(false)
  const [initData, setInitData] = useState<string | null>(null)
  const [midiParam, setMidiParam] = useState<string | null>(null)

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp
    const params = new URLSearchParams(window.location.search)

    // Check for MIDI param in URL (for dev/testing)
    const urlMidi = params.get('midi')
    
    if (tg && tg.initDataUnsafe?.user) {
      const tgUser = tg.initDataUnsafe.user as TelegramUser
      setUser(tgUser)
      setUserId(tgUser.id)
      setIsAdmin(ADMIN_IDS.includes(tgUser.id))
      setColorScheme(tg.colorScheme || 'dark')
      setInitData(tg.initData || null)

      // Get MIDI from Telegram start_param (e.g., t.me/Bot/app?startapp=midi_123)
      const startParam = tg.initDataUnsafe?.start_param
      if (startParam) {
        // Extract midi ID from start_param (format: "midi_ID" or just "ID")
        const midiId = startParam.startsWith('midi_') 
          ? startParam.slice(5) 
          : startParam
        setMidiParam(midiId)
      } else if (urlMidi) {
        setMidiParam(urlMidi)
      }

      tg.ready()
      tg.expand()
    } else {
      // Dev mode — no Telegram context
      if (params.get('dev') === '1') {
        setIsDev(true)
        setIsAdmin(true)
        setUser({ id: 0, first_name: 'Dev' })
        
        if (urlMidi) {
          setMidiParam(urlMidi)
        }
      }
    }

    setIsLoading(false)
  }, [])

  return { isAdmin, isLoading, user, userId, colorScheme, isDev, initData, midiParam }
}
