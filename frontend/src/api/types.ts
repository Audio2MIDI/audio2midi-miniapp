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
  source_filename: string;
  source_size_bytes: number;
  source_mime_type: string;
  created_at: string;
  versions: ProjectVersion[];
}

export interface ProjectDetailResponse {
  project: ProjectDetail;
}
