import { describe, expect, it, vi } from 'vitest'

import { ApiError } from './api/client'
import { retryUpload } from './uploadRetry'

describe('upload retry', () => {
  it('retries transient failures with bounded backoff', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new ApiError('offline', 0))
      .mockRejectedValueOnce(new ApiError('expired', 403))
      .mockResolvedValue('project-1')
    const sleep = vi.fn().mockResolvedValue(undefined)

    await expect(retryUpload(operation, { sleep })).resolves.toBe('project-1')
    expect(operation).toHaveBeenCalledTimes(3)
    expect(sleep.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([1000, 2000])
  })

  it('does not retry validation errors', async () => {
    const operation = vi.fn().mockRejectedValue(new ApiError('bad hash', 422))
    const sleep = vi.fn().mockResolvedValue(undefined)

    await expect(retryUpload(operation, { sleep })).rejects.toMatchObject({ status: 422 })
    expect(operation).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })
})
