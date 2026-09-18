import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { completeProjectUpload, uploadProjectSource } from './api/account'
import { ApiError } from './api/client'
import { ensureProjectUpload } from './projectUpload'

vi.mock('./api/account', () => ({ completeProjectUpload: vi.fn(), uploadProjectSource: vi.fn() }))
const missing = () => new ApiError('uploaded audio is unavailable', 422)
const input = {
  projectId: 'project-1', uploadUrl: 'https://storage.example/upload', headers: { 'content-type': 'audio/flac' },
  file: new File(['audio'], 'test.flac'), sha256: 'abc', mimeType: 'audio/flac',
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('window', { location: { origin: 'https://app.example' }, setTimeout })
  vi.mocked(uploadProjectSource).mockResolvedValue(undefined)
})
afterEach(() => vi.unstubAllGlobals())

describe('project upload recovery', () => {
  it('does not upload again when confirmation succeeds', async () => {
    vi.mocked(completeProjectUpload).mockResolvedValue({ project_id: 'project-1', source_uploaded_at: 'now' })
    await ensureProjectUpload(input)
    expect(uploadProjectSource).not.toHaveBeenCalled()
  })
  it('confirms successful direct upload', async () => {
    vi.mocked(completeProjectUpload).mockRejectedValueOnce(missing()).mockResolvedValue({ project_id: 'project-1', source_uploaded_at: 'now' })
    await ensureProjectUpload(input)
    expect(uploadProjectSource).toHaveBeenCalledTimes(1)
    expect(completeProjectUpload).toHaveBeenCalledTimes(2)
  })
  it('does not repeat a PUT after its response was lost but object exists', async () => {
    vi.mocked(completeProjectUpload).mockRejectedValueOnce(missing()).mockResolvedValue({ project_id: 'project-1', source_uploaded_at: 'now' })
    vi.mocked(uploadProjectSource).mockRejectedValueOnce(new ApiError('network', 0))
    await ensureProjectUpload(input)
    expect(uploadProjectSource).toHaveBeenCalledTimes(1)
  })
  it('falls back exactly once to the same project when direct transport fails', async () => {
    vi.mocked(completeProjectUpload).mockRejectedValueOnce(missing()).mockRejectedValueOnce(missing()).mockResolvedValue({ project_id: 'project-1', source_uploaded_at: 'now' })
    vi.mocked(uploadProjectSource).mockRejectedValueOnce(new ApiError('network', 0))
    const onFallback = vi.fn()
    await ensureProjectUpload({ ...input, onFallback })
    expect(uploadProjectSource).toHaveBeenNthCalledWith(2, '/api/v1/me/projects/project-1/source', input.file, {
      'content-type': 'audio/flac', 'x-audio-sha256': 'abc',
    })
    expect(uploadProjectSource).toHaveBeenCalledTimes(2)
    expect(onFallback).toHaveBeenCalledOnce()
  })
  it('does not overwrite a mismatched object', async () => {
    vi.mocked(completeProjectUpload).mockRejectedValue(new ApiError('uploaded audio hash mismatch', 422))
    await expect(ensureProjectUpload(input)).rejects.toThrow('hash mismatch')
    expect(uploadProjectSource).not.toHaveBeenCalled()
  })
  it('does not retry a failed proxy upload', async () => {
    vi.mocked(completeProjectUpload).mockRejectedValue(missing())
    vi.mocked(uploadProjectSource).mockRejectedValue(new ApiError('network', 0))
    await expect(ensureProjectUpload({ ...input, uploadUrl: '/api/v1/me/projects/project-1/source' })).rejects.toThrow('network')
    expect(uploadProjectSource).toHaveBeenCalledTimes(1)
  })
  it('does not fallback for validation failure', async () => {
    vi.mocked(completeProjectUpload).mockRejectedValue(missing())
    vi.mocked(uploadProjectSource).mockRejectedValue(new ApiError('size', 413))
    await expect(ensureProjectUpload(input)).rejects.toThrow('size')
    expect(uploadProjectSource).toHaveBeenCalledTimes(1)
  })
})
