import { describe, expect, it } from 'vitest'

import { reelDownloadUrl, reelFileError, reelMimeForFile } from './reelSource'

describe('Reels owner source helpers', () => {
  it('accepts known audio files and infers their mime type', () => {
    const file = new File(['audio'], 'demo.mp3')
    expect(reelFileError(file)).toBeNull()
    expect(reelMimeForFile(file)).toBe('audio/mpeg')
  })

  it('rejects unsupported files before upload', () => {
    const file = new File(['text'], 'notes.txt', { type: 'text/plain' })
    expect(reelFileError(file)).toContain('Поддерживаются')
  })

  it('adds an explicit attachment flag to a private preview route', () => {
    expect(reelDownloadUrl('/api/v1/internal/reels/renders/one/video'))
      .toBe('/api/v1/internal/reels/renders/one/video?download=true')
  })
})
