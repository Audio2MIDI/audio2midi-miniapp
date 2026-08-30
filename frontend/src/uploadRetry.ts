import { ApiError } from './api/client'

const RETRY_DELAYS_MS = [1000, 2000, 4000] as const

export function isRetryableUploadError(error: unknown): boolean {
  return error instanceof ApiError
    && (error.status === 0
      || error.status === 403
      || error.status === 408
      || error.status === 429
      || error.status >= 500)
}

export async function retryUpload<T>(
  operation: (attempt: number) => Promise<T>,
  options: {
    onRetry?: (attempt: number) => void
    sleep?: (milliseconds: number) => Promise<void>
  } = {},
): Promise<T> {
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds)
  }))
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation(attempt)
    } catch (error) {
      const delay = RETRY_DELAYS_MS[attempt]
      if (delay === undefined || !isRetryableUploadError(error)) throw error
      options.onRetry?.(attempt + 1)
      await sleep(delay)
    }
  }
}
