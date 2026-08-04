import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const READY_PROJECT_ID = '22222222-2222-4222-8222-222222222222'
const QUEUED_PROJECT_ID = '11111111-1111-4111-8111-111111111111'

const baseAccount = {
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

const populatedLibrary = [
  {
    id: 'job-active', project_id: QUEUED_PROJECT_ID, source: 'job', engine: 'picogen',
    status: 'queued', created_at: '2026-08-03T18:20:00Z', finished_at: null, sanitized_error: null,
    delivery_state: 'pending', preparation_state: 'pending', title: 'Shape of You', artifacts: [],
  },
  {
    id: 'job-ready', project_id: READY_PROJECT_ID, source: 'job', engine: 'picogen',
    status: 'succeeded', created_at: '2026-08-02T18:20:00Z', finished_at: '2026-08-02T18:24:00Z', sanitized_error: null,
    delivery_state: 'delivered', preparation_state: 'ready', title: 'Linkin Park — Numb', artifacts,
  },
  {
    id: 'job-sheet', project_id: '33333333-3333-4333-8333-333333333333', source: 'job', engine: 'sheetsage',
    status: 'succeeded', created_at: '2026-08-01T12:00:00Z', finished_at: '2026-08-01T12:03:00Z', sanitized_error: null,
    delivery_state: 'delivered', preparation_state: 'ready', title: 'Canta Lala', artifacts,
  },
]

function projectFixture(options: { status?: 'ready' | 'queued' | 'processing' | 'failed'; locked?: boolean } = {}) {
  const status = options.status ?? 'ready'
  const ready = status === 'ready'
  return {
    id: ready ? READY_PROJECT_ID : QUEUED_PROJECT_ID,
    title: ready ? 'Linkin Park — Numb' : 'Shape of You',
    status,
    source_filename: ready ? 'Linkin Park - Numb.mp3' : 'Shape of You.mp3',
    source_size_bytes: 7340032,
    source_mime_type: 'audio/mpeg',
    created_at: '2026-08-02T18:20:00Z',
    versions: [{
      version_id: ready ? 'version-1' : 'version-queued',
      version_kind: 'generated',
      version_label: 'Исходная версия',
      version_created_at: '2026-08-02T18:24:00Z',
      job_id: ready ? 'job-ready' : 'job-active',
      engine: 'picogen',
      status: ready ? 'succeeded' : status,
      created_at: '2026-08-02T18:20:00Z',
      started_at: ready ? '2026-08-02T18:21:00Z' : null,
      finished_at: ready ? '2026-08-02T18:24:00Z' : null,
      sanitized_error: status === 'failed' ? 'Сервер временно недоступен.' : null,
      delivery_state: options.locked ? 'locked' : ready ? 'delivered' : 'pending',
      preparation_state: ready ? 'ready' : 'pending',
      artifacts: options.locked
        ? [{ id: 'preview-1', role: 'preview_mp3', size_bytes: 524288, mime_type: 'audio/mpeg', download_url: '/fixtures/preview.mp3' }]
        : ready ? artifacts : [],
    }],
  }
}

const billingPlans = [
  { period: 'day', title: 'День', days: 1, price_rub: 390, cadence: 'каждый день' },
  { period: 'week', title: 'Неделя', days: 7, price_rub: 590, cadence: 'каждую неделю' },
  { period: 'month', title: 'Месяц', days: 30, price_rub: 990, cadence: 'каждый месяц' },
  { period: 'year', title: 'Год', days: 365, price_rub: 6990, cadence: 'каждый год' },
]

interface MockOptions {
  account?: Record<string, unknown>
  library?: Record<string, unknown>[]
  project?: ReturnType<typeof projectFixture>
  signedOut?: boolean
  failAccount?: boolean
  editorEnabled?: boolean
  billingEnabled?: boolean
  recurring?: boolean
}

async function mockApi(page: Page, options: MockOptions = {}) {
  const account = { ...baseAccount, ...(options.account ?? {}) }
  const library = options.library ?? populatedLibrary
  const project = options.project ?? projectFixture()

  await page.route('**/fixtures/**', async (route) => {
    const url = route.request().url()
    const contentType = url.endsWith('.pdf')
      ? 'application/pdf'
      : url.endsWith('.mid') ? 'audio/midi' : 'audio/mpeg'
    await route.fulfill({ status: 200, contentType, body: Buffer.from('fixture') })
  })

  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    const json = async (payload: unknown, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    })

    if (pathname === '/api/v1/me') {
      if (options.failAccount) return json({ detail: 'backend unavailable' }, 503)
      if (options.signedOut) return json({ detail: 'unauthorized' }, 401)
      return json({ account })
    }
    if (pathname === '/api/v1/auth/capabilities') return json({ email_otp: true, telegram: true })
    if (pathname === '/api/v1/me/library') return json({ items: library })
    if (pathname === '/api/v1/me/editor/capabilities') {
      return json({
        enabled: options.editorEnabled ?? true,
        rollout: 'allowlist',
        can_edit_owned_results: true,
        requires_active_subscription: false,
        max_midi_bytes: 10000000,
      })
    }
    if (pathname === '/api/v1/me/notifications') {
      return json({ items: [{
        id: 'note-1', kind: 'result_ready', title: 'Партитура готова',
        body: 'Linkin Park — Numb уже в библиотеке.',
        action_url: `/tracks/${READY_PROJECT_ID}`, read_at: null, created_at: '2026-08-02T18:24:00Z',
      }] })
    }
    if (/^\/api\/v1\/me\/projects\/[0-9a-f-]+$/.test(pathname)) return json({ project })
    if (pathname === '/api/v1/me/billing/plans') {
      return json({
        enabled: options.billingEnabled ?? true,
        recurring_enabled: options.recurring ?? true,
        currency: 'RUB',
        consent_version: 'v1',
        plans: billingPlans,
      })
    }
    if (pathname === '/api/v1/me/profile') {
      return json({ profile: {
        account_id: account.account_id,
        display_name: 'Dmitry',
        locale: 'ru',
        created_at: '2026-07-01T10:00:00Z',
        updated_at: '2026-08-03T10:00:00Z',
        identities: [
          { provider: 'supabase', metadata: { email: 'dmitry@example.com' }, verified_at: '2026-07-01T10:00:00Z', last_authenticated_at: '2026-08-03T10:00:00Z', created_at: '2026-07-01T10:00:00Z' },
          { provider: 'telegram', metadata: { username: 'vosatorp' }, verified_at: '2026-07-01T10:00:00Z', last_authenticated_at: '2026-08-03T10:00:00Z', created_at: '2026-07-01T10:00:00Z' },
        ],
      } })
    }
    if (pathname === '/api/v1/me/sessions') {
      return json({ sessions: [
        { id: 'session-current', device_label: 'Chrome · macOS', auth_provider: 'supabase', created_at: '2026-08-01T10:00:00Z', last_seen_at: '2026-08-03T19:00:00Z', expires_at: '2026-09-01T10:00:00Z', revoked_at: null, is_current: true },
        { id: 'session-phone', device_label: 'Safari · iPhone', auth_provider: 'telegram', created_at: '2026-08-01T10:00:00Z', last_seen_at: '2026-08-03T18:00:00Z', expires_at: '2026-09-01T10:00:00Z', revoked_at: null, is_current: false },
      ] })
    }
    if (pathname === '/api/v1/me/catalog/search') {
      return json({ tracks: [{
        source_id: 'catalog-1', title: 'Numb', artist: 'Linkin Park', duration_ms: 185000,
        artwork_url: null, source_kind: 'catalog_track',
      }] })
    }
    if (pathname.endsWith('/feedback')) return route.fulfill({ status: 204, body: '' })
    return json({ items: [] })
  })
}

async function expectNoOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

async function expectNoA11yViolations(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(result.violations, JSON.stringify(result.violations, null, 2)).toEqual([])
}

async function selectFileAndOpenResultStep(page: Page) {
  await page.locator('input[type="file"]').setInputFiles({
    name: 'demo.mp3',
    mimeType: 'audio/mpeg',
    buffer: Buffer.from('fixture'),
  })
  await page.getByRole('button', { name: 'Продолжить' }).click()
  await expect(page).toHaveURL(/step=result/)
}

test('populated library is the first screen on desktop', async ({ page }) => {
  await mockApi(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Мои композиции' })).toBeVisible()
  await expect(page.getByText('Сейчас обрабатывается')).toBeVisible()
  await expect(page.getByText('Страницу можно закрыть', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Открыть' })).toHaveCount(3)
  await expectNoOverflow(page)
  await expectNoA11yViolations(page)
  await page.screenshot({ path: 'artifacts/ui/cabinet-desktop.png', fullPage: true })
})

test('empty library has one clear first action at tablet width', async ({ page }) => {
  await mockApi(page, {
    account: { result_count: 0, active_job_count: 0, unread_notification_count: 0 },
    library: [],
  })
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Мои композиции' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Здесь появятся ваши композиции' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Загрузить первую композицию' })).toHaveCount(1)
  await expectNoOverflow(page)
  await expectNoA11yViolations(page)
  await page.screenshot({ path: 'artifacts/ui/cabinet-empty-tablet.png', fullPage: true })
})

test('mobile library keeps the hierarchy and touch layout', async ({ page }) => {
  await mockApi(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Мои композиции' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Новая композиция' })).toBeVisible()
  await expectNoOverflow(page)
  await expectNoA11yViolations(page)
  await page.screenshot({ path: 'artifacts/ui/cabinet-mobile.png', fullPage: true })
})

test('queued project explicitly survives an unavailable worker', async ({ page }) => {
  await mockApi(page, { project: projectFixture({ status: 'queued' }) })
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.goto(`/tracks/${QUEUED_PROJECT_ID}`)
  await expect(page.getByRole('heading', { name: 'Композиция сохранена в очереди' })).toBeVisible()
  await expect(page.getByText(/Файл не потеряется/)).toBeVisible()
  await expect(page.getByText(/Страницу можно закрыть/)).toBeVisible()
  await expectNoOverflow(page)
  await expectNoA11yViolations(page)
  await page.screenshot({ path: 'artifacts/ui/project-queued-tablet.png', fullPage: true })
})

test('file wizard has three focused steps and five intentional methods', async ({ page }) => {
  await mockApi(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/new?step=source')
  await expect(page.getByRole('button', { name: 'Продолжить' })).toBeDisabled()
  await selectFileAndOpenResultStep(page)

  for (const method of ['Пиано-кавер', 'Ноты из записи фортепиано', 'Мелодия и аккорды']) {
    await expect(page.getByRole('button', { name: new RegExp(method) })).toBeVisible()
  }
  await expect(page.getByRole('button', { name: /Быстрый MIDI/ })).not.toBeVisible()
  await page.getByText('Другие инструменты', { exact: true }).click()
  await expect(page.getByRole('button', { name: /Быстрый MIDI/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Разделить аудио/ })).toBeVisible()
  await page.getByRole('button', { name: /Разделить аудио/ }).click()
  await expect(page.getByRole('button', { name: /Разделить аудио/ })).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('button', { name: 'Продолжить' }).click()
  await expect(page).toHaveURL(/step=review/)
  await expect(page.getByText('demo', { exact: true })).toBeVisible()
  await expect(page.getByText('Разделить аудио', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Начать обработку' })).toBeVisible()
  await expectNoA11yViolations(page)
  await page.screenshot({ path: 'artifacts/ui/new-review-desktop.png', fullPage: true })
})

test('link draft survives refresh while a file must be selected again', async ({ page }) => {
  await mockApi(page)
  await page.goto('/new?step=source')
  await page.getByRole('tab', { name: 'Ссылка' }).click()
  await page.getByPlaceholder('Ссылка на Яндекс Музыку, Spotify или YouTube').fill('https://music.example/track/42')
  await page.getByPlaceholder('Заполнится автоматически').fill('Ночной поезд')
  await page.getByRole('button', { name: 'Продолжить' }).click()
  await page.reload()
  await page.getByRole('button', { name: 'Источник' }).click()
  await expect(page.getByRole('tab', { name: 'Ссылка' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByPlaceholder('Ссылка на Яндекс Музыку, Spotify или YouTube')).toHaveValue('https://music.example/track/42')
  await expect(page.getByPlaceholder('Заполнится автоматически')).toHaveValue('Ночной поезд')

  await page.getByRole('tab', { name: 'Файл' }).click()
  await page.locator('input[type="file"]').setInputFiles({ name: 'reload.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('fixture') })
  await page.getByRole('button', { name: 'Продолжить' }).click()
  await page.reload()
  await page.getByRole('button', { name: 'Источник' }).click()
  await expect(page.getByText('Выберите файл или перетащите сюда')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Продолжить' })).toBeDisabled()
})

test('catalog search selects a track and fills its title', async ({ page }) => {
  await mockApi(page)
  await page.goto('/new?step=source')
  await page.getByRole('tab', { name: 'Найти песню' }).click()
  await page.getByPlaceholder('Исполнитель или название').fill('Linkin Park Numb')
  await page.getByRole('button', { name: 'Найти' }).click()
  await expect(page.getByRole('button', { name: /Numb.*Linkin Park/ })).toBeVisible()
  await page.getByRole('button', { name: /Numb.*Linkin Park/ }).click()
  await expect(page.getByPlaceholder('Заполнится автоматически')).toHaveValue('Linkin Park — Numb')
  await expect(page.getByRole('button', { name: 'Продолжить' })).toBeEnabled()
})

test('review asks for a tariff only when free access is exhausted', async ({ page }) => {
  await mockApi(page, {
    account: { subscription_until: null, subscription_status: null, remaining_requests: 0, auto_renew: false },
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/new?step=source')
  await selectFileAndOpenResultStep(page)
  await page.getByRole('button', { name: 'Продолжить' }).click()
  await expect(page.getByText('0 бесплатных обработок')).toBeVisible()
  await expect(page.getByText('Нужен тариф')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Выбрать тариф' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Начать обработку' })).toHaveCount(0)
  await expectNoOverflow(page)
  await expectNoA11yViolations(page)
  await page.screenshot({ path: 'artifacts/ui/new-review-locked-mobile.png', fullPage: true })
})

test('ready project prioritizes playback, visualization, editing and downloads', async ({ page }) => {
  await mockApi(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`/tracks/${READY_PROJECT_ID}`)
  await expect(page.getByRole('heading', { name: 'Linkin Park — Numb' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Открыть визуализацию' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Редактировать' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Скачать' })).toBeVisible()
  await expect(page.getByRole('button', { name: '5 из 5' })).toBeVisible()
  await expectNoA11yViolations(page)
  await page.screenshot({ path: 'artifacts/ui/project-desktop.png', fullPage: true })
})

test('locked project explains that regeneration is unnecessary', async ({ page }) => {
  await mockApi(page, { project: projectFixture({ locked: true }) })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/tracks/${READY_PROJECT_ID}`)
  await expect(page.getByRole('heading', { name: 'Полная версия готова' })).toBeVisible()
  await expect(page.getByText(/Повторная обработка не нужна/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Открыть полный результат' })).toBeVisible()
  await expectNoOverflow(page)
  await expectNoA11yViolations(page)
  await page.screenshot({ path: 'artifacts/ui/project-locked-mobile.png', fullPage: true })
})

test('billing is compact and recurring consent is explicit', async ({ page }) => {
  await mockApi(page, { recurring: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/billing')
  await expect(page.getByRole('heading', { name: 'Выберите период доступа' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Месяц.*990/ })).toHaveAttribute('aria-pressed', 'true')
  const payButton = page.getByRole('button', { name: /Перейти к оплате/ })
  await expect(payButton).toBeDisabled()
  await page.getByRole('checkbox').check()
  await expect(payButton).toBeEnabled()
  await expectNoOverflow(page)
  await expectNoA11yViolations(page)
  await page.screenshot({ path: 'artifacts/ui/billing-mobile.png', fullPage: true })
})

test('one-time billing is available without recurring consent', async ({ page }) => {
  await mockApi(page, { recurring: false })
  await page.goto('/billing')
  await expect(page.getByRole('checkbox')).toHaveCount(0)
  await expect(page.getByText(/Автоматических списаний нет/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Перейти к оплате/ })).toBeEnabled()
})

test('profile keeps account, identities, subscription and devices scannable', async ({ page }) => {
  await mockApi(page)
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.goto('/profile')
  for (const heading of ['Профиль', 'Способы входа', 'Подписка', 'Устройства']) {
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
  }
  await expect(page.getByText('dmitry@example.com')).toBeVisible()
  await expect(page.getByText('Chrome · macOS')).toBeVisible()
  await expect(page.getByText('Safari · iPhone')).toBeVisible()
  await expectNoOverflow(page)
  await expectNoA11yViolations(page)
  await page.screenshot({ path: 'artifacts/ui/profile-tablet.png', fullPage: true })
})

test('signed-out experience puts email first and Telegram second', async ({ page }) => {
  await mockApi(page, { signedOut: true })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Ваша музыка всегда рядом' })).toBeVisible()
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Получить код' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Войти через Telegram' })).toBeVisible()
  await expectNoA11yViolations(page)
})

test('account API failure has a recoverable error state', async ({ page }) => {
  await mockApi(page, { failAccount: true })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Кабинет не открылся' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Попробовать снова' })).toBeVisible()
  await expectNoA11yViolations(page)
})

test('primary controls expose visible keyboard focus', async ({ page }) => {
  await mockApi(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Мои композиции' })).toBeVisible()
  const focused = page.getByRole('link', { name: 'Новая композиция' })
  await focused.focus()
  await expect(focused).toBeFocused()
  const outline = await focused.evaluate((element) => {
    const style = window.getComputedStyle(element)
    return {
      focusVisible: element.matches(':focus-visible'),
      style: style.outlineStyle,
      width: style.outlineWidth,
    }
  })
  expect(outline.focusVisible).toBe(true)
  expect(outline.style).not.toBe('none')
  expect(outline.width).not.toBe('0px')
})
