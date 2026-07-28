/** Base API response envelope. */
export interface ApiResponse<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}

/** Response from GET /api/latest-midi */
export interface MidiResponse {
  ok: boolean;
  filename: string;
  midi_id: string;
  size: number;
  data: string; // base64-encoded MIDI bytes
  error?: string;
}

/** Response from POST /api/upload-midi */
export interface UploadResponse {
  ok: boolean;
  midi_id: string;
  filename: string;
  size: number;
  user_id: string | null;
}

/** Response from GET /api/health */
export interface HealthResponse {
  status: string;
  midi_dir: string;
}

/** Response from POST /api/auth */
export interface AuthResponse {
  ok: boolean;
  user: Record<string, unknown> | null;
  is_admin: boolean;
  error?: string;
}

/** MIDI file listing entry */
export interface MidiFileEntry {
  name: string;
  path: string;
  size: number;
}

/** Response from GET /api/list */
export interface ListResponse {
  ok: boolean;
  files: MidiFileEntry[];
}

export interface AccountSummary {
  account_id: string;
  account_created_at: string;
  username: string | null;
  language: string | null;
  remaining_requests: number | null;
  balance: number | null;
  subscription_until: string | null;
  subscription_period: string | null;
  subscription_price_rub: number | null;
  auto_renew: boolean | null;
  next_charge_at: string | null;
  subscription_status: string | null;
  result_count: number;
  active_job_count: number;
}

export interface AccountResponse {
  account: AccountSummary;
  merge_required?: false;
}

export interface MergeRequiredResponse {
  merge_required: true;
  merge_token: string;
  expires_seconds: number;
}

export type AuthenticationResponse = AccountResponse | MergeRequiredResponse;

export interface AuthCapabilities {
  email_otp: boolean;
  telegram: boolean;
}

export interface AccountIdentity {
  provider: 'telegram' | 'supabase' | string;
  metadata: {
    email?: string;
    username?: string;
  };
  verified_at: string | null;
  last_authenticated_at: string | null;
  created_at: string;
}

export interface AccountProfile {
  account_id: string;
  display_name: string | null;
  locale: 'ru' | 'en';
  created_at: string;
  updated_at: string;
  identities: AccountIdentity[];
}

export interface ProfileResponse {
  profile: AccountProfile;
}

export interface WebSession {
  id: string;
  device_label: string | null;
  auth_provider: string | null;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  revoked_at: string | null;
  is_current: boolean;
}

export interface SessionsResponse {
  sessions: WebSession[];
}

export interface LibraryArtifact {
  id: string;
  role: string;
  size_bytes: number | null;
  mime_type: string;
  download_url: string;
}

export interface LibraryItem {
  id: string;
  project_id: string | null;
  source: 'job' | 'legacy';
  engine: string;
  status: string;
  created_at: string;
  finished_at: string | null;
  sanitized_error: string | null;
  delivery_state: string;
  preparation_state: string;
  title: string;
  artifacts: LibraryArtifact[];
}

export interface LibraryResponse {
  items: LibraryItem[];
}

export interface EditorCapabilities {
  enabled: boolean;
  rollout: 'off' | 'allowlist' | 'all';
  can_edit_owned_results: boolean;
  requires_active_subscription: boolean;
  max_midi_bytes: number;
}

export interface MaterializedProjectResponse {
  created: boolean;
  project_id: string;
  editor_url: string;
}

export interface ProjectUploadResponse {
  project: {
    id: string;
    title: string;
    status: string;
    source_filename: string;
  };
  upload_url: string;
  required_headers: Record<string, string>;
  expires_seconds: number;
}

export interface ProjectSubmitResponse {
  created: boolean;
  project_id: string;
  job_id: string;
  pending_result_id: string;
  queue_position: number;
  worker_available: boolean;
}

export interface ProjectVersion {
  version_id: string;
  version_kind: string;
  version_label: string;
  version_created_at: string;
  job_id: string;
  engine: string;
  status: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  sanitized_error: string | null;
  delivery_state: string | null;
  preparation_state: string | null;
  artifacts: LibraryArtifact[];
}

export interface ProjectDetail {
  id: string;
  title: string;
  status: string;
  source_filename: string | null;
  source_size_bytes: number | null;
  source_mime_type: string | null;
  created_at: string;
  versions: ProjectVersion[];
}

export interface ProjectDetailResponse {
  project: ProjectDetail;
}
