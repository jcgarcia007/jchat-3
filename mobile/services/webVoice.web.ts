/**
 * JChat 3.0 — voice recording support (web).
 *
 * The voice-notes / dm-media buckets only accept audio/m4a, audio/mp4, audio/x-m4a, audio/aac and
 * audio/mpeg, and iOS cannot play webm/opus. So the web only records when the browser's MediaRecorder
 * can produce MP4/AAC (Safari, recent Chrome); otherwise the record button is hidden.
 */

const MP4_AAC = 'audio/mp4;codecs=mp4a.40.2';
const MP4 = 'audio/mp4';

/** Mime type to ask MediaRecorder for, or null if the browser cannot record MP4. */
export function webVoiceMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return null;
  if (MediaRecorder.isTypeSupported(MP4_AAC)) return MP4_AAC;
  if (MediaRecorder.isTypeSupported(MP4)) return MP4;
  return null;
}

export function canRecordVoice(): boolean {
  return webVoiceMimeType() !== null;
}
