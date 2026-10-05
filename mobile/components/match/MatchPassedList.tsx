/**
 * JChat 3.0 — MatchPassedList ("Repasar a los que pasé")
 *
 * The people I passed on who are still at the venue. Each one: "Like" (a normal like — never a Super
 * Like — that can produce a match) or "Keep passing" (just leaves this list; nothing is sent).
 * Nobody is told they were passed or reviewed.
 */

import React from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View, type ListRenderItemInfo } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconArrowLeft } from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import type { MatchCard } from '../../services/matchTypes';

interface Props {
  cards: MatchCard[];
  photoUrls: Record<string, string>;
  /** Card currently being liked (disables its buttons). */
  busyId: string | null;
  onLike: (card: MatchCard) => void;
  onSkip: (card: MatchCard) => void;
  onOpenProfile: (card: MatchCard) => void;
  onBack: () => void;
  notice: string | null;
}

export function MatchPassedList({ cards, photoUrls, busyId, onLike, onSkip, onOpenProfile, onBack, notice }: Props): React.ReactElement {
  const c = useThemeColors();
  const { t } = useTranslation('match');

  const renderItem = ({ item }: ListRenderItemInfo<MatchCard>) => {
    const uri = (item.photos[0] && photoUrls[item.photos[0]]) || item.avatar_url || null;
    const name = item.display_name?.trim() || (item.username ? `@${item.username}` : t('review.someone'));
    const busy = busyId === item.id;
    return (
      <View style={[styles.row, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>
        <Pressable onPress={() => onOpenProfile(item)} accessibilityRole="button" accessibilityLabel={name} style={styles.who}>
          {uri ? (
            <Image source={{ uri }} style={[styles.avatar, { backgroundColor: c.bgElevated }]} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: c.bgElevated }]} />
          )}
          <View style={styles.names}>
            <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={1}>
              {name}
            </Text>
            {item.bio ? (
              <Text style={[styles.bio, { color: c.textSecondary }]} numberOfLines={2}>
                {item.bio}
              </Text>
            ) : null}
          </View>
        </Pressable>
        <View style={styles.actions}>
          <Pressable
            onPress={() => onLike(item)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t('review.like')}
            style={({ pressed }) => [styles.likeBtn, { backgroundColor: c.brand, opacity: pressed || busy ? 0.7 : 1 }]}
          >
            {busy ? <ActivityIndicator color={palette.onBrand} /> : <Text style={[styles.likeLabel, { color: palette.onBrand }]}>{t('review.like')}</Text>}
          </Pressable>
          <Pressable
            onPress={() => onSkip(item)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t('review.skip')}
            style={({ pressed }) => [styles.skipBtn, { borderColor: c.borderSubtle, opacity: pressed || busy ? 0.7 : 1 }]}
          >
            <Text style={[styles.skipLabel, { color: c.textSecondary }]} numberOfLines={1}>
              {t('review.skip')}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel={t('review.back')} style={styles.backBtn}>
          <IconArrowLeft size={22} color={c.textPrimary} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: c.textPrimary }]} accessibilityRole="header">
            {t('review.title')}
          </Text>
          <Text style={[styles.hint, { color: c.textSecondary }]}>{t('review.hint')}</Text>
        </View>
      </View>
      {notice ? (
        <Text style={[styles.notice, { color: c.warning }]} accessibilityLiveRegion="polite">
          {notice}
        </Text>
      ) : null}
      <FlatList
        data={cards}
        keyExtractor={(card) => card.id}
        renderItem={renderItem}
        scrollEnabled={false}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListEmptyComponent={<Text style={[styles.empty, { color: c.textSecondary }]}>{t('review.empty')}</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', paddingHorizontal: 16, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, gap: 2 },
  title: { fontSize: 18, fontWeight: '800' },
  hint: { fontSize: 13 },
  notice: { fontSize: 13, textAlign: 'center' },
  row: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 12 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  names: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '700' },
  bio: { fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 10 },
  likeBtn: { flex: 1, minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  likeLabel: { fontSize: 15, fontWeight: '800' },
  skipBtn: { flex: 1, minHeight: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  skipLabel: { fontSize: 14, fontWeight: '600' },
  sep: { height: 10 },
  empty: { textAlign: 'center', paddingVertical: 32, fontSize: 14 },
});
