import { expect, test } from '@playwright/test'

const range = { from: '2026-08-14', to: '2026-08-20' }

test('trusted analytics keeps its hierarchy on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/api/v1/admin/analytics/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const payload = path.endsWith('/access') ? { role: 'owner' }
      : path.endsWith('/overview') ? {
        range,
        totals: {
          active_accounts: 8, registrations: 2, processing_submitted: 12,
          results_available: 10, processing_failed: 1, confirmed_payments: 2,
          revenue_kopek: 118000, paying_accounts: 2, active_paid_accounts: 4,
        },
        source_breakdown: {
          live_user: { events: 12, accounts: 8, processing_submitted: 12, results_available: 10, processing_failed: 1, first_event_at: null, last_event_at: null, tasks: 0 },
          backfill: { events: 0, accounts: 0, processing_submitted: 0, results_available: 0, processing_failed: 0, first_event_at: null, last_event_at: null, tasks: 0 },
          internal: { events: 0, accounts: 0, processing_submitted: 0, results_available: 0, processing_failed: 0, first_event_at: null, last_event_at: null, tasks: 2 },
        },
        data_freshness: { refreshed_through: '2026-08-20T12:00:00Z', updated_at: '2026-08-20T12:00:00Z' },
      }
      : path.endsWith('/funnel') ? {
        range,
        stages: [
          { stage: 'submitted', flows: 12, accounts: 8, count: 8 },
          { stage: 'ready', flows: 10, accounts: 7, count: 7 },
          { stage: 'failed', flows: 1, accounts: 1, count: 1 },
          { stage: 'in_progress', flows: 1, accounts: 1, count: 1 },
          { stage: 'consumed', flows: 8, accounts: 6, count: 6 },
          { stage: 'downloaded', flows: 4, accounts: 3, count: 3 },
        ],
        segments: [{ channel: 'web', engine: 'picogen', submitted: 12, ready: 10, consumed: 8, ready_rate: 0.833, consumption_rate: 0.8, exact_latency_sample: 7, p50_seconds: 120, p95_seconds: 330 }],
        secondary_flows: [{ flow_kind: 'video', submitted: 2, ready: 2, failed: 0, accounts: 1 }],
      }
      : path.endsWith('/retention') ? { range, cohorts: [{ cohort_date: '2026-08-20', cohort_size: 3, d1: null, d7: null, r7: null, d30: null, r30: null }] }
      : path.endsWith('/payments') ? {
        range,
        totals: { created_intents: 3, confirmed_payments: 2, revenue_kopek: 118000, paying_accounts: 2, accounts_paid_after_free: 1 },
        daily: [{ day: '2026-08-20', channel: 'web', created_intents: 3, paid: 2, gross_kopek: 118000, failed: 1 }],
        intents: [],
      }
      : path.endsWith('/quality') ? { range, segments: [{ channel: 'web', engine: 'picogen', responses: 2, average_rating: 4.5, negative: 0, positive: 2 }] }
      : path.endsWith('/data-quality') ? { checks: { missing_submit_events_24h: 0, rollup_age_seconds: 120 }, statuses: { missing_submit_events_24h: 'ok', rollup_freshness: 'ok' }, generated_at: '2026-08-20T12:00:00Z' }
      : {
        range,
        surfaces: [{ event_name: 'project.opened', events: 6, unique_accounts: 4, active_days: 3, coverage_started_at: '2026-08-15T00:00:00Z' }],
        funnel: { workspace: 5, project: 4, visualizer: 2, editor: 1, published: 1 },
        feedback: { shown: 2, submitted: 1, response_rate: 0.5 },
        coverage: { 'project.opened': '2026-08-15T00:00:00Z' },
      }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
  })

  await page.goto('/internal/analytics')
  await expect(page.getByRole('heading', { name: 'Ядро продукта' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Обработки, не события' })).toBeVisible()
  await expect(page.getByText('ещё рано').first()).toBeVisible()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
})
