import { expect, it } from 'vitest'
import type { ProjectDetail } from './api/types'
import { projectDisplayStatus } from './projectDisplayStatus'

it('shows a completed MIDI import without a preparation worker as ready', () => {
  const project = { status: 'processing', versions: [{ version_kind: 'imported', status: 'succeeded', preparation_state: null, artifacts: [{ role: 'midi' }] }] } as ProjectDetail
  expect(projectDisplayStatus(project)).toBe('ready')
  project.versions[0].version_kind = 'generated'
  expect(projectDisplayStatus(project)).toBe('processing')
})

it('does not call an import ready when no MIDI is available', () => {
  const project = { status: 'processing', versions: [{ version_kind: 'imported', status: 'succeeded', preparation_state: null, artifacts: [] }] } as unknown as ProjectDetail
  expect(projectDisplayStatus(project)).toBe('processing')
})
