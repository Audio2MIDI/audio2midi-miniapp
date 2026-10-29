import { afterEach, expect, it, vi } from 'vitest'

import { fetchLatestMidi } from './midi'

afterEach(() => vi.unstubAllGlobals())

it('keeps old MIDI links working through the authenticated compatibility reader', async () => {
  vi.stubGlobal('window', {
    location: { origin: 'http://localhost:8080' },
    Telegram: { WebApp: { initData: 'synthetic-init-data' } },
  })
  const payload = { ok: true, midi_id: 'old id', filename: 'old.mid', size: 1, data: 'AA==' }
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload)))
  vi.stubGlobal('fetch', fetch)

  await expect(fetchLatestMidi('old id')).resolves.toEqual(payload)
  const [url, options] = fetch.mock.calls[0]
  expect(new URL(url).pathname).toBe('/api/latest-midi')
  expect(new URL(url).searchParams.get('midi_id')).toBe('old id')
  expect(options.credentials).toBe('include')
  expect(options.headers.get('Authorization')).toBe('tma synthetic-init-data')
})
