import { describe, expect, it } from 'vitest'

import { ApiError } from './api/client'
import { isExpiredAnnotationAssignment } from './annotationLease'

describe('isExpiredAnnotationAssignment', () => {
  it('recognizes an expired assignment lease', () => {
    expect(isExpiredAnnotationAssignment(
      new ApiError('assignment lease expired', 409),
    )).toBe(true)
  })

  it('recognizes a stale draft revision', () => {
    expect(isExpiredAnnotationAssignment(
      new ApiError('draft revision or assignment lease changed', 409),
    )).toBe(true)
  })

  it('does not hide unrelated conflicts or network failures', () => {
    expect(isExpiredAnnotationAssignment(new ApiError('already submitted', 409))).toBe(false)
    expect(isExpiredAnnotationAssignment(new ApiError('network', 0))).toBe(false)
    expect(isExpiredAnnotationAssignment(new Error('assignment lease expired'))).toBe(false)
  })
})
