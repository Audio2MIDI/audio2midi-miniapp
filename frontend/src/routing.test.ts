import { describe, expect, it } from 'vitest'

import {
  parseTelegramStartParam,
  safeEditorReturnPath,
  telegramLoginUrl,
} from './routing'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const ORIGIN = 'https://app.audio2midi.ru'

describe('safeEditorReturnPath', () => {
  it('accepts only a local editor UUID route', () => {
    expect(
      safeEditorReturnPath(`/editor/${PROJECT_ID}`, ORIGIN),
    ).toBe(`/editor/${PROJECT_ID}`)
  })

  it.each([
    'https://evil.example/editor/11111111-1111-4111-8111-111111111111',
    '//evil.example/editor/11111111-1111-4111-8111-111111111111',
    '/\\evil.example/editor/11111111-1111-4111-8111-111111111111',
    '/profile',
    `/editor/${PROJECT_ID}?next=https://evil.example`,
    '/editor/not-a-uuid',
  ])('rejects unsafe or unsupported return path %s', (candidate) => {
    expect(safeEditorReturnPath(candidate, ORIGIN)).toBeNull()
  })
})

describe('Telegram start parameters', () => {
  it('keeps cabinet out of the MIDI visualizer path', () => {
    expect(parseTelegramStartParam('cabinet')).toEqual({
      midiParam: null,
      returnPath: null,
    })
  })

  it('routes editor UUIDs back to the editor', () => {
    expect(parseTelegramStartParam(`editor_${PROJECT_ID}`)).toEqual({
      midiParam: null,
      returnPath: `/editor/${PROJECT_ID}`,
    })
    expect(telegramLoginUrl(`/editor/${PROJECT_ID}`)).toBe(
      `https://t.me/Audio2MIDIBot?startapp=editor_${PROJECT_ID}`,
    )
  })

  it('preserves MIDI and legacy visualizer links', () => {
    expect(parseTelegramStartParam('midi_result-42')).toEqual({
      midiParam: 'result-42',
      returnPath: null,
    })
    expect(parseTelegramStartParam('legacy-result')).toEqual({
      midiParam: 'legacy-result',
      returnPath: null,
    })
  })
})
