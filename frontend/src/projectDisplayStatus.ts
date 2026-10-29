import type { ProjectDetail } from './api/types'

export function projectDisplayStatus(project: ProjectDetail): ProjectDetail['status'] {
  const version = project.versions[0]
  if (version?.version_kind === 'imported' && version.status === 'succeeded'
    && version.preparation_state == null
    && version.artifacts.some((item) => item.role === 'midi')) return 'ready'
  return project.status
}
