import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderProjectVideo } from './account'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('project video API', () => {
  it.each(['vertical', 'horizontal'] as const)(
    'sends a typed %s format with an independent idempotency key',
    async (aspectRatio) => {
      vi.stubGlobal('window', { location: { origin: 'https://app.audio2midi.ru' } })
      const fetch = vi.fn().mockResolvedValue(new Response('{}', {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      }))
      vi.stubGlobal('fetch', fetch)

      await renderProjectVideo('project id', 'version id', aspectRatio)

      const [url, init] = fetch.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('/api/v1/me/projects/project%20id/versions/version%20id/video')
      expect(JSON.parse(String(init.body))).toEqual({ aspect_ratio: aspectRatio })
      expect(new Headers(init.headers).get('Idempotency-Key')).toBe(
        aspectRatio === 'vertical'
          ? 'web-video-version id'
          : 'web-video-horizontal-version id',
      )
    },
  )
})
