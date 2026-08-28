import { get, post, put } from './client'

export type AnnotationTaskKind =
  | 'source_identity'
  | 'pairwise_preference'
  | 'notation_review'
  | 'notation_edit'

export interface AnnotationProgress {
  completed: number
  under_review: number
  payable_count: number
  accrued_minor_units: number
  paid_minor_units: number
  currency: string
}

export interface AnnotationCampaign {
  id: string
  title: string
  task_kind: AnnotationTaskKind
  schema_version: number
  status: 'active' | 'closed'
  access_status: string
  assigned_items: number
  completed_items: number
  pay_minor_units: number
  currency: string
  instructions?: { title?: string; body?: string; examples?: string[] }
}

export interface AnnotationAsset {
  url: string
  mime_type?: string
}

export interface AnnotationAssignment {
  id: string
  campaign_id: string
  task_kind: AnnotationTaskKind
  schema_version: number
  instructions: { title?: string; body?: string; examples?: string[] }
  payload: {
    question?: { prompt?: string; labels?: Record<string, string> }
    track?: { title?: string; artist?: string }
    rubric?: Array<{ id: string; label: string }>
    display?: { left_label?: string; right_label?: string }
    editor?: { url?: string; desktop_required?: boolean }
  }
  assets: Record<string, AnnotationAsset>
  draft: Record<string, unknown> | null
  draft_revision: number
  lease_token: string
  lease_expires_at: string
}

export interface AnnotationWorker {
  id: string
  public_code: string
  worker_kind: 'crowd' | 'musician' | 'staff'
  status: string
  locale: string
}

export async function claimAnnotationInvitation(code: string): Promise<AnnotationWorker> {
  const payload = await post<{ worker: AnnotationWorker }>(
    '/v1/annotation/invitations/claim',
    { code },
  )
  return payload.worker
}

export async function getAnnotationMe(): Promise<AnnotationWorker> {
  const payload = await get<{ worker: AnnotationWorker }>('/v1/annotation/me')
  return payload.worker
}

export async function listAnnotationCampaigns(): Promise<{
  campaigns: AnnotationCampaign[]
  progress: AnnotationProgress
}> {
  return get('/v1/annotation/campaigns')
}

export async function getNextAnnotationAssignment(
  campaignId: string,
): Promise<AnnotationAssignment | null> {
  const payload = await post<{ assignment: AnnotationAssignment | null }>(
    `/v1/annotation/campaigns/${encodeURIComponent(campaignId)}/next`,
  )
  return payload.assignment
}

export function saveAnnotationDraft(
  assignment: AnnotationAssignment,
  draft: Record<string, unknown>,
): Promise<{ draft_revision: number }> {
  return put(`/v1/annotation/assignments/${assignment.id}/draft`, {
    lease_token: assignment.lease_token,
    expected_revision: assignment.draft_revision,
    draft,
  })
}

export function heartbeatAnnotationAssignment(
  assignment: AnnotationAssignment,
): Promise<{ lease_expires_at: string }> {
  return post(`/v1/annotation/assignments/${assignment.id}/heartbeat`, {
    lease_token: assignment.lease_token,
  })
}

export function openAnnotationEditor(
  assignment: AnnotationAssignment,
): Promise<{ project_id: string; url: string }> {
  return post(`/v1/annotation/assignments/${assignment.id}/editor`, {
    lease_token: assignment.lease_token,
  })
}

export function submitAnnotationAssignment(
  assignment: AnnotationAssignment,
  answer: Record<string, unknown>,
  responseMs: number,
): Promise<{ submitted: boolean; created: boolean; payable: boolean; payout_status: string }> {
  return post(
    `/v1/annotation/assignments/${assignment.id}/submit`,
    {
      lease_token: assignment.lease_token,
      answer,
      response_ms: responseMs,
    },
    { headers: { 'Idempotency-Key': window.crypto.randomUUID() } },
  )
}

export interface AnnotationArtifactUpload {
  role: 'edited_midi' | 'musicxml'
  filename: string
  sha256: string
  size_bytes: number
  mime_type: string
  lease_token: string
}

export async function uploadAnnotationArtifact(
  assignment: AnnotationAssignment,
  file: File,
): Promise<void> {
  const lower = file.name.toLowerCase()
  const role = lower.endsWith('.mid') || lower.endsWith('.midi')
    ? 'edited_midi'
    : 'musicxml'
  const sha256 = Array.from(new Uint8Array(await window.crypto.subtle.digest('SHA-256', await file.arrayBuffer())))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
  const request: AnnotationArtifactUpload = {
    role,
    filename: file.name,
    sha256,
    size_bytes: file.size,
    mime_type: file.type || 'application/octet-stream',
    lease_token: assignment.lease_token,
  }
  const prepared = await post<{
    storage_key: string
    upload_url: string
    headers: Record<string, string>
  }>(`/v1/annotation/assignments/${assignment.id}/artifacts/upload`, { ...request })
  const response = await fetch(prepared.upload_url, {
    method: 'PUT',
    headers: prepared.headers,
    body: file,
  })
  if (!response.ok) throw new Error('Не удалось загрузить файл результата')
  await post(`/v1/annotation/assignments/${assignment.id}/artifacts/finalize`, {
    ...request,
    storage_key: prepared.storage_key,
  })
}
