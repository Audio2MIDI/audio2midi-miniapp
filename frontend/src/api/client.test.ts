import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError, fetchWithNetworkError, post } from './client'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('API network errors', () => {
  it('replaces browser-specific fetch errors with Russian product copy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(fetchWithNetworkError('/upload')).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
      message: 'Не удалось связаться с сервером. Проверьте интернет и попробуйте ещё раз.',
    } satisfies Partial<ApiError>)
  })

  it('uses the same error handling for regular API requests', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://app.audio2midi.ru' } })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Load failed')))

    await expect(post('/v1/me/projects/presign', { title: 'Test' })).rejects.toMatchObject({
      status: 0,
      message: 'Не удалось связаться с сервером. Проверьте интернет и попробуйте ещё раз.',
    })
  })
})
