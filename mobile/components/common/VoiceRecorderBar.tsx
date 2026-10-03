/**
 * JChat 3.0 — VoiceRecorderBar (shared by room chat and DMs).
 *
 * Mounted when the user taps the microphone; it starts recording right away:
 *   permission (requestRecordingPermissionsAsync; denied → translated alert with "Open Settings")
 *   → setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true }) → record (m4a/AAC 64 kbps mono).
 * Shows a red indicator + timer with Cancel and Send. Auto-stops at 60 s. Under 1 s the recording
 * is discarded without sending. Audio mode is restored to { allowsRecording: false } at the end.
 * The parent receives the local file uri + duration; it must upload it (never store the file://).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useTranslation } from 'react-i18next';
import { IconSend, IconTrash } from '@tabler/icons-react-native';

import { palette } from '../../theme/tokens';
import {
  VOICE_MAX_SECONDS,
  VOICE_MIN_SECONDS,
  VOICE_RECORDING_OPTIONS,
  clampVoiceSeconds,
  discardLocalRecording,
} from '../../services/voiceNotes';

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

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function VoiceRecorderBar({
  onSend,
  onCancel,
  textColor,
  accentColor,
  backgroundColor,
  borderColor,
}: VoiceRecorderBarProps) {
  const { t } = useTranslation('common');
  const recorder = useAudioRecorder(VOICE_RECORDING_OPTIONS);
  const state = useAudioRecorderState(recorder, 250);
  const [recording, setRecording] = useState(false);
  const finishedRef = useRef(false);
  const startedRef = useRef(false);
  const mountedRef = useRef(true);

  const seconds = Math.floor(state.durationMillis / 1000);

  const restoreAudioMode = useCallback(
    () => setAudioModeAsync({ allowsRecording: false }).catch(() => undefined),
    [],
  );

  // Stop the recorder, restore the audio mode, then hand the file over (or discard it).
  const finish = useCallback(
    async (send: boolean) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      const elapsed = recorder.currentTime;
      try {
        await recorder.stop();
      } catch {
        // already stopped
      }
      await restoreAudioMode();
      const uri = recorder.uri;
      if (!send || !uri || elapsed < VOICE_MIN_SECONDS) {
        await discardLocalRecording(uri);
        onCancel();
        return;
      }
      onSend({ uri, durationSec: clampVoiceSeconds(elapsed) });
    },
    [onCancel, onSend, recorder, restoreAudioMode],
  );

  // Ask permission and start recording as soon as the bar appears.
  useEffect(() => {
    if (startedRef.current) return undefined;
    startedRef.current = true;
    mountedRef.current = true;
    (async () => {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        finishedRef.current = true;
        Alert.alert(t('voice.permissionTitle'), t('voice.permissionMessage'), [
          { text: t('actions.cancel') , style: 'cancel' },
          { text: t('voice.openSettings'), onPress: () => void Linking.openSettings() },
        ]);
        onCancel();
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      if (!mountedRef.current || finishedRef.current) return;
      recorder.record();
      setRecording(true);
    })().catch((err) => {
      console.warn('[VoiceRecorderBar] could not start recording:', err);
      finishedRef.current = true;
      void restoreAudioMode();
      onCancel();
    });
    return () => {
      mountedRef.current = false;
      // Unmounted mid-recording (screen closed): stop and drop the file.
      if (!finishedRef.current) {
        finishedRef.current = true;
        const uri = recorder.uri;
        recorder.stop().catch(() => undefined).finally(() => {
          void restoreAudioMode();
          void discardLocalRecording(uri ?? recorder.uri);
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hard stop at the maximum length: send what was recorded.
  useEffect(() => {
    if (recording && seconds >= VOICE_MAX_SECONDS) void finish(true);
  }, [recording, seconds, finish]);

  const clock = formatClock(seconds);

  return (
    <View style={[styles.bar, { backgroundColor, borderColor }]}>
      <Pressable
        onPress={() => void finish(false)}
        style={styles.iconBtn}
        accessibilityRole="button"
        accessibilityLabel={t('voice.cancel')}
        hitSlop={8}
      >
        <IconTrash size={22} color={textColor} />
      </Pressable>

      <View
        style={styles.center}
        accessible
        accessibilityRole="timer"
        accessibilityLabel={t('voice.recording', { time: clock })}
      >
        <View style={[styles.dot, { backgroundColor: palette.danger }]} />
        <Text style={[styles.clock, { color: textColor }]}>{clock}</Text>
      </View>

      <Pressable
        onPress={() => void finish(true)}
        disabled={!recording}
        style={[styles.sendBtn, { backgroundColor: accentColor, opacity: recording ? 1 : 0.5 }]}
        accessibilityRole="button"
        accessibilityLabel={t('voice.send')}
        accessibilityState={{ disabled: !recording }}
      >
        {recording ? <IconSend size={20} color={backgroundColor} /> : <ActivityIndicator size="small" color={backgroundColor} />}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  clock: { fontSize: 18, fontWeight: '600', fontVariant: ['tabular-nums'] },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
