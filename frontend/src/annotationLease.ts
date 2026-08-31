import { ApiError } from './api/client'

export function isExpiredAnnotationAssignment(reason: unknown): boolean {
  if (!(reason instanceof ApiError) || reason.status !== 409) return false
  const message = reason.message.toLowerCase()
  return message.includes('assignment lease') || message.includes('draft revision')
}
