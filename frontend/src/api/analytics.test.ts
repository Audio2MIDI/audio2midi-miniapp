import { describe, expect, it, vi } from 'vitest'

import {
  downloadIntentUrl,
  trackSuccessfulVisualizerLoad,
  visualizerAnalyticsTarget,
  visualizerUrl,
} from './analytics'

describe('product analytics boundaries', () => {
  it('adds download intent only when an explicit download link asks for it', () => {
    const source = '/api/v1/me/artifacts/39e98b06-55fd-49f6-87f5-961b760af383/download'

    expect(new URL(downloadIntentUrl(source)).searchParams.get('intent')).toBe('download')
    expect(source).not.toContain('intent=download')
  })

  it('identifies durable and legacy visualizer sources without private data', () => {
    expect(visualizerAnalyticsTarget('/api/v1/me/artifacts/39e98b06-55fd-49f6-87f5-961b760af383/download')).toEqual({
      objectType: 'artifact', objectId: '39e98b06-55fd-49f6-87f5-961b760af383', sourceKind: 'artifact',
    })
    expect(visualizerAnalyticsTarget('/api/v1/me/legacy-results/42/midi')).toEqual({
      objectType: 'legacy_result', objectId: '42', sourceKind: 'legacy',
    })
  })

  it('uses a same-origin visualizer intent without claiming a download', () => {
    const pageUrl = visualizerUrl(
      '/api/v1/me/artifacts/39e98b06-55fd-49f6-87f5-961b760af383/download',
      'https://app.audio2midi.ru',
    )
    const contentUrl = new URL(new URL(pageUrl, 'https://app.audio2midi.ru').searchParams.get('file')!)

    expect(contentUrl.origin).toBe('https://app.audio2midi.ru')
    expect(contentUrl.searchParams.get('intent')).toBe('visualizer')
    expect(contentUrl.searchParams.get('intent')).not.toBe('download')
  })

  it('emits once only after the successful MIDI parse path calls it', () => {
    const tracked = new Set<string>()
    const emit = vi.fn()

    expect(trackSuccessfulVisualizerLoad(tracked, 'artifact-1', null, emit)).toBe(true)
    expect(trackSuccessfulVisualizerLoad(tracked, 'artifact-1', null, emit)).toBe(false)
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith({
      objectType: undefined,
      objectId: undefined,
      properties: { surface: 'visualizer', source_kind: 'local' },
    })
  })
})
