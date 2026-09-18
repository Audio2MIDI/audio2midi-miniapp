import { afterEach, describe, expect, it, vi } from 'vitest'
import { uploadProjectSource } from './account'

afterEach(() => vi.unstubAllGlobals())
describe('upload authentication boundary', () => {
  for (const sameOrigin of [false, true]) {
    it(`only authenticates the API transport: ${sameOrigin}`, async () => {
      vi.stubGlobal('window', { location: { origin: 'https://app.example' }, Telegram: { WebApp: { initData: 'test-init-data' } } })
      const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
      vi.stubGlobal('fetch', fetch)
      await uploadProjectSource(sameOrigin ? '/api/v1/me/projects/test/source' : 'https://storage.example/upload',
        new File(['audio'], 'test.flac'), { 'content-type': 'audio/flac' })
      const options = fetch.mock.calls[0][1]
      expect(options.credentials).toBe(sameOrigin ? 'include' : 'omit')
      expect(new Headers(options.headers).get('Authorization')).toBe(sameOrigin ? 'tma test-init-data' : null)
    })
  }
})
