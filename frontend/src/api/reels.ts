import { get, patch, post } from './client'

export type ReelStatus =
  | 'discovered'
  | 'selected'
  | 'source_ready'
  | 'generating'
  | 'rendering'
  | 'ready_for_preview'
  | 'preview'
  | 'scheduled'
  | 'published'
  | 'rejected'
  | 'failed'
  | 'cancelled'

export interface ReelsCapabilities {
  enabled: boolean
  rollout: 'off' | 'allowlist' | 'all'
  manual_generation_enabled: boolean
  manual_active_limit: number
  default_duration_seconds: number
  preview_window_seconds: number
  publish_actions_enabled: boolean
  variants: string[]
}

export interface ReelCandidateCreateResponse {
  created: boolean
  candidate: ReelCandidateSummary
  studio_url: string
}

export interface ReelCandidateSummary {
  id: string
  origin: 'trend' | 'owner_manual'
  artist: string
  title: string
  region: 'ru' | 'en'
  language: 'ru' | 'en'
  source_provider: string
  source_url: string
  status: ReelStatus
  trend_score: number
  scheduled_for: string | null
  auto_publish_at: string | null
  best_quality_score: number | null
  ready_render_count: number
  rejection_reasons: string[]
  created_at: string
}

export interface ReelGeneration {
  id: string
  attempt_no: number
  seed: number
  status: string
  quality_score: number | null
  quality_passed: boolean | null
  quality_metrics: Record<string, number>
  rejection_reasons: string[]
  selected: boolean
  preview_audio_url?: string
}

export interface ReelRender {
  id: string
  variant: string
  status: string
  selected: boolean
  settings: {
    clip_start_seconds?: number
    duration_seconds?: number
    transition_seconds?: number
    crossfade_seconds?: number
    hook_text?: string
    cta_text?: string
  }
  render_metrics: Record<string, unknown>
  preview_url?: string
}

export interface ReelPublication {
  id: string
  platform: 'youtube' | 'instagram'
  status: string
  external_url: string | null
  copyright_status: string | null
  attempts: number
  last_error: string | null
  scheduled_at: string
  published_at: string | null
}

export interface ReelReview {
  id: string
  render_id: string
  verdict: 'good' | 'usable_with_edits' | 'bad'
  tags: string[]
  comment: string
  updated_at: string
}

export interface ReelCandidate extends ReelCandidateSummary {
  campaign_code: string
  fragment_start_seconds: number | null
  fragment_duration_seconds: number | null
  source_audio_url?: string
  metadata: Record<string, unknown>
  generations: ReelGeneration[]
  renders: ReelRender[]
  publications: ReelPublication[]
  reviews: ReelReview[]
}

export async function getReelsCapabilities(): Promise<ReelsCapabilities> {
  return get('/v1/internal/reels/capabilities')
}

export async function getReelCandidates(
  status?: string,
): Promise<ReelCandidateSummary[]> {
  const response = await get<{ candidates: ReelCandidateSummary[] }>(
    '/v1/internal/reels/candidates',
    { status, limit: 100 },
  )
  return response.candidates
}

export async function getReelCandidate(id: string): Promise<ReelCandidate> {
  const response = await get<{ candidate: ReelCandidate }>(
    `/v1/internal/reels/candidates/${id}`,
  )
  return response.candidate
}

export async function createReelCandidate(
  projectId: string,
  input: {
    artist?: string
    title?: string
    region: 'ru' | 'en'
    language: 'ru' | 'en'
  },
  idempotencyKey: string,
): Promise<ReelCandidateCreateResponse> {
  return post<ReelCandidateCreateResponse>(
    '/v1/internal/reels/candidates',
    { project_id: projectId, ...input },
    { headers: { 'Idempotency-Key': idempotencyKey } },
  )
}

export async function updateReelRender(
  renderId: string,
  settings: Record<string, string | number>,
): Promise<void> {
  await patch(`/v1/internal/reels/renders/${renderId}`, settings)
}

export async function selectReelRender(
  candidateId: string,
  renderId: string,
): Promise<void> {
  await post(`/v1/internal/reels/candidates/${candidateId}/select-render`, {
    render_id: renderId,
  })
}

export async function cancelReelCandidate(candidateId: string): Promise<void> {
  await post(`/v1/internal/reels/candidates/${candidateId}/cancel`)
}

export async function publishReelCandidate(candidateId: string): Promise<void> {
  await post(`/v1/internal/reels/candidates/${candidateId}/publish-now`)
}

export async function reviewReelRender(
  renderId: string,
  input: { verdict: 'good' | 'usable_with_edits' | 'bad'; tags: string[]; comment: string },
): Promise<void> {
  await post(`/v1/internal/reels/renders/${renderId}/review`, input)
}

export function currentCampaignCode(): string | null {
  const fromQuery = new URLSearchParams(window.location.search).get('campaign')
  if (fromQuery && /^[a-zA-Z0-9_-]{6,32}$/.test(fromQuery)) {
    window.sessionStorage.setItem('audio2midi_campaign', fromQuery)
    return fromQuery
  }
  const remembered = window.sessionStorage.getItem('audio2midi_campaign')
  return remembered && /^[a-zA-Z0-9_-]{6,32}$/.test(remembered)
    ? remembered
    : null
}

export async function recordCampaignEvent(
  eventType: 'signup' | 'upload_started' | 'upload_completed',
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const campaignCode = currentCampaignCode()
  if (!campaignCode) return
  await post(`/v1/attribution/${campaignCode}/event`, {
    event_type: eventType,
    metadata,
  })
}
