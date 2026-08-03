import { expect, test, type Page } from '@playwright/test'

const account = {
  account_id: 'account-fixture',
  account_created_at: '2026-07-01T10:00:00Z',
  username: 'vosatorp',
  language: 'ru',
  remaining_requests: 3,
  balance: 0,
  subscription_until: '2026-08-30T10:00:00Z',
  subscription_period: 'month',
  subscription_price_rub: 990,
  auto_renew: true,
  next_charge_at: '2026-08-30T10:00:00Z',
  subscription_status: 'active',
  result_count: 3,
  active_job_count: 1,
  unread_notification_count: 1,
}

const artifacts = [
  { id: 'midi-1', role: 'midi', size_bytes: 18432, mime_type: 'audio/midi', download_url: '/fixtures/numb.mid' },
  { id: 'pdf-1', role: 'pdf', size_bytes: 872448, mime_type: 'application/pdf', download_url: '/fixtures/numb.pdf' },
  { id: 'mp3-1', role: 'mp3', size_bytes: 3145728, mime_type: 'audio/mpeg', download_url: '/fixtures/numb.mp3' },
]

async function mockApi(page: Page) {
  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    const payload = pathname === '/api/v1/me'
      ? { account }
      : pathname === '/api/v1/me/library'
        ? { items: [
            {
              id: 'job-active', project_id: '11111111-1111-4111-8111-111111111111', source: 'job', engine: 'picogen',
              status: 'queued', created_at: '2026-08-03T18:20:00Z', finished_at: null, sanitized_error: null,
              delivery_state: 'pending', preparation_state: 'pending', title: 'Shape of You', artifacts: [],
            },
            {
              id: 'job-ready', project_id: '22222222-2222-4222-8222-222222222222', source: 'job', engine: 'picogen',
              status: 'succeeded', created_at: '2026-08-02T18:20:00Z', finished_at: '2026-08-02T18:24:00Z', sanitized_error: null,
              delivery_state: 'delivered', preparation_state: 'ready', title: 'Linkin Park — Numb', artifacts,
            },
            {
              id: 'job-sheet', project_id: '33333333-3333-4333-8333-333333333333', source: 'job', engine: 'sheetsage',
              status: 'succeeded', created_at: '2026-08-01T12:00:00Z', finished_at: '2026-08-01T12:03:00Z', sanitized_error: null,
              delivery_state: 'delivered', preparation_state: 'ready', title: 'Canta Lala', artifacts,
            },
          ] }
        : pathname === '/api/v1/me/editor/capabilities'
          ? { enabled: true, rollout: 'allowlist', can_edit_owned_results: true, requires_active_subscription: false, max_midi_bytes: 10000000 }
          : pathname === '/api/v1/me/notifications'
            ? { items: [{ id: 'note-1', kind: 'result_ready', title: 'Партитура готова', body: 'Linkin Park — Numb уже в библиотеке.', action_url: '/tracks/22222222-2222-4222-8222-222222222222', read_at: null, created_at: '2026-08-02T18:24:00Z' }] }
            : pathname === '/api/v1/me/projects/22222222-2222-4222-8222-222222222222'
              ? { project: {
                  id: '22222222-2222-4222-8222-222222222222', title: 'Linkin Park — Numb', status: 'ready',
                  source_filename: 'Linkin Park - Numb.mp3', source_size_bytes: 7340032, source_mime_type: 'audio/mpeg', created_at: '2026-08-02T18:20:00Z',
                  versions: [{ version_id: 'version-1', version_kind: 'generated', version_label: 'Исходная версия', version_created_at: '2026-08-02T18:24:00Z', job_id: 'job-ready', engine: 'picogen', status: 'succeeded', created_at: '2026-08-02T18:20:00Z', started_at: '2026-08-02T18:21:00Z', finished_at: '2026-08-02T18:24:00Z', sanitized_error: null, delivery_state: 'delivered', preparation_state: 'ready', artifacts }],
                } }
              : pathname === '/api/v1/me/billing/plans'
                ? { enabled: true, recurring_enabled: true, currency: 'RUB', consent_version: 'v1', plans: [
                    { period: 'day', title: 'День', days: 1, price_rub: 390, cadence: 'каждый день' },
                    { period: 'week', title: 'Неделя', days: 7, price_rub: 590, cadence: 'каждую неделю' },
                    { period: 'month', title: 'Месяц', days: 30, price_rub: 990, cadence: 'каждый месяц' },
                    { period: 'year', title: 'Год', days: 365, price_rub: 6990, cadence: 'каждый год' },
                  ] }
                : { items: [] }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
  })
}

test.beforeEach(async ({ page }) => {
  await mockApi(page)
})

test('library is the first screen and active jobs are explicit', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Мои композиции' })).toBeVisible()
  await expect(page.getByText('Сейчас обрабатывается')).toBeVisible()
  await expect(page.getByText('Страницу можно закрыть', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Открыть' })).toHaveCount(3)
  await page.screenshot({ path: 'artifacts/ui/cabinet-desktop.png', fullPage: true })
})

test('new project has three focused steps and keeps advanced tools folded', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/new?step=source')
  await page.locator('input[type="file"]').setInputFiles({ name: 'demo.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('fixture') })
  await page.getByRole('button', { name: 'Продолжить' }).click()
  await expect(page).toHaveURL(/step=result/)
  await expect(page.getByRole('button', { name: /Пиано-кавер/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Быстрый MIDI/ })).not.toBeVisible()
  await page.getByRole('button', { name: 'Продолжить' }).click()
  await expect(page).toHaveURL(/step=review/)
  await expect(page.getByText('demo', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Начать обработку' })).toBeVisible()
  await page.screenshot({ path: 'artifacts/ui/new-review-desktop.png', fullPage: true })
})

test('project page prioritizes playback, visualization and editing', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/tracks/22222222-2222-4222-8222-222222222222')
  await expect(page.getByRole('heading', { name: 'Linkin Park — Numb' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Открыть визуализацию' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Редактировать' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Скачать' })).toBeVisible()
  await page.screenshot({ path: 'artifacts/ui/project-desktop.png', fullPage: true })
})

test('billing is compact and mobile layouts have no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/billing')
  await expect(page.getByRole('heading', { name: 'Выберите период доступа' })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  await page.screenshot({ path: 'artifacts/ui/billing-mobile.png', fullPage: true })

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Мои композиции' })).toBeVisible()
  const cabinetOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(cabinetOverflow).toBeLessThanOrEqual(0)
  await page.screenshot({ path: 'artifacts/ui/cabinet-mobile.png', fullPage: true })
})
