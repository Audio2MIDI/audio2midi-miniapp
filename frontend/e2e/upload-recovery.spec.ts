import { createHash } from 'node:crypto'
import { expect, test } from '@playwright/test'

const id = '11111111-1111-4111-8111-111111111111'
const data = Buffer.from('test audio bytes')
const digest = createHash('sha256').update(data).digest('hex')

for (const width of [390, 1280]) {
  test(`resume same project at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    let uploaded = false
    let puts = 0
    let creates = 0
    let submits = 0
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body })
      if (path === '/api/v1/me') return json({ account: { account_id: 'fixture', remaining_requests: 3 } })
      if (path === '/api/v1/me/library') return json({ items: [{
        id: `upload-${id}`, project_id: id, source: 'project', engine: '', status: 'uploading',
        title: 'Тестовая композиция', created_at: '2026-09-18', finished_at: null,
        artifacts: [], delivery_state: 'pending', preparation_state: 'pending', sanitized_error: null,
      }] })
      if (path.endsWith('/presign')) { creates++; return json({}, 500) }
      if (path.endsWith('/upload-complete')) return uploaded
        ? json({ project_id: id, source_uploaded_at: '2026-09-18' })
        : json({ detail: 'uploaded audio is unavailable' }, 422)
      if (path.endsWith('/source')) { puts++; uploaded = true; return route.fulfill({ status: 204 }) }
      if (path.endsWith('/submit')) { submits++; return json({}) }
      if (path === `/api/v1/me/projects/${id}`) return json({ project: {
        id, title: 'Тестовая композиция', status: 'uploading', source_filename: 'test.flac',
        source_sha256: digest, source_size_bytes: data.length, source_mime_type: 'audio/flac', versions: [],
        created_at: '2026-09-18', feedback_submitted: false,
      } })
      return json({ enabled: false, items: [] })
    })
    await page.goto('/')
    await expect(page.getByText('Загрузка не завершена', { exact: true })).toBeVisible()
    await page.getByRole('link', { name: 'Открыть', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Загрузка ещё не завершена' })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath(`project-${width}.png`), fullPage: true })
    await page.getByRole('link', { name: 'Продолжить загрузку' }).click()
    await expect(page.getByRole('status')).toContainText('тот же проект')
    await page.locator('input[type=file]').setInputFiles({ name: 'test.flac', mimeType: 'audio/flac', buffer: data })
    await page.screenshot({ path: testInfo.outputPath(`resume-${width}.png`), fullPage: true })
    await page.getByRole('button', { name: 'Продолжить', exact: true }).click()
    await page.getByRole('button', { name: 'Продолжить', exact: true }).click()
    await page.getByRole('button', { name: /Начать|Обработать|Создать/ }).click()
    await expect.poll(() => submits).toBe(1)
    expect(creates).toBe(0)
    expect(puts).toBe(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  })
}
