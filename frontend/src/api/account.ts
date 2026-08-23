import { del, fetchWithNetworkError, get, patch, post } from './client'
import type {
  AccountResponse,
  AuthenticationResponse,
  AuthCapabilities,
  BillingCheckoutResponse,
  BillingPaymentResponse,
  BillingPlansResponse,
  CatalogTrack,
  ProjectSourceImport,
  AccountNotification,
  EditorCapabilities,
  LibraryResponse,
  MaterializedProjectResponse,
  BrowserHandoffResponse,
  BrowserHandoffConsumeResponse,
  ProfileResponse,
  ProjectDetailResponse,
  ProjectSubmitResponse,
  ProjectUploadResponse,
  SessionsResponse,
  PaymentProvider,
  SubscriptionPeriod,
} from './types'

export async function authenticateWithTelegram(initData: string): Promise<AuthenticationResponse> {
  return post<AuthenticationResponse>('/v1/auth/telegram', { init_data: initData })
}

export async function getAuthCapabilities(): Promise<AuthCapabilities> {
  return get<AuthCapabilities>('/v1/auth/capabilities')
}

export async function startEmailAuthentication(email: string): Promise<void> {
  await post<{ accepted: boolean }>('/v1/auth/email/start', { email })
}

export async function verifyEmailAuthentication(
  email: string,
  token: string,
): Promise<AuthenticationResponse> {
  return post<AuthenticationResponse>('/v1/auth/email/verify', { email, token })
}

export async function confirmAccountMerge(mergeToken: string): Promise<AccountResponse> {
  return post<AccountResponse>('/v1/auth/merge/confirm', { merge_token: mergeToken })
}

export async function getCurrentAccount(): Promise<AccountResponse> {
  return get<AccountResponse>('/v1/me')
}

export async function getLibrary(limit = 50): Promise<LibraryResponse> {
  return get<LibraryResponse>('/v1/me/library', { limit })
}

export async function getEditorCapabilities(): Promise<EditorCapabilities> {
  return get<EditorCapabilities>('/v1/me/editor/capabilities')
}

export async function materializeEditorProject(
  itemId: string,
): Promise<MaterializedProjectResponse> {
  return post<MaterializedProjectResponse>(
    `/v1/me/library/${encodeURIComponent(itemId)}/materialize-project`,
  )
}

export async function createBrowserHandoff(
  projectId: string,
): Promise<BrowserHandoffResponse> {
  return post<BrowserHandoffResponse>('/v1/me/browser-handoffs', {
    project_id: projectId,
  })
}

export async function consumeBrowserHandoff(
  token: string,
): Promise<BrowserHandoffConsumeResponse> {
  return post<BrowserHandoffConsumeResponse>('/v1/auth/browser-handoff/consume', {
    token,
  })
}

export async function logout(): Promise<void> {
  await post<void>('/v1/auth/logout')
}

export async function getProfile(): Promise<ProfileResponse> {
  return get<ProfileResponse>('/v1/me/profile')
}

export async function updateProfile(input: {
  display_name: string | null
  locale: 'ru' | 'en'
}): Promise<ProfileResponse> {
  return patch<ProfileResponse>('/v1/me/profile', input)
}

export async function getSessions(): Promise<SessionsResponse> {
  return get<SessionsResponse>('/v1/me/sessions')
}

export async function revokeSession(sessionId: string): Promise<void> {
  await del(`/v1/me/sessions/${encodeURIComponent(sessionId)}`)
}

export async function revokeOtherSessions(): Promise<{ revoked: number }> {
  return post<{ revoked: number }>('/v1/me/sessions/revoke-others')
}

export async function disableAutoRenew(): Promise<void> {
  await post('/v1/me/subscription/auto-renew/disable')
}

export async function getBillingPlans(): Promise<BillingPlansResponse> {
  return get<BillingPlansResponse>('/v1/me/billing/plans')
}

export async function createBillingCheckout(
  period: SubscriptionPeriod,
  idempotencyKey: string,
  provider: PaymentProvider = 'tbank',
): Promise<BillingCheckoutResponse> {
  return post<BillingCheckoutResponse>(
    '/v1/me/billing/checkout',
    { period, recurring_consent: false, provider },
    { headers: { 'Idempotency-Key': idempotencyKey } },
  )
}

export async function getBillingPayment(
  intentId: string,
): Promise<BillingPaymentResponse> {
  return get<BillingPaymentResponse>(
    `/v1/me/billing/payments/${encodeURIComponent(intentId)}`,
  )
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
  const uploadOrigin = new URL(uploadUrl, window.location.origin).origin
  const response = await fetchWithNetworkError(uploadUrl, {
    method: 'PUT',
    headers: requiredHeaders,
    body: file,
    credentials: uploadOrigin === window.location.origin ? 'include' : 'omit',
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

export async function createPianoProcessingRequest(projectId: string): Promise<unknown> {
  return post<unknown>(
    `/v1/me/projects/${encodeURIComponent(projectId)}/processing-requests`,
    {},
    { headers: { 'Idempotency-Key': `web-piano-${projectId}` } },
  )
}

export async function searchCatalog(query: string): Promise<{ tracks: CatalogTrack[] }> {
  return post<{ tracks: CatalogTrack[] }>('/v1/me/catalog/search', { query })
}

export async function createProjectImport(input: {
  source_kind: 'url' | 'catalog_track'
  source_value: string
  title?: string
}): Promise<{ created: boolean; import: ProjectSourceImport }> {
  return post('/v1/me/projects/import', input, {
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  })
}

export async function getProjectImport(importId: string): Promise<{ import: ProjectSourceImport }> {
  return get(`/v1/me/project-imports/${encodeURIComponent(importId)}`)
}

export async function getNotifications(): Promise<{ items: AccountNotification[] }> {
  return get('/v1/me/notifications')
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await patch(`/v1/me/notifications/${encodeURIComponent(notificationId)}`, {})
}

export async function sendProjectFeedback(projectId: string, input: {
  project_version_id?: string
  rating: number
  tags: string[]
  comment: string
}): Promise<void> {
  await post(`/v1/me/projects/${encodeURIComponent(projectId)}/feedback`, input, {
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  })
}

export type VideoAspectRatio = 'vertical' | 'horizontal'
export type LyricsMode = 'automatic' | 'manual'

export async function renderProjectVideo(
  projectId: string,
  versionId: string,
  aspectRatio: VideoAspectRatio,
): Promise<void> {
  const idempotencyKey = aspectRatio === 'vertical'
    ? `web-video-${versionId}`
    : `web-video-horizontal-${versionId}`
  await post(
    `/v1/me/projects/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(versionId)}/video`,
    { aspect_ratio: aspectRatio },
    { headers: { 'Idempotency-Key': idempotencyKey } },
  )
}

export async function renderProjectLyrics(
  projectId: string,
  versionId: string,
  mode: LyricsMode,
  text?: string,
): Promise<void> {
  await post(
    `/v1/me/projects/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(versionId)}/lyrics`,
    { mode, ...(text ? { text } : {}) },
    { headers: { 'Idempotency-Key': `web-lyrics-${versionId}` } },
  )
}

export async function getProject(projectId: string): Promise<ProjectDetailResponse> {
  return get<ProjectDetailResponse>(
    `/v1/me/projects/${encodeURIComponent(projectId)}`,
  )
}
