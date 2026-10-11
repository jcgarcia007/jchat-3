/**
 * JChat 3.0 — Truth or Dare: a published result in the venue chat (message type 'tod_draw').
 *
 * "@name le tocó RETO: <card text in the VIEWER's language>" (the message only carries concept_id; the text comes from the
 * card cache, or one request while it shows "…"), the 🎲 mark for random draws, and the 👏 button with the live count
 * (metadata.applause, updated by Realtime). The author cannot applaud their own result.
 */

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { ChatTheme } from '../../theme/chatThemes';
import { parseDrawMeta, todLocale, useTodCardText } from '../../services/tod';
import { useTodChat } from './TodChatProvider';

interface Props {
  metadata: Record<string, unknown>;
  theme: ChatTheme;
  /** The viewer published this result. */
  isOwn: boolean;
  authorName: string;
}

export function TodDrawResult({ metadata, theme, isOwn, authorName }: Props) {
  const { t, i18n } = useTranslation('tod');
  const game = useTodChat();
  const meta = parseDrawMeta(metadata);
  const locale = todLocale(i18n.language);
  const card = useTodCardText(meta?.concept_id ?? null, locale);
  const [applauded, setApplauded] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  if (!meta) return null;

  const textColor = isOwn ? theme.bubbleOutText : theme.bubbleInText;
  const count = Math.max(meta.applause, applauded ?? 0);
  const cardText =
    card.status === 'ready' ? card.text : card.status === 'missing' ? t('result.unavailable') : t('result.loading');
  const kind = t(`kind.${meta.kind}`);
  const sentence = isOwn
    ? t('result.own', { kind, text: cardText })
    : t('result.other', { name: authorName, kind, text: cardText });

  const onApplaud = async () => {
    if (isOwn || sending) return;
    setSending(true);
    try {
      const total = await game.applaud(meta.draw_id);
      if (total != null) setApplauded(total);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.wrap}>
      {meta.is_random ? <Text style={[styles.random, { color: textColor }]}>🎲 {t('result.randomMark')}</Text> : null}
      <Text style={[styles.sentence, { color: textColor }]}>{sentence}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isOwn ? t('result.ownA11y', { count }) : t('result.applaudA11y', { count })}
        accessibilityState={{ disabled: isOwn || sending }}
        disabled={isOwn || sending}
        onPress={() => void onApplaud()}
        style={[styles.clap, { borderColor: theme.border, opacity: isOwn ? 0.6 : 1 }]}
      >
        <Text style={[styles.clapText, { color: textColor }]}>
          👏 {count}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, alignItems: 'flex-start' },
  random: { fontSize: 12, fontWeight: '800' },
  sentence: { fontSize: 15, lineHeight: 21 },
  clap: { minHeight: 36, minWidth: 64, borderRadius: 18, borderWidth: 1, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  clapText: { fontSize: 15, fontWeight: '700' },
});
