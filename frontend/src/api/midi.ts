/**
 * Typed API functions for MIDI operations.
 */

import { get, post } from './client';
import type { MidiResponse, UploadResponse, HealthResponse, ListResponse } from './types';

/**
 * Fetch a MIDI file by its ID.
 * Returns base64-encoded MIDI data + metadata.
 */
export async function fetchLatestMidi(midiId: string): Promise<MidiResponse> {
  return get<MidiResponse>('/latest-midi', { midi_id: midiId });
}

/**
 * Upload a MIDI file to the backend.
 * Returns the assigned midi_id and metadata.
 */
export async function uploadMidi(file: File, userId?: string): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('file', file);
  if (userId) {
    formData.append('user_id', userId);
  }
  return post<UploadResponse>('/upload-midi', formData);
}

/** Health check. */
export async function checkHealth(): Promise<HealthResponse> {
  return get<HealthResponse>('/health');
}

/** List MIDI files (admin only). */
export async function listMidiFiles(): Promise<ListResponse> {
  return get<ListResponse>('/list');
}
