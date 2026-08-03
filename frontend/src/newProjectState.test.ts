import { describe, expect, it } from 'vitest'

import {
  nextStep,
  previousStep,
  readProjectDraft,
  searchForStep,
  stepFromSearch,
  writeProjectDraft,
} from './newProjectState'

class MemoryStorage implements Storage {
  private data = new Map<string, string>()
  get length() { return this.data.size }
  clear() { this.data.clear() }
  getItem(key: string) { return this.data.get(key) ?? null }
  key(index: number) { return [...this.data.keys()][index] ?? null }
  removeItem(key: string) { this.data.delete(key) }
  setItem(key: string, value: string) { this.data.set(key, value) }
}

describe('new project navigation', () => {
  it('normalizes unsupported steps to source', () => {
    expect(stepFromSearch('?step=wat')).toBe('source')
    expect(stepFromSearch('?step=result')).toBe('result')
    expect(stepFromSearch('?step=review')).toBe('review')
  })

  it('moves forward and backward through the three steps', () => {
    expect(nextStep('source')).toBe('result')
    expect(nextStep('result')).toBe('review')
    expect(previousStep('review')).toBe('result')
    expect(previousStep('result')).toBe('source')
    expect(searchForStep('review')).toBe('?step=review')
  })
})

describe('new project draft', () => {
  it('persists non-file fields for refresh recovery', () => {
    const storage = new MemoryStorage()
    writeProjectDraft(storage, {
      sourceMode: 'link',
      sourceUrl: 'https://example.com/song',
      title: 'Song',
      engine: 'sheetsage',
      selectedTrack: null,
    })
    expect(readProjectDraft(storage)).toEqual({
      sourceMode: 'link',
      sourceUrl: 'https://example.com/song',
      title: 'Song',
      engine: 'sheetsage',
      selectedTrack: null,
    })
  })

  it('ignores corrupted data', () => {
    const storage = new MemoryStorage()
    storage.setItem('audio2midi:new-project', '{oops')
    expect(readProjectDraft(storage)).toBeNull()
  })
})
