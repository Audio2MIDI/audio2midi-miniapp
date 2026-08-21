import { get, patch, post } from './client'

export type AnalyticsRole = 'owner' | 'analyst'
export type AnalyticsChannel = 'telegram' | 'web' | 'recurring' | 'admin' | 'legacy_unknown'

export interface AnalyticsRange { from: string; to: string }
export interface AnalyticsSourceStats {
  events: number
  accounts: number
  processing_submitted: number
  results_available: number
  processing_failed: number
  first_event_at: string | null
  last_event_at: string | null
  tasks: number
}
export interface AnalyticsOverview {
  range: AnalyticsRange
  totals: {
    active_accounts: number
    registrations: number
    processing_submitted: number
    results_available: number
    processing_failed: number
    confirmed_payments: number
    revenue_kopek: number
    paying_accounts: number
    active_paid_accounts: number
  }
  source_breakdown: {
    live_user: AnalyticsSourceStats
    backfill: AnalyticsSourceStats
    internal: AnalyticsSourceStats
  }
  data_freshness: { refreshed_through: string | null; updated_at: string | null }
}
export interface AnalyticsFunnel {
  range: AnalyticsRange
  stages: Array<{ stage: string; flows: number; accounts: number; count: number }>
  segments: Array<{
    channel: 'telegram' | 'web'; engine: string; submitted: number; ready: number; consumed: number
    ready_rate: number | null; consumption_rate: number | null
    exact_latency_sample: number; p50_seconds: number | null; p95_seconds: number | null
  }>
  secondary_flows: Array<{ flow_kind: 'video' | 'editor_export'; submitted: number; ready: number; failed: number; accounts: number }>
}
export interface AnalyticsRetention {
  range: AnalyticsRange
  cohorts: Array<{
    cohort_date: string; cohort_size: number
    d1: number | null; d7: number | null; r7: number | null; d30: number | null; r30: number | null
  }>
}
export interface AnalyticsPayments {
  range: AnalyticsRange
  totals: {
    created_intents: number; confirmed_payments: number; revenue_kopek: number
    paying_accounts: number; accounts_paid_after_free: number
  }
  daily: Array<{
    day: string; channel: string; created_intents: number
    paid: number; gross_kopek: number; failed: number
  }>
  intents: Array<{ channel: string; status: string; count: number }>
}
export interface AnalyticsQuality { range: AnalyticsRange; segments: Array<{ channel: string; engine: string; responses: number; average_rating: number | null; negative: number; positive: number }> }
export interface AnalyticsDataQuality { checks: Record<string, number | null>; statuses: Record<string, 'ok' | 'alert'>; generated_at: string }
export interface AnalyticsSurfaces {
  range: AnalyticsRange
  surfaces: Array<{
    event_name: string; events: number; unique_accounts: number; active_days: number
    coverage_started_at: string | null
  }>
  funnel: { workspace: number; project: number; visualizer: number; editor: number; published: number }
  feedback: { shown: number; submitted: number; response_rate: number | null }
  coverage: Record<string, string | null>
}
export interface AnalyticsReels {
  range: AnalyticsRange
  totals: {
    generations: number; generation_pass: number; infra_failures: number
    ready_renders: number; selected_renders: number; published: number
    views: number; watch_time_seconds: number
    human_verdicts: Array<{ verdict: string; count: number }>
  }
}
export interface OutreachItem {
  id: string; account_id: string; cohort: string; score: number
  reasons: Record<string, boolean | number>; status: string
  telegram_username: string | null; brief_summary: string; tags: string[]
}

export interface AnalyticsBundle {
  role: AnalyticsRole
  overview: AnalyticsOverview
  funnel: AnalyticsFunnel
  retention: AnalyticsRetention
  payments: AnalyticsPayments
  quality: AnalyticsQuality
  dataQuality: AnalyticsDataQuality
  surfaces: AnalyticsSurfaces
}

export async function getAnalyticsAccess(): Promise<{ role: AnalyticsRole }> {
  return get('/v1/admin/analytics/access')
}

export async function updateOutreachStatus(
  id: string,
  status: 'candidate' | 'approved' | 'contacted' | 'replied' | 'declined' | 'opted_out',
): Promise<void> {
  await patch(`/v1/admin/analytics/outreach/${id}`, {
    status,
    brief_summary: '',
    tags: [],
  })
}

export async function getAnalyticsBundle(params: { from: string; to: string; channel?: string; engine?: string }): Promise<AnalyticsBundle> {
  const productParams = {
    from: params.from,
    to: params.to,
    channel: params.channel === 'telegram' || params.channel === 'web' ? params.channel : undefined,
    engine: params.engine || undefined,
  }
  const access = await getAnalyticsAccess()
  const [overview, funnel, retention, payments, quality, dataQuality, surfaces] = await Promise.all([
    get<AnalyticsOverview>('/v1/admin/analytics/overview', params),
    get<AnalyticsFunnel>('/v1/admin/analytics/funnel', productParams),
    get<AnalyticsRetention>('/v1/admin/analytics/retention', productParams),
    get<AnalyticsPayments>('/v1/admin/analytics/payments', {
      from: params.from, to: params.to, channel: productParams.channel,
    }),
    get<AnalyticsQuality>('/v1/admin/analytics/quality', productParams),
    get<AnalyticsDataQuality>('/v1/admin/analytics/data-quality'),
    get<AnalyticsSurfaces>('/v1/admin/analytics/surfaces', { from: params.from, to: params.to }),
  ])
  return { role: access.role, overview, funnel, retention, payments, quality, dataQuality, surfaces }
}

function analyticsSessionId(): string {
  const key = 'a2m_analytics_session_id'
  try {
    const existing = sessionStorage.getItem(key)
    if (existing) return existing
    const value = crypto.randomUUID()
    sessionStorage.setItem(key, value)
    return value
  } catch {
    return crypto.randomUUID()
  }
}

type ProductEventInput = {
  'workspace.opened': {
    objectType?: undefined; objectId?: undefined; properties: { surface: 'library' }
  }
  'project.opened': {
    objectType: 'project'; objectId: string; properties: { surface: 'project' }
  }
  'visualizer.opened': {
    objectType?: 'artifact' | 'legacy_result'; objectId?: string
    properties: { surface: 'visualizer'; engine?: string; source_kind: 'artifact' | 'legacy' | 'local' }
  }
  'feedback.prompt_shown': {
    objectType: 'project'; objectId: string; properties: { surface: 'project' }
  }
  'feedback.prompt_dismissed': {
    objectType: 'project'; objectId: string; properties: { surface: 'project' }
  }
}

export function downloadIntentUrl(
  downloadUrl: string,
  origin = typeof window === 'undefined' ? 'https://app.audio2midi.ru' : window.location.origin,
): string {
  const url = new URL(downloadUrl, origin)
  url.searchParams.set('intent', 'download')
  return url.toString()
}

export function visualizerUrl(
  downloadUrl: string,
  origin = typeof window === 'undefined' ? 'https://app.audio2midi.ru' : window.location.origin,
): string {
  const contentUrl = new URL(downloadUrl, origin)
  contentUrl.searchParams.set('intent', 'visualizer')
  return `/visualizer?file=${encodeURIComponent(contentUrl.toString())}`
}

export function visualizerAnalyticsTarget(fileUrl?: string | null): {
  objectType?: 'artifact' | 'legacy_result'
  objectId?: string
  sourceKind: 'artifact' | 'legacy' | 'local'
} {
  if (!fileUrl) return { sourceKind: 'local' }
  const artifact = fileUrl.match(/\/artifacts\/([0-9a-f-]{36})\/download(?:[?#]|$)/i)
  if (artifact) return { objectType: 'artifact', objectId: artifact[1], sourceKind: 'artifact' }
  const legacy = fileUrl.match(/\/legacy-results\/([1-9][0-9]*)\/midi(?:[?#]|$)/i)
  if (legacy) return { objectType: 'legacy_result', objectId: legacy[1], sourceKind: 'legacy' }
  return { sourceKind: 'legacy' }
}

export function trackSuccessfulVisualizerLoad(
  trackedSources: Set<string>,
  sourceKey: string,
  fileUrl?: string | null,
  emit: (input: ProductEventInput['visualizer.opened']) => void = (input) => {
    void trackProductEvent('visualizer.opened', input)
  },
): boolean {
  if (trackedSources.has(sourceKey)) return false
  trackedSources.add(sourceKey)
  const target = visualizerAnalyticsTarget(fileUrl)
  emit({
    objectType: target.objectType,
    objectId: target.objectId,
    properties: { surface: 'visualizer', source_kind: target.sourceKind },
  })
  return true
}

export function trackReadyProjectOpen(
  trackedProjectIds: Set<string>,
  projectId: string,
  status: string,
  emit: (input: ProductEventInput['project.opened']) => void = (input) => {
    void trackProductEvent('project.opened', input)
  },
): boolean {
  if (status !== 'ready' || trackedProjectIds.has(projectId)) return false
  trackedProjectIds.add(projectId)
  emit({
    objectType: 'project',
    objectId: projectId,
    properties: { surface: 'project' },
  })
  return true
}

export async function trackProductEvent<EventName extends keyof ProductEventInput>(
  eventName: EventName,
  input: ProductEventInput[EventName],
): Promise<void> {
  try {
    await post<void>('/v1/me/events', {
      event_id: crypto.randomUUID(),
      event_name: eventName,
      occurred_at: new Date().toISOString(),
      session_id: analyticsSessionId(),
      object_type: input.objectType,
      object_id: input.objectId,
      properties: input.properties ?? {},
    })
  } catch {
    // Product behavior must never depend on best-effort browser analytics.
  }
}
