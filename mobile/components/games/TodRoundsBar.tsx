/**
 * JChat 3.0 — Truth or Dare: strip of active rounds, right under the room tabs.
 *
 * "🎲 N rondas activas" — only in the room that has active rounds (tod_rounds status 'active' and expires_at in the future for
 * the room on screen); it disappears at N = 0. Tapping it opens the list (category, who, how many played, time left); tapping a
 * round scrolls the chat to its card. The list is re-read when the room changes, when a round message arrives or changes
 * (`refreshKey`), and every minute; the countdowns tick locally.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { ChatTheme } from '../../theme/chatThemes';
import { supabase } from '../../services/supabase';
import { fetchActiveTodRounds, formatClock, useTodNow } from '../../services/tod';
import type { TodActiveRound } from '../../services/tod';
import { TOD_CATEGORY_META } from './todCategories';

interface Props {
  roomId: string | null;
  /** The game is active at this venue. */
  enabled: boolean;
  /** Changes whenever a round message arrives or is updated in the chat. */
  refreshKey: string;
  theme: ChatTheme;
  /** Name already known by the chat for a user id (cache), if any. */
  resolveName?: (userId: string) => string | undefined;
  onGoToMessage: (messageId: string) => void;
}

export function TodRoundsBar({ roomId, enabled, refreshKey, theme, resolveName, onGoToMessage }: Props) {
  const { t } = useTranslation('tod');
  const [rounds, setRounds] = useState<TodActiveRound[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const now = useTodNow(rounds.length > 0);

  const load = useCallback(async () => {
    if (!enabled || !roomId) {
      setRounds([]);
      return;
    }
    const list = await fetchActiveTodRounds(roomId);
    setRounds(list);
    const missing = [...new Set(list.map((r) => r.creator_id))].filter((id) => !resolveName?.(id));
    if (missing.length === 0) return;
    const { data } = await supabase.from('public_profiles').select('id, username, display_name').in('id', missing);
    const found: Record<string, string> = {};
    for (const p of data ?? []) {
      const name = (p.display_name as string | null) ?? (p.username as string | null);
      if (p.id && name) found[p.id as string] = name;
    }
    setNames((prev) => ({ ...prev, ...found }));
  }, [enabled, roomId, resolveName]);

  useEffect(() => {
    setOpen(false);
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    if (!enabled) return undefined;
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, [enabled, load]);

  const active = rounds.filter((r) => Date.parse(r.expires_at) > now);
  if (!enabled || active.length === 0) return null;

  return (
    <View style={[styles.wrap, { backgroundColor: theme.topBg, borderBottomColor: theme.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={open ? t('bar.a11yCollapse') : t('bar.a11yExpand')}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={styles.strip}
      >
        <Text style={[styles.stripText, { color: theme.accent }]}>{t('bar.title', { count: active.length })}</Text>
      </Pressable>
      {open ? (
        <View style={styles.list}>
          {active.map((round) => {
            const cat = TOD_CATEGORY_META[round.category];
            const name = resolveName?.(round.creator_id) ?? names[round.creator_id] ?? '';
            const remaining = Math.max(0, Math.ceil((Date.parse(round.expires_at) - now) / 1000));
            return (
              <Pressable
                key={round.id}
                accessibilityRole="button"
                onPress={() => {
                  setOpen(false);
                  if (round.message_id) onGoToMessage(round.message_id);
                }}
                style={styles.item}
              >
                <View style={[styles.badge, { backgroundColor: cat.color }]}>
                  <cat.Icon size={16} color={cat.onColor} />
                </View>
                <View style={styles.itemText}>
                  <Text style={[styles.itemTitle, { color: theme.bubbleInText }]} numberOfLines={1}>
                    {t(`category.${round.category}.name`)}
                  </Text>
                  <Text style={[styles.itemMeta, { color: theme.tabInactive }]} numberOfLines={1}>
                    {t('bar.item', {
                      name,
                      played: t('played', { count: round.plays_count }),
                      time: formatClock(remaining),
                    })}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderBottomWidth: StyleSheet.hairlineWidth },
  strip: { minHeight: 32, paddingHorizontal: 14, justifyContent: 'center' },
  stripText: { fontSize: 13, fontWeight: '800' },
  list: { paddingHorizontal: 12, paddingBottom: 8, gap: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 4 },
  badge: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  itemText: { flex: 1 },
  itemTitle: { fontSize: 14, fontWeight: '700' },
  itemMeta: { fontSize: 12 },
});
