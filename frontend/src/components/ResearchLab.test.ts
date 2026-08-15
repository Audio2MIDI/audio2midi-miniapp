import { describe, expect, it } from 'vitest'

import { researchExperimentCardCount, researchExperimentKind } from '../api/research'
import { isSourceIdentityQuestion, withWrongSongTag } from './researchVote'

describe('withWrongSongTag', () => {
  it('adds the persisted wrong-song reason exactly once', () => {
    expect(withWrongSongTag(['looping'])).toEqual(['looping', 'mismatched_song'])
    expect(withWrongSongTag(['mismatched_song'])).toEqual(['mismatched_song'])
  })
})

describe('isSourceIdentityQuestion', () => {
  it('enables the dedicated source-audit layout only for source identity cards', () => {
    expect(isSourceIdentityQuestion('source_identity')).toBe(true)
    expect(isSourceIdentityQuestion('overall_preference')).toBe(false)
    expect(isSourceIdentityQuestion()).toBe(false)
  })
})

describe('researchExperimentCardCount', () => {
  it('supports both the current field and the older production metadata shape', () => {
    const base = {
      id: 'audit',
      title: 'Audit',
      status: 'active' as const,
      track_count: 30,
      sample_count: 60,
      condition_count: 2,
    }
    expect(researchExperimentCardCount({ ...base, card_count: 30 })).toBe(30)
    expect(researchExperimentCardCount({
      ...base,
      metadata: JSON.stringify({ kind: 'source_identity_audit', card_count: 30 }),
    })).toBe(30)
    expect(researchExperimentCardCount({ ...base, metadata: '{broken' })).toBe(0)
  })
})

describe('researchExperimentKind', () => {
  it('reads the audit kind from the older production metadata shape', () => {
    const experiment = {
      id: 'audit',
      title: 'Audit',
      status: 'active' as const,
      track_count: 30,
      sample_count: 60,
      condition_count: 2,
      metadata: JSON.stringify({ kind: 'source_identity_audit', card_count: 30 }),
    }
    expect(researchExperimentKind(experiment)).toBe('source_identity_audit')
  })
})
