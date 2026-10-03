import { describe, expect, it } from 'vitest'
import { ApiError } from './api/client'
import { projectLoadRetryDelay } from './projectPolling'

describe('project GET recovery', () => {
  it.each([0, 408, 429, 500, 502, 503, 504])('recovers temporary status %s', (status) => {
    expect(projectLoadRetryDelay(new ApiError('temporary', status), 1)).toBe(4_000)
    expect(projectLoadRetryDelay(new ApiError('temporary', status), 2)).toBe(8_000)
    expect(projectLoadRetryDelay(new ApiError('temporary', status), 100)).toBe(30_000)
  })
  it.each([400, 401, 403, 404, 409, 422])('stops on permanent status %s', (status) => {
    expect(projectLoadRetryDelay(new ApiError('permanent', status), 1)).toBeNull()
  })
  it('does not hide programming errors behind endless retries', () => {
    expect(projectLoadRetryDelay(new TypeError('bad response'), 1)).toBeNull()
  })
})
