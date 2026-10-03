import { expect, test } from '@playwright/test'

const project = {
  id: '00000000-0000-4000-8000-000000000001', title: 'Контрольный проект', status: 'processing',
  source_filename: null, source_size_bytes: null, source_mime_type: null,
  created_at: '2026-10-04T00:00:00Z', feedback_submitted: false, versions: [],
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/me', (route) => route.fulfill({ status: 401, json: {} }))
  await page.route('**/api/v1/me/editor/capabilities', (route) => route.fulfill({ json: { enabled: false } }))
  await page.route('**/api/v1/me/events', (route) => route.fulfill({ status: 204 }))
})

test('project polling recovers from a network failure without reloading', async ({ page }) => {
  let requests = 0
  await page.route(`**/api/v1/me/projects/${project.id}`, async (route) => {
    requests += 1
    if (requests === 2) return route.abort('failed')
    await route.fulfill({ json: { project: { ...project, status: requests >= 3 ? 'ready' : 'processing' } } })
  })
  await page.goto(`/tracks/${project.id}`)
  await expect(page.getByRole('heading', { name: 'Обрабатываем аудио' })).toBeVisible()
  await expect(page.getByText('Готово', { exact: true })).toBeVisible({ timeout: 15000 })
  expect(requests).toBe(3)
  await page.waitForTimeout(4500)
  expect(requests).toBe(3)
})

for (const status of [401, 404]) {
  test(`project polling stops on permanent HTTP ${status}`, async ({ page }) => {
    let requests = 0
    await page.route(`**/api/v1/me/projects/${project.id}`, (route) => {
      requests += 1
      return route.fulfill({ status, json: { detail: 'unavailable' } })
    })
    await page.goto(`/tracks/${project.id}`)
    await expect(page.getByRole('heading', { name: 'Композиция недоступна' })).toBeVisible()
    await page.waitForTimeout(4500)
    expect(requests).toBe(1)
  })
}

test('leaving the project cancels a scheduled retry', async ({ page }) => {
  let requests = 0
  await page.route(`**/api/v1/me/projects/${project.id}`, (route) => {
    requests += 1
    return route.abort('failed')
  })
  await page.goto(`/tracks/${project.id}`)
  await expect(page.getByRole('heading', { name: 'Композиция недоступна' })).toBeVisible()
  await page.getByRole('link', { name: 'Вернуться в кабинет' }).click()
  await page.waitForTimeout(4500)
  expect(requests).toBe(1)
})
