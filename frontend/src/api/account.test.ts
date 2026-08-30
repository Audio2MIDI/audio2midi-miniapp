import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  completeProjectUpload,
  createProjectUpload,
  renderProjectLyrics,
  renderProjectVideo,
  sendProjectFeedbackOutcome,
  updateProjectFeedbackComment,
  uploadProjectSource,
} from './account'

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

describe('project lyrics API', () => {
  it('sends only the selected typed mode and manual text', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://app.audio2midi.ru' } })
    const fetch = vi.fn().mockResolvedValue(new Response('{}', {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetch)

    await renderProjectLyrics('project id', 'version id', 'manual', 'Мой текст песни')

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/v1/me/projects/project%20id/versions/version%20id/lyrics')
    expect(JSON.parse(String(init.body))).toEqual({ mode: 'manual', text: 'Мой текст песни' })
    expect(new Headers(init.headers).get('Idempotency-Key')).toBe('web-lyrics-version id')
  })
})

describe('result feedback API', () => {
  const feedback = {
    id: 'feedback id',
    project_id: 'project id',
    project_version_id: 'version id',
    job_id: 'job id',
    channel: 'web',
    prompt_kind: 'result_quality',
    outcome: 'needs_edits',
    trigger: 'download',
    prompt_version: 'result-quality-v2',
    comment: null,
    created_at: '2026-08-30T10:00:00Z',
    updated_at: '2026-08-30T10:00:00Z',
    commented_at: null,
  }

  it('saves an outcome on the exact project version', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://app.audio2midi.ru' } })
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ created: true, feedback }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetch)

    await sendProjectFeedbackOutcome('project id', 'version id', {
      outcome: 'needs_edits',
      trigger: 'download',
      prompt_version: 'result-quality-v2',
    })

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/v1/me/projects/project%20id/versions/version%20id/feedback/outcome')
    expect(JSON.parse(String(init.body))).toEqual({
      outcome: 'needs_edits',
      trigger: 'download',
      prompt_version: 'result-quality-v2',
    })
  })

  it('patches a comment without resending the outcome', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://app.audio2midi.ru' } })
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      feedback: { ...feedback, comment: 'Сбился ритм' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetch)

    await updateProjectFeedbackComment('feedback id', 'Сбился ритм')

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/v1/me/feedback/feedback%20id/comment')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(String(init.body))).toEqual({ comment: 'Сбился ритм' })
  })
})

describe('project upload API', () => {
  it('uses one idempotency key for project creation', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://app.audio2midi.ru' } })
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      project: { id: 'project-1', title: 'Song', status: 'uploading', source_filename: 'song.mp3' },
      upload_url: 'https://storage.example/upload',
      required_headers: {},
      expires_seconds: 900,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetch)

    await createProjectUpload({
      title: 'Song', filename: 'song.mp3', sha256: 'a'.repeat(64),
      size_bytes: 10, mime_type: 'audio/mpeg',
    }, 'upload-key')

    const [, init] = fetch.mock.calls[0] as [string, RequestInit]
    expect(new Headers(init.headers).get('Idempotency-Key')).toBe('upload-key')
  })

  it('omits cookies for S3 and confirms the owned project through the API', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://app.audio2midi.ru' } })
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        project_id: 'project 1', source_uploaded_at: '2026-08-30T00:00:00Z',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetch)

    await uploadProjectSource(
      'https://storage.example/upload',
      new File(['audio'], 'song.mp3', { type: 'audio/mpeg' }),
      { 'content-type': 'audio/mpeg' },
    )
    await completeProjectUpload('project 1')

    expect((fetch.mock.calls[0][1] as RequestInit).credentials).toBe('omit')
    expect(fetch.mock.calls[1][0]).toBe('/api/v1/me/projects/project%201/upload-complete')
  })
})
