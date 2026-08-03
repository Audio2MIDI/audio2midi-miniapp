export type NewProjectStep = 'source' | 'result' | 'review'
export type SourceMode = 'file' | 'link' | 'catalog'

export const PRIMARY_ENGINES = ['picogen', 'piano_transcription', 'sheetsage'] as const
export const SECONDARY_ENGINES = ['music2midi', 'audio_separator'] as const

export function stepFromSearch(search: string): NewProjectStep {
  const value = new URLSearchParams(search).get('step')
  return value === 'result' || value === 'review' ? value : 'source'
}

export function searchForStep(step: NewProjectStep): string {
  return `?step=${step}`
}

export function nextStep(step: NewProjectStep): NewProjectStep {
  if (step === 'source') return 'result'
  return 'review'
}

export function previousStep(step: NewProjectStep): NewProjectStep {
  if (step === 'review') return 'result'
  return 'source'
}

export interface PersistedProjectDraft {
  sourceMode: SourceMode
  sourceUrl: string
  title: string
  engine: string
  selectedTrack: {
    source_id: string
    title: string
    artist: string
    duration_ms: number | null
    artwork_url: string | null
    source_kind: 'catalog_track'
  } | null
}

export function readProjectDraft(storage: Storage | undefined): PersistedProjectDraft | null {
  if (!storage) return null
  try {
    const raw = storage.getItem('audio2midi:new-project')
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PersistedProjectDraft>
    if (!['file', 'link', 'catalog'].includes(parsed.sourceMode ?? '')) return null
    return {
      sourceMode: parsed.sourceMode as SourceMode,
      sourceUrl: String(parsed.sourceUrl ?? ''),
      title: String(parsed.title ?? '').slice(0, 255),
      engine: String(parsed.engine ?? 'picogen'),
      selectedTrack: parsed.selectedTrack && typeof parsed.selectedTrack === 'object'
        ? {
            source_id: String(parsed.selectedTrack.source_id ?? ''),
            title: String(parsed.selectedTrack.title ?? ''),
            artist: String(parsed.selectedTrack.artist ?? ''),
            duration_ms: typeof parsed.selectedTrack.duration_ms === 'number'
              ? parsed.selectedTrack.duration_ms
              : null,
            artwork_url: parsed.selectedTrack.artwork_url
              ? String(parsed.selectedTrack.artwork_url)
              : null,
            source_kind: 'catalog_track',
          }
        : null,
    }
  } catch {
    return null
  }
}

export function writeProjectDraft(storage: Storage | undefined, draft: PersistedProjectDraft) {
  storage?.setItem('audio2midi:new-project', JSON.stringify(draft))
}

export function clearProjectDraft(storage: Storage | undefined) {
  storage?.removeItem('audio2midi:new-project')
}
