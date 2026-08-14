import { get, post } from './client'

export type AnalyticsRole = 'owner' | 'analyst'
export type AnalyticsChannel = 'telegram' | 'web' | 'recurring' | 'admin' | 'legacy_unknown'

export interface AnalyticsRange { from: string; to: string }
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
  data_freshness: { refreshed_through: string | null; updated_at: string | null }
}
export interface AnalyticsFunnel { range: AnalyticsRange; stages: Array<{ stage: string; count: number }> }
export interface AnalyticsRetention { range: AnalyticsRange; cohorts: Array<{ cohort_date: string; cohort_size: number; d1: number; d7: number; r7: number; d30: number; r30: number }> }
export interface AnalyticsPayments { range: AnalyticsRange; daily: Array<{ day: string; channel: string; paid: number; gross_kopek: number; authorized: number; failed: number }>; intents: Array<{ channel: string; status: string; count: number }> }
export interface AnalyticsQuality { range: AnalyticsRange; segments: Array<{ channel: string; engine: string; responses: number; average_rating: number | null; negative: number; positive: number }> }
export interface AnalyticsDataQuality { checks: Record<string, number | null>; statuses: Record<string, 'ok' | 'alert'>; generated_at: string }

export interface AnalyticsBundle {
  role: AnalyticsRole
  overview: AnalyticsOverview
  funnel: AnalyticsFunnel
  retention: AnalyticsRetention
  payments: AnalyticsPayments
  quality: AnalyticsQuality
  dataQuality: AnalyticsDataQuality
}

export async function getAnalyticsAccess(): Promise<{ role: AnalyticsRole }> {
  return get('/v1/admin/analytics/access')
}

export async function getAnalyticsBundle(params: { from: string; to: string; channel?: string }): Promise<AnalyticsBundle> {
  const productParams = {
    from: params.from,
    to: params.to,
    channel: params.channel === 'telegram' || params.channel === 'web' ? params.channel : undefined,
  }
  const [access, overview, funnel, retention, payments, quality, dataQuality] = await Promise.all([
    getAnalyticsAccess(),
    get<AnalyticsOverview>('/v1/admin/analytics/overview', params),
    get<AnalyticsFunnel>('/v1/admin/analytics/funnel', productParams),
    get<AnalyticsRetention>('/v1/admin/analytics/retention', productParams),
    get<AnalyticsPayments>('/v1/admin/analytics/payments', params),
    get<AnalyticsQuality>('/v1/admin/analytics/quality', productParams),
    get<AnalyticsDataQuality>('/v1/admin/analytics/data-quality'),
  ])
  return { role: access.role, overview, funnel, retention, payments, quality, dataQuality }
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
  eventName: 'result.opened' | 'result.downloaded' | 'paywall.shown' | 'session.authenticated',
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
