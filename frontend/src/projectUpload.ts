import { completeProjectUpload, uploadProjectSource } from './api/account'
import { ApiError } from './api/client'
import { isRetryableUploadError, retryUpload } from './uploadRetry'

// A failed PUT response does not prove that the object was not stored.
// Confirm first; only an explicit missing-object response permits another PUT.
async function isComplete(projectId: string): Promise<boolean> {
  try {
    await retryUpload(() => completeProjectUpload(projectId))
    return true
  } catch (error) {
    if (error instanceof ApiError && error.status === 422
      && error.message === 'uploaded audio is unavailable') return false
    throw error
  }
}

export async function ensureProjectUpload(input: {
  projectId: string
  uploadUrl: string
  headers: Record<string, string>
  file: File
  sha256: string
  mimeType: string
  onFallback?: () => void
}): Promise<void> {
  if (await isComplete(input.projectId)) return
  try {
    await uploadProjectSource(input.uploadUrl, input.file, input.headers)
  } catch (error) {
    if (!isRetryableUploadError(error)) throw error
    if (await isComplete(input.projectId)) return
    const isDirect = new URL(input.uploadUrl, window.location.origin).origin !== window.location.origin
    if (!isDirect) throw error
    input.onFallback?.()
    // Exactly one API fallback, still owned by the original project. Never
    // replay the whole transaction after a failed confirmation or submission.
    await uploadProjectSource(`/api/v1/me/projects/${encodeURIComponent(input.projectId)}/source`, input.file, {
      'content-type': input.mimeType,
      'x-audio-sha256': input.sha256,
    })
  }
  await retryUpload(() => completeProjectUpload(input.projectId))
}
