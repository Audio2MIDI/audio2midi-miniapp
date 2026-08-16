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

export function telegramStartParamForReturnPath(
  returnPath: string | null,
): string {
  const match = returnPath?.match(EDITOR_PATH_RE)
  return match ? `editor_${match[1]}` : 'cabinet'
}

export function parseTelegramStartParam(
  startParam: string | null | undefined,
): TelegramStartRoute {
  if (!startParam || startParam === 'cabinet') {
    return { midiParam: null, returnPath: null }
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
