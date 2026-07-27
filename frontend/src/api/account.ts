import { get, post } from './client'
import type {
  AccountResponse,
  LibraryResponse,
  ProjectDetailResponse,
  ProjectSubmitResponse,
  ProjectUploadResponse,
} from './types'

export async function authenticateWithTelegram(initData: string): Promise<AccountResponse> {
  return post<AccountResponse>('/v1/auth/telegram', { init_data: initData })
}

export async function getCurrentAccount(): Promise<AccountResponse> {
  return get<AccountResponse>('/v1/me')
}

export async function getLibrary(limit = 50): Promise<LibraryResponse> {
  return get<LibraryResponse>('/v1/me/library', { limit })
}

export async function logout(): Promise<void> {
  await post<void>('/v1/auth/logout')
}

export async function createProjectUpload(input: {
  title: string
  filename: string
  sha256: string
  size_bytes: number
  mime_type: string
}): Promise<ProjectUploadResponse> {
  return post<ProjectUploadResponse>('/v1/me/projects/presign', input)
}

export async function uploadProjectSource(
  uploadUrl: string,
  file: File,
  requiredHeaders: Record<string, string>,
): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: requiredHeaders,
    body: file,
    credentials: 'include',
  })
  if (!response.ok) {
    throw new Error(`Не удалось загрузить файл: HTTP ${response.status}`)
  }
}

export async function submitProject(
  projectId: string,
  engine: string,
): Promise<ProjectSubmitResponse> {
  return post<ProjectSubmitResponse>(
    `/v1/me/projects/${encodeURIComponent(projectId)}/submit`,
    { engine },
  )
}

export async function getProject(projectId: string): Promise<ProjectDetailResponse> {
  return get<ProjectDetailResponse>(
    `/v1/me/projects/${encodeURIComponent(projectId)}`,
  )
}
