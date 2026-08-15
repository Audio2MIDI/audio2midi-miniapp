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
export interface AnalyticsFunnel { range: AnalyticsRange; stages: Array<{ stage: string; count: number }> }
export interface AnalyticsRetention { range: AnalyticsRange; cohorts: Array<{ cohort_date: string; cohort_size: number; d1: number; d7: number; r7: number; d30: number; r30: number }> }
export interface AnalyticsPayments { range: AnalyticsRange; daily: Array<{ day: string; channel: string; paid: number; gross_kopek: number; authorized: number; failed: number }>; intents: Array<{ channel: string; status: string; count: number }> }
export interface AnalyticsQuality { range: AnalyticsRange; segments: Array<{ channel: string; engine: string; responses: number; average_rating: number | null; negative: number; positive: number }> }
export interface AnalyticsDataQuality { checks: Record<string, number | null>; statuses: Record<string, 'ok' | 'alert'>; generated_at: string }
export interface AnalyticsSurfaces {
  range: AnalyticsRange
  surfaces: Array<{ event_name: string; events: number; unique_accounts: number; active_days: number }>
  funnel: { workspace: number; project: number; visualizer: number; editor: number; published: number }
  feedback: { shown: number; submitted: number; response_rate: number | null }
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
  reels: AnalyticsReels
  outreach: { items: OutreachItem[]; message_template: string } | null
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

export async function getAnalyticsBundle(params: { from: string; to: string; channel?: string }): Promise<AnalyticsBundle> {
  const productParams = {
    from: params.from,
    to: params.to,
    channel: params.channel === 'telegram' || params.channel === 'web' ? params.channel : undefined,
  }
  const access = await getAnalyticsAccess()
  const [overview, funnel, retention, payments, quality, dataQuality, surfaces, reels, outreach] = await Promise.all([
    get<AnalyticsOverview>('/v1/admin/analytics/overview', params),
    get<AnalyticsFunnel>('/v1/admin/analytics/funnel', productParams),
    get<AnalyticsRetention>('/v1/admin/analytics/retention', productParams),
    get<AnalyticsPayments>('/v1/admin/analytics/payments', params),
    get<AnalyticsQuality>('/v1/admin/analytics/quality', productParams),
    get<AnalyticsDataQuality>('/v1/admin/analytics/data-quality'),
    get<AnalyticsSurfaces>('/v1/admin/analytics/surfaces', { from: params.from, to: params.to }),
    get<AnalyticsReels>('/v1/admin/analytics/reels', { from: params.from, to: params.to }),
    access.role === 'owner'
      ? get<{ items: OutreachItem[]; message_template: string }>('/v1/admin/analytics/outreach')
      : Promise.resolve(null),
  ])
  return { role: access.role, overview, funnel, retention, payments, quality, dataQuality, surfaces, reels, outreach }
}

function analyticsSessionId(): string {
  const key = 'a2m_analytics_session_id'
  const existing = sessionStorage.getItem(key)
  if (existing) return existing
  const value = crypto.randomUUID()
  sessionStorage.setItem(key, value)
  return value
}

export async function trackProductEvent(
  eventName:
    | 'result.opened' | 'result.downloaded' | 'paywall.shown' | 'session.authenticated'
    | 'workspace.opened' | 'project.opened' | 'visualizer.opened'
    | 'editor.opened' | 'editor.draft_saved' | 'editor.version_published'
    | 'feedback.prompt_shown' | 'feedback.prompt_dismissed',
  input: { objectType?: string; objectId?: string; properties?: Record<string, unknown> } = {},
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
