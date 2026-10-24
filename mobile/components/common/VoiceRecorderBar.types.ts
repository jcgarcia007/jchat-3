/** JChat 3.0 — props and result shared by the device and web voice recorder bars (VoiceRecorderBar / .web). */

export interface VoiceRecording {
  uri: string;
  durationSec: number;
}

export interface VoiceRecorderBarProps {
  /** Called with the finished recording when the user taps Send (or at 60 s). */
  onSend: (recording: VoiceRecording) => void;
  /** Called when the recording is cancelled, too short, denied or failed. The bar should unmount. */
  onCancel: () => void;
  textColor: string;
  accentColor: string;
  backgroundColor: string;
  borderColor: string;
}
