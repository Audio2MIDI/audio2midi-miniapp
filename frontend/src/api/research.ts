const DESKTOP_BASE_URL = '/research-api/v1/research'
const TELEGRAM_BASE_URL = '/api/v1/research'
const DEV_MOCK_MODE = import.meta.env.DEV && typeof window !== 'undefined'
  ? new URLSearchParams(window.location.search).get('mock')
  : null
const DEV_MOCK = DEV_MOCK_MODE === '1' || DEV_MOCK_MODE === 'source-audit'
let mockCompleted = 7
const MOCK_PIANO_ROLL = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="1680" height="480" viewBox="0 0 1680 480">
    <rect width="1680" height="480" fill="#080b0f"/>
    <g stroke="#27303a" stroke-width="2" opacity=".8">
      <path d="M0 80H1680M0 160H1680M0 240H1680M0 320H1680M0 400H1680"/>
      <path d="M240 0V480M480 0V480M720 0V480M960 0V480M1200 0V480M1440 0V480"/>
    </g>
    <g fill="#22c55e"><rect x="90" y="300" width="180" height="22"/><rect x="290" y="270" width="120" height="22"/><rect x="430" y="240" width="210" height="22"/></g>
    <g fill="#38bdf8"><rect x="690" y="220" width="90" height="22"/><rect x="800" y="190" width="170" height="22"/><rect x="990" y="250" width="250" height="22"/><rect x="1270" y="180" width="260" height="22"/></g>
  </svg>
`)}`

function telegramInitData(): string | null {
  if (typeof window === 'undefined') return null
  const telegram = (window as unknown as {
    Telegram?: { WebApp?: { initData?: string } }
  }).Telegram
  return telegram?.WebApp?.initData ?? null
}

export function researchApiBaseUrl(
  initData: string | null = telegramInitData(),
): string {
  return initData ? TELEGRAM_BASE_URL : DESKTOP_BASE_URL
}

export interface ResearchExperiment {
  id: string
  title: string
  status: 'active' | 'closed'
  track_count: number
  sample_count: number
  condition_count: number
  card_count?: number
  metadata?: string | { card_count?: number; kind?: string } | null
}

function researchExperimentMetadata(
  experiment: ResearchExperiment,
): { card_count?: number; kind?: string } | null {
  let metadata = experiment.metadata
  if (typeof metadata === 'string') {
    try {
      metadata = JSON.parse(metadata) as { card_count?: number; kind?: string }
    } catch {
      return null
    }
  }
  return metadata ?? null
}

export function researchExperimentCardCount(experiment: ResearchExperiment): number {
  if (typeof experiment.card_count === 'number') return experiment.card_count
  const metadata = researchExperimentMetadata(experiment)
  return metadata && typeof metadata.card_count === 'number'
    ? metadata.card_count
    : 0
}

export function researchExperimentKind(experiment: ResearchExperiment): string | undefined {
  return researchExperimentMetadata(experiment)?.kind
}

export interface ResearchSample {
  id: string
  label: 'A' | 'B'
  audio_url: string
  midi_url: string
  piano_roll_url: string | null
  pdf_url: string | null
  musicxml_url: string | null
}

export interface ResearchTrack {
  id: string
  title: string
  artist: string
  completed: number
  total: number
}

export interface ResearchComparison {
  experiment_id: string
  card_id?: string
  block?: 'model' | 'corruption' | 'difficulty'
  question?: {
    kind?: 'source_identity' | string
    prompt: string
    choices: Array<'left' | 'right' | 'tie' | 'both_bad'>
    labels?: Partial<Record<'left' | 'right' | 'tie' | 'both_bad', string>>
  }
  track: {
    id: string
    title: string
    artist: string
    source_audio_url: string
  }
  left: ResearchSample
  right: ResearchSample
}

export interface ResearchProgress {
  completed: number
  total: number
}

export interface NextComparisonResponse {
  comparison: ResearchComparison | null
  progress: ResearchProgress
  experiment_progress: ResearchProgress
}

export interface ResearchConditionResult {
  appearances: number
  wins: number
  losses: number
  ties: number
  both_bad: number
  ratings?: Record<string, number>
  rating_counts?: Record<string, number>
}

export interface ResearchPairResult {
  condition_a: string
  condition_b: string
  a_wins: number
  b_wins: number
  ties: number
  both_bad: number
  votes: number
}

export interface ResearchResults {
  vote_count: number
  reviewer_count: number
  conditions: Record<string, ResearchConditionResult>
  pairwise: ResearchPairResult[]
  tags: Record<string, number>
  calibration?: {
    card_vote_count: number
    blocks: Record<string, number>
    repeat_consistency: number | null
    controlled_corruption_accuracy: number | null
    metric_agreement: Record<string, { comparisons: number; accuracy: number }>
    errors_by_track?: Record<string, { comparisons: number; errors: number }>
    errors_by_pathology?: Record<string, { comparisons: number; errors: number }>
  }
}

export interface ResearchVote {
  experiment_id: string
  session_id: string
  card_id?: string
  left_sample_id: string
  right_sample_id: string
  choice: 'left' | 'right' | 'tie' | 'both_bad'
  tags: string[]
  ratings: {
    left: Record<string, number>
    right: Record<string, number>
  }
  comment: string
  response_ms: number
}

export interface DatasetAudit {
  id: string
  title: string
  status: 'active' | 'closed'
  card_count: number
  completed_count: number
}

export type DatasetAuditTriState = 'yes' | 'no' | 'unsure' | 'files_broken'
export type DatasetAuditArrangementType =
  | 'full_arrangement'
  | 'accompaniment'
  | 'piano_original'
  | 'other'
  | 'unsure'
  | 'files_broken'

export interface DatasetAuditCard {
  id: string
  audit_id: string
  question: Record<string, string>
  source_audio_url: string
  target_piano_audio_url: string
  midi_render_audio_url: string
  target_midi_url: string
  piano_roll_url: string
}

export interface DatasetAuditReview {
  session_id: string
  card_id: string
  same_composition: DatasetAuditTriState
  full_arrangement: DatasetAuditTriState
  piano_clean: DatasetAuditTriState
  target_suitable: DatasetAuditTriState
  midi_matches_target_audio: DatasetAuditTriState
  arrangement_type: DatasetAuditArrangementType
  extra_instruments: DatasetAuditTriState
  defect_tags: string[]
  comment: string
  response_ms: number
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (DEV_MOCK) {
    if (path === '/dataset-audits') {
      return {
        audits: [{
          id: 'dataset-provenance-audit-100-v1',
          title: 'Аудит корпуса · 100 пар',
          status: 'active',
          card_count: 100,
          completed_count: 17,
        }],
      } as T
    }
    if (path.includes('/dataset-audits/') && path.endsWith('/next')) {
      return {
        card: {
          id: '30000000-0000-0000-0000-000000000001',
          audit_id: 'dataset-provenance-audit-100-v1',
          question: {
            same_composition: 'Это одна и та же композиция?',
            piano_clean: 'В целевом аудио слышно только фортепиано?',
            target_suitable: 'Подходит ли этот MIDI для обучения?',
            arrangement_type: 'Какой это тип фортепианной версии?',
            extra_instruments: 'Слышны ли дополнительные инструменты?',
          },
          source_audio_url: 'data:audio/wav;base64,',
          target_piano_audio_url: 'data:audio/wav;base64,',
          midi_render_audio_url: 'data:audio/wav;base64,',
          target_midi_url: '#',
          piano_roll_url: MOCK_PIANO_ROLL,
        },
        progress: { completed: 17, total: 100 },
      } as T
    }
    if (path.includes('/dataset-audits/') && path.endsWith('/reviews')) {
      return undefined as T
    }
    if (path === '/experiments') {
      if (DEV_MOCK_MODE === 'source-audit') {
        return {
          experiments: [{
            id: 'coverbench-v1-source-audit-preview',
            title: 'CoverBench v1 · проверка исходников',
            status: 'active',
            track_count: 30,
            sample_count: 60,
            condition_count: 2,
            metadata: JSON.stringify({
              kind: 'source_identity_audit',
              card_count: 30,
            }),
          }],
        } as T
      }
      return {
        experiments: [{
          id: 'listening-lab-preview',
          title: 'CoverBench v0 · слепая калибровка',
          status: 'active',
          track_count: 12,
          sample_count: 132,
          condition_count: 3,
          card_count: 60,
        }, {
          id: 'legacy-listening-preview',
          title: 'Предыдущий эксперимент',
          status: 'closed',
          track_count: 12,
          sample_count: 108,
          condition_count: 3,
          card_count: 0,
        }],
      } as T
    }
    if (path.endsWith('/tracks')) {
      return {
        tracks: [
          {
            id: 'midnight-arrangement',
            title: 'Midnight arrangement',
            artist: 'Internal eval set',
            completed: mockCompleted,
            total: 9,
          },
          {
            id: 'northern-lights',
            title: 'Northern lights',
            artist: 'Internal eval set',
            completed: 3,
            total: 9,
          },
          {
            id: 'quiet-room',
            title: 'Quiet room',
            artist: 'Internal eval set',
            completed: 0,
            total: 9,
          },
        ],
      } as T
    }
    if (path.includes('/next')) {
      if (DEV_MOCK_MODE === 'source-audit') {
        return {
          comparison: {
            experiment_id: 'coverbench-v1-source-audit-preview',
            card_id: 'source-audit-preview-1',
            question: {
              kind: 'source_identity',
              prompt: 'Во втором плеере действительно звучит фортепианная версия композиции из первого?',
              choices: ['left', 'right', 'tie', 'both_bad'],
              labels: {
                left: 'Да, это фортепианная версия',
                right: 'Нет, это оригинал или другая песня',
                tie: 'Не уверен',
                both_bad: 'Файлы не прослушать',
              },
            },
            track: {
              id: 'source-audit-preview',
              title: 'В жизни так бывает',
              artist: 'Мохито',
              source_audio_url: 'data:audio/wav;base64,',
            },
            left: {
              id: '00000000-0000-0000-0000-000000000011',
              label: 'A',
              audio_url: 'data:audio/wav;base64,',
              midi_url: '#',
              piano_roll_url: null,
              pdf_url: null,
              musicxml_url: null,
            },
            right: {
              id: '00000000-0000-0000-0000-000000000012',
              label: 'B',
              audio_url: 'data:audio/wav;base64,',
              midi_url: '#',
              piano_roll_url: null,
              pdf_url: null,
              musicxml_url: null,
            },
          },
          progress: { completed: 0, total: 30 },
          experiment_progress: { completed: 0, total: 30 },
        } as T
      }
      return {
        comparison: {
          experiment_id: 'listening-lab-preview',
          track: {
            id: 'midnight-arrangement',
            title: 'Midnight arrangement',
            artist: 'Internal eval set',
            source_audio_url: 'data:audio/wav;base64,',
          },
          left: {
            id: '00000000-0000-0000-0000-000000000001',
            label: 'A',
            audio_url: 'data:audio/wav;base64,',
            midi_url: '#',
            piano_roll_url: null,
            pdf_url: null,
            musicxml_url: null,
          },
          right: {
            id: '00000000-0000-0000-0000-000000000002',
            label: 'B',
            audio_url: 'data:audio/wav;base64,',
            midi_url: '#',
            piano_roll_url: null,
            pdf_url: null,
            musicxml_url: null,
          },
        },
        progress: { completed: mockCompleted, total: 9 },
        experiment_progress: { completed: mockCompleted, total: 108 },
      } as T
    }
    if (path === '/votes' && init?.method === 'POST') {
      mockCompleted += 1
      return undefined as T
    }
    if (path.endsWith('/results')) {
      return {
        vote_count: 24,
        reviewer_count: 2,
        conditions: {
          production_baseline_005: {
            appearances: 16, wins: 8, losses: 4, ties: 3, both_bad: 1,
          },
          e008_note_store_10000: {
            appearances: 16, wins: 5, losses: 7, ties: 3, both_bad: 1,
          },
          e010_all_processed_10000: {
            appearances: 16, wins: 4, losses: 6, ties: 5, both_bad: 1,
          },
        },
        pairwise: [],
        tags: { loop: 6, chord_pounding: 4, melody_lost: 2 },
        calibration: {
          card_vote_count: 18,
          blocks: { model: 8, corruption: 8, difficulty: 2 },
          repeat_consistency: 0.83,
          controlled_corruption_accuracy: 0.88,
          metric_agreement: {
            'source.chroma_dtw_similarity': { comparisons: 12, accuracy: 0.75 },
          },
          errors_by_track: {
            'midnight-arrangement': { comparisons: 2, errors: 1 },
          },
          errors_by_pathology: {
            loop: { comparisons: 3, errors: 1 },
          },
        },
      } as T
    }
  }

  const response = await fetch(`${researchApiBaseUrl()}${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  if (!response.ok) {
    let message = `HTTP ${response.status}`
    try {
      const payload = await response.json() as { detail?: string }
      if (payload.detail) message = payload.detail
    } catch {
      // Keep the HTTP status as the useful fallback.
    }
    throw new Error(message)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export async function listResearchExperiments(): Promise<ResearchExperiment[]> {
  const payload = await request<{ experiments: ResearchExperiment[] }>('/experiments')
  return payload.experiments
}

export async function listDatasetAudits(): Promise<DatasetAudit[]> {
  const payload = await request<{ audits: DatasetAudit[] }>('/dataset-audits')
  return payload.audits
}

export async function getNextDatasetAuditCard(
  auditId: string,
): Promise<{ card: DatasetAuditCard | null; progress: ResearchProgress }> {
  return request<{ card: DatasetAuditCard | null; progress: ResearchProgress }>(
    `/dataset-audits/${encodeURIComponent(auditId)}/next`,
  )
}

export function submitDatasetAuditReview(
  auditId: string,
  review: DatasetAuditReview,
): Promise<void> {
  return request<void>(
    `/dataset-audits/${encodeURIComponent(auditId)}/reviews`,
    {
      method: 'POST',
      body: JSON.stringify(review),
    },
  )
}

export async function listResearchTracks(
  experimentId: string,
): Promise<ResearchTrack[]> {
  const payload = await request<{ tracks: ResearchTrack[] }>(
    `/experiments/${encodeURIComponent(experimentId)}/tracks`,
  )
  return payload.tracks
}

export function getNextResearchComparison(
  experimentId: string,
  trackId?: string,
  mode: 'legacy' | 'calibration' = 'legacy',
  block?: 'model' | 'corruption' | 'difficulty',
): Promise<NextComparisonResponse> {
  const search = new URLSearchParams({ mode })
  if (trackId) search.set('track_id', trackId)
  if (block) search.set('block', block)
  return request<NextComparisonResponse>(
    `/experiments/${encodeURIComponent(experimentId)}/next?${search.toString()}`,
  )
}

export function submitResearchVote(vote: ResearchVote): Promise<void> {
  return request<void>('/votes', {
    method: 'POST',
    body: JSON.stringify(vote),
  })
}

export function getResearchResults(experimentId: string): Promise<ResearchResults> {
  return request<ResearchResults>(
    `/experiments/${encodeURIComponent(experimentId)}/results`,
  )
}
