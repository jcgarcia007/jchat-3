/**
 * JChat 3.0 — VoiceRecorderBar (web). Same props and look as VoiceRecorderBar.tsx (devices).
 *
 * Mounted when the user taps the microphone. The microphone is requested ONCE, as the first thing after the tap
 * (services/webMicRecorder.ts), and that stream feeds the MediaRecorder: expo-audio asked twice, and the second
 * request fell outside the tap on iOS Safari. Every failure shows a message (denied / unsupported / other) instead of
 * silently closing the bar. Under 1 s the recording is discarded; it auto-stops at 60 s.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconSend, IconTrash } from '@tabler/icons-react-native';

import { Spinner } from './Spinner';
import { palette } from '../../theme/tokens';
import { VOICE_MAX_SECONDS, VOICE_MIN_SECONDS, clampVoiceSeconds } from '../../services/voiceNotes';
import { webVoiceMimeType } from '../../services/webVoice';
import { WebMicError, startWebMic, type WebMicSession } from '../../services/webMicRecorder';
import { showAlert } from '../../utils/dialog';
import type { VoiceRecorderBarProps, VoiceRecording } from './VoiceRecorderBar.types';

export type { VoiceRecorderBarProps, VoiceRecording };

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function VoiceRecorderBar({ onSend, onCancel, textColor, accentColor, backgroundColor, borderColor }: VoiceRecorderBarProps) {
  const { t } = useTranslation('common');
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const sessionRef = useRef<WebMicSession | null>(null);
  const finishedRef = useRef(false);
  const startedRef = useRef(false);

  const fail = useCallback(
    (err: unknown) => {
      finishedRef.current = true;
      const kind = err instanceof WebMicError ? err.kind : 'failed';
      console.warn('[VoiceRecorderBar.web] could not record:', kind, err);
      if (kind === 'denied') showAlert(t('voice.permissionTitle'), t('voice.permissionMessageWeb'));
      else if (kind === 'unsupported') showAlert(t('voice.errorTitle'), t('voice.webUnsupported'));
      else showAlert(t('voice.errorTitle'), t('voice.errorMessage'));
      onCancel();
    },
    [onCancel, t],
  );

  const finish = useCallback(
    async (send: boolean) => {
      const session = sessionRef.current;
      if (finishedRef.current || !session) return;
      finishedRef.current = true;
      if (!send) {
        session.cancel();
        onCancel();
        return;
      }
      try {
        const result = await session.stop();
        if (!result || result.durationMs / 1000 < VOICE_MIN_SECONDS) {
          if (result) URL.revokeObjectURL(result.uri);
          onCancel();
          return;
        }
        onSend({ uri: result.uri, durationSec: clampVoiceSeconds(result.durationMs / 1000) });
      } catch (err) {
        fail(err);
      }
    },
    [fail, onCancel, onSend],
  );

  // Start as soon as the bar appears: the first statement is the microphone request (inside the tap).
  useEffect(() => {
    if (startedRef.current) return undefined;
    startedRef.current = true;
    const mimeType = webVoiceMimeType();
    if (!mimeType) {
      fail(new WebMicError('unsupported'));
      return undefined;
    }
    startWebMic(mimeType)
      .then((session) => {
        if (finishedRef.current) {
          session.cancel(); // closed while the permission prompt was open
          return;
        }
        sessionRef.current = session;
        setRecording(true);
      })
      .catch(fail);
    return () => {
      // Unmounted mid-recording (screen closed): stop and drop the audio.
      if (!finishedRef.current) {
        finishedRef.current = true;
        sessionRef.current?.cancel();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!recording) return undefined;
    const id = setInterval(() => setSeconds(Math.floor((sessionRef.current?.elapsedMs() ?? 0) / 1000)), 250);
    return () => clearInterval(id);
  }, [recording]);

  useEffect(() => {
    if (recording && seconds >= VOICE_MAX_SECONDS) void finish(true);
  }, [recording, seconds, finish]);

  const clock = formatClock(seconds);

  return (
    <View style={[styles.bar, { backgroundColor, borderColor }]}>
      <Pressable onPress={() => void finish(false)} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel={t('voice.cancel')} hitSlop={8}>
        <IconTrash size={22} color={textColor} />
      </Pressable>

      <View style={styles.center} accessible accessibilityRole="timer" accessibilityLabel={t('voice.recording', { time: clock })}>
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
        {recording ? <IconSend size={20} color={backgroundColor} /> : <Spinner size="small" color={backgroundColor} />}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, gap: 12 },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  clock: { fontSize: 18, fontWeight: '600', fontVariant: ['tabular-nums'] },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
