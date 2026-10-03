/**
 * JChat 3.0 — VoiceBubble: play/pause, progress bar and duration for a voice note.
 *
 * The signed URL (1 h) is requested when the user taps play and cached in memory
 * (services/voiceNotes.getVoiceSignedUrl). Only one audio plays at a time in the whole app
 * (claimPlayback). Colors come from the parent (chat theme / DM palette), never hardcoded.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useTranslation } from 'react-i18next';
import { IconPlayerPause, IconPlayerPlay } from '@tabler/icons-react-native';

import {
  claimPlayback,
  getVoiceSignedUrl,
  releasePlayback,
  type VoiceSource,
} from '../../services/voiceNotes';

export interface VoiceBubbleProps {
  /** Unique id of the message (one audio at a time is tracked by it). */
  id: string;
  /** Where the audio lives; null when the stored path failed validation. */
  source: VoiceSource | null;
  /** Duration from the database (messages.metadata.duration_s / dm_messages.voice_duration_s). */
  durationSec?: number | null;
  textColor: string;
}

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

export function VoiceBubble({ id, source, durationSec, textColor }: VoiceBubbleProps) {
  const { t } = useTranslation('common');
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const loadedPathRef = useRef<string | null>(null);

  const total = status.duration > 0 ? status.duration : (durationSec ?? 0);
  const progress = total > 0 ? Math.min(1, status.currentTime / total) : 0;
  const shownSeconds = status.playing ? status.currentTime : total;

  // Back to the start when the clip ends.
  useEffect(() => {
    if (status.didJustFinish) {
      releasePlayback(id);
      void player.seekTo(0);
    }
  }, [status.didJustFinish, player, id]);

  useEffect(() => () => releasePlayback(id), [id]);

  const toggle = useCallback(async () => {
    if (!source || loading) return;
    if (status.playing) {
      player.pause();
      releasePlayback(id);
      return;
    }
    setLoading(true);
    setFailed(false);
    try {
      if (loadedPathRef.current !== source.path) {
        const url = await getVoiceSignedUrl(source);
        player.replace({ uri: url });
        loadedPathRef.current = source.path;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      claimPlayback(id, () => player.pause());
      player.play();
    } catch (err) {
      console.warn('[VoiceBubble] playback failed:', err);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [source, loading, status.playing, player, id]);

  if (!source || failed) {
    return (
      <Text style={[styles.unavailable, { color: textColor }]}>{t('voice.unavailable')}</Text>
    );
  }

  return (
    <View
      style={styles.row}
      accessible={false}
    >
      <Pressable
        onPress={() => void toggle()}
        style={[styles.playBtn, { borderColor: textColor }]}
        accessibilityRole="button"
        accessibilityLabel={status.playing ? t('voice.pause') : t('voice.play')}
        hitSlop={6}
      >
        {loading ? (
          <ActivityIndicator size="small" color={textColor} />
        ) : status.playing ? (
          <IconPlayerPause size={18} color={textColor} />
        ) : (
          <IconPlayerPlay size={18} color={textColor} />
        )}
      </Pressable>

      <View
        style={styles.track}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={t('voice.duration', { seconds: Math.round(total) })}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
      >
        <View style={[styles.trackBg, { backgroundColor: textColor }]} />
        <View style={[styles.trackFill, { backgroundColor: textColor, width: `${progress * 100}%` }]} />
      </View>

      <Text style={[styles.time, { color: textColor }]}>{formatClock(shownSeconds)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 190 },
  playBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: { flex: 1, height: 14, justifyContent: 'center' },
  trackBg: { position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 2, opacity: 0.25 },
  trackFill: { height: 4, borderRadius: 2 },
  time: { fontSize: 12, fontVariant: ['tabular-nums'], minWidth: 34, textAlign: 'right' },
  unavailable: { fontSize: 13, fontStyle: 'italic' },
});
