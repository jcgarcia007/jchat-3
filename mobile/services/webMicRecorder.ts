/**
 * JChat 3.0 — web voice recorder: ONE getUserMedia, one MediaRecorder (used only by VoiceRecorderBar.web.tsx).
 *
 * expo-audio on web asks for the microphone twice (requestRecordingPermissionsAsync opens and stops a stream, then
 * prepareToRecordAsync opens another one after several awaits). iOS Safari can re-prompt or refuse the second call
 * because it is no longer inside the tap. Here the stream is requested once, as the first thing after the tap, and
 * that same stream feeds the MediaRecorder.
 *
 * Failures are typed so the bar can show a message: 'unsupported' (no mediaDevices / MediaRecorder),
 * 'denied' (NotAllowedError, SecurityError), 'failed' (anything else, e.g. no microphone).
 */

export type WebMicErrorKind = 'unsupported' | 'denied' | 'failed';

export class WebMicError extends Error {
  kind: WebMicErrorKind;
  constructor(kind: WebMicErrorKind, cause?: unknown) {
    super(`web_mic_${kind}`);
    this.kind = kind;
    this.cause = cause;
  }
}

export interface WebMicEnv {
  getUserMedia?: (constraints: { audio: boolean }) => Promise<MediaStream>;
  MediaRecorder?: typeof MediaRecorder;
  createObjectURL?: (blob: Blob) => string;
  now?: () => number;
}

export interface WebMicSession {
  /** Milliseconds recorded so far. */
  elapsedMs(): number;
  /** Stops and returns the recording (blob: URI), or null if nothing was captured. */
  stop(): Promise<{ uri: string; durationMs: number } | null>;
  /** Stops and drops the audio. */
  cancel(): void;
}

function browserEnv(): WebMicEnv {
  const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
  return {
    getUserMedia: md?.getUserMedia ? (c) => md.getUserMedia(c) : undefined,
    MediaRecorder: typeof MediaRecorder !== 'undefined' ? MediaRecorder : undefined,
    createObjectURL: (b) => URL.createObjectURL(b),
    now: () => Date.now(),
  };
}

export async function startWebMic(mimeType: string, overrides: WebMicEnv = {}): Promise<WebMicSession> {
  const env = { ...browserEnv(), ...overrides };
  const { getUserMedia, MediaRecorder: Recorder } = env;
  const createObjectURL = env.createObjectURL ?? ((b: Blob) => URL.createObjectURL(b));
  const now = env.now ?? (() => Date.now());
  if (!getUserMedia || !Recorder) throw new WebMicError('unsupported');

  // The one and only microphone request: the first call after the tap, nothing awaited before it.
  let stream: MediaStream;
  try {
    stream = await getUserMedia({ audio: true });
  } catch (err) {
    const name = (err as { name?: string } | null)?.name;
    throw new WebMicError(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'failed', err);
  }

  const stopTracks = () => stream.getTracks().forEach((track) => track.stop());
  const chunks: Blob[] = [];
  let recorder: MediaRecorder;
  try {
    recorder = new Recorder(stream, { mimeType, audioBitsPerSecond: 64000 });
    recorder.addEventListener('dataavailable', (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    });
    recorder.start();
  } catch (err) {
    stopTracks();
    throw new WebMicError('failed', err);
  }

  const startedAt = now();
  let finished = false;

  const halt = (): Promise<void> =>
    new Promise((resolve) => {
      if (recorder.state === 'inactive') {
        resolve();
        return;
      }
      recorder.addEventListener('stop', () => resolve(), { once: true });
      try {
        recorder.stop();
      } catch {
        resolve();
      }
    });

  return {
    elapsedMs: () => now() - startedAt,
    async stop() {
      if (finished) return null;
      finished = true;
      const durationMs = now() - startedAt;
      await halt();
      stopTracks();
      if (chunks.length === 0) return null;
      return { uri: createObjectURL(new Blob(chunks, { type: mimeType })), durationMs };
    },
    cancel() {
      if (finished) return;
      finished = true;
      void halt().then(stopTracks);
    },
  };
}
