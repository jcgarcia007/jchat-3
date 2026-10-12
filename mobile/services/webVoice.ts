/**
 * JChat 3.0 — voice recording support (iOS / Android).
 *
 * Devices always record m4a/AAC through expo-audio's native options, so recording is always available
 * and there is no web mime type. The web variant (webVoice.web.ts) checks what the browser's
 * MediaRecorder can produce.
 */

/** Mime type to ask MediaRecorder for on web; null on devices. */
export function webVoiceMimeType(): string | null {
  return null;
}

/** True when this platform can record a voice note that the app (and iOS) can play back. */
export function canRecordVoice(): boolean {
  return true;
}
