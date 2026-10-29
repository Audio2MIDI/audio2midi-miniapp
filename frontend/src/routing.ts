const EDITOR_PATH_RE =
  /^\/editor\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/?$/i

export interface TelegramStartRoute {
  midiParam: string | null
  returnPath: string | null
}

const OPEN_RESULT_PATH_RE =
  /^\/open\/(legacy-[1-9][0-9]*|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/?$/i

export function openResultItemId(pathname: string): string | null {
  return pathname.match(OPEN_RESULT_PATH_RE)?.[1] ?? null
}

export function paymentReturnIntent(search: string): string | null {
  const params = new URLSearchParams(search)
  return params.get('intent') ?? params.get('Shp_intent')
}

export function safeEditorReturnPath(
  candidate: string | null | undefined,
  origin?: string,
): string | null {
  const baseOrigin =
    origin ??
    (typeof window === 'undefined'
      ? 'https://app.audio2midi.ru'
      : window.location.origin)
  if (
    !candidate ||
    !candidate.startsWith('/') ||
    candidate.startsWith('//') ||
    candidate.includes('\\')
  ) {
    return null
  }
  try {
    const parsed = new URL(candidate, baseOrigin)
    if (
      parsed.origin !== baseOrigin ||
      parsed.search ||
      parsed.hash ||
      !EDITOR_PATH_RE.test(parsed.pathname)
    ) {
      return null
    }
    return parsed.pathname
  } catch {
    return null
  }
}

// Allow only product destinations; never redirect to an arbitrary URL.
export function safeAuthReturnPath(candidate: string | null | undefined): string | null {
  const editor = safeEditorReturnPath(candidate)
  if (editor) return editor
  if (!candidate || candidate.includes('\\') || !candidate.startsWith('/') || candidate.startsWith('//')) return null
  const parsed = new URL(candidate, 'https://app.audio2midi.ru')
  if (parsed.hash) return null
  if (openResultItemId(parsed.pathname) && !parsed.search) return parsed.pathname
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
  if (new RegExp(`^/tracks/${uuid}/?$`, 'i').test(parsed.pathname) && !parsed.search) return parsed.pathname
  if (parsed.pathname !== '/new') return null
  const entries = [...parsed.searchParams.entries()]
  if (entries.length === 0) return '/new'
  if (entries.length === 1 && entries[0][0] === 'resume' && new RegExp(`^${uuid}$`, 'i').test(entries[0][1])) {
    return `/new?resume=${entries[0][1]}`
  }
  return null
}

export function telegramStartParamForReturnPath(
  returnPath: string | null,
): string {
  const safe = safeAuthReturnPath(returnPath)
  const match = safe?.match(EDITOR_PATH_RE)
  if (match) return `editor_${match[1]}`
  if (safe?.startsWith('/tracks/')) return `track_${safe.split('/')[2]}`
  if (safe?.startsWith('/open/')) return `result_${safe.slice(6)}`
  if (safe === '/new') return 'new'
  if (safe?.startsWith('/new?resume=')) return `resume_${new URLSearchParams(safe.split('?')[1]).get('resume')}`
  return 'cabinet'
}

export function parseTelegramStartParam(
  startParam: string | null | undefined,
): TelegramStartRoute {
  if (!startParam || startParam === 'cabinet') {
    return { midiParam: null, returnPath: null }
  }
  if (startParam === 'new' || startParam.startsWith('track_') || startParam.startsWith('resume_') || startParam.startsWith('result_')) {
    const candidate = startParam.startsWith('result_') ? `/open/${startParam.slice(7)}` : startParam === 'new' ? '/new' : startParam.startsWith('track_')
      ? `/tracks/${startParam.slice(6)}` : `/new?resume=${startParam.slice(7)}`
    return { midiParam: null, returnPath: safeAuthReturnPath(candidate) }
  }
  if (startParam.startsWith('editor_')) {
    const returnPath = safeEditorReturnPath(
      `/editor/${startParam.slice('editor_'.length)}`,
    )
    return { midiParam: null, returnPath }
  }
  if (startParam.startsWith('midi_')) {
    return {
      midiParam: startParam.slice('midi_'.length) || null,
      returnPath: null,
    }
  }
  return { midiParam: startParam, returnPath: null }
}

export function telegramLoginUrl(returnPath: string | null): string {
  const startParam = telegramStartParamForReturnPath(returnPath)
  return `https://t.me/Audio2MIDIBot?startapp=${encodeURIComponent(startParam)}`
}
