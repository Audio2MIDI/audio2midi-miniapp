/**
 * Compatibility reader for existing ?midi= links. New projects use account.ts.
 */

import { get } from './client';
import type { MidiResponse } from './types';

/**
 * Fetch a MIDI file by its ID.
 * Returns base64-encoded MIDI data + metadata.
 */
export async function fetchLatestMidi(midiId: string): Promise<MidiResponse> {
  return get<MidiResponse>('/latest-midi', { midi_id: midiId });
}
