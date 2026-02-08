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
