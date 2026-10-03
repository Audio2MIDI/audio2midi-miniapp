import { ApiError } from './api/client'

/** Retry only temporary GET failures; never loop on auth or missing projects. */
export function projectLoadRetryDelay(error: unknown, failures: number): number | null {
  if (!(error instanceof ApiError)) return null
  if (![0, 408, 429].includes(error.status) && error.status < 500) return null
  return Math.min(30_000, 4_000 * 2 ** Math.min(Math.max(failures - 1, 0), 3))
}
