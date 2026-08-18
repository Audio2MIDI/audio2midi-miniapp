export const REEL_MAX_FILE_BYTES = 20 * 1024 * 1024
export const REEL_ACCEPTED_AUDIO = '.mp3,.wav,.m4a,.ogg,.flac,.aac'

export function reelMimeForFile(file: File): string {
  if (file.type) return file.type
  const suffix = file.name.split('.').pop()?.toLowerCase()
  return {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    ogg: 'audio/ogg',
    flac: 'audio/flac',
    aac: 'audio/aac',
  }[suffix ?? ''] ?? 'application/octet-stream'
}

export function reelFileError(file: File): string | null {
  if (file.size > REEL_MAX_FILE_BYTES) {
    return 'Файл больше 20 МБ. Загрузите более короткую или сжатую версию.'
  }
  const suffix = `.${file.name.split('.').pop()?.toLowerCase()}`
  if (!REEL_ACCEPTED_AUDIO.split(',').includes(suffix)) {
    return 'Поддерживаются MP3, WAV, M4A, OGG, FLAC и AAC.'
  }
  return null
}

export async function reelSha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export function reelDownloadUrl(previewUrl: string): string {
  const url = new URL(previewUrl, 'https://app.audio2midi.ru')
  url.searchParams.set('download', 'true')
  return `${url.pathname}${url.search}`
}
