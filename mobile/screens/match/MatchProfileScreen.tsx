/**
 * JChat 3.0 — Match profile of another person (Fase D4)
 *
 * Opened from a deck card / activity row / notification. Shows bio, interests (common ones
 * highlighted), a mini photo gallery with lightbox and a link to the full JChat profile (where
 * Follow lives). Like / Pass / Super Like act with match_swipe; a ⋯ menu offers Report, Block and
 * "Ask the venue for help". NEVER shows an age or an email.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import {
  IconArrowLeft,
  IconDots,
  IconHeartFilled,
  IconRosetteDiscountCheckFilled,
  IconStarFilled,
  IconX,
} from '@tabler/icons-react-native';

import type { MainStackParamList } from '../../navigation/AppNavigator';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { MatchLightbox } from '../../components/match/MatchLightbox';
import { useMatchSafety } from '../../components/match/MatchSafety';
import { getMatchProfile, matchErrorCode, matchSwipe } from '../../services/matchDeck';
import type { SwipeAction } from '../../services/matchDeck';
import { fetchInterests, interestName, signedPhotoUrls } from '../../services/matchProfile';
import { cardName } from '../../services/matchTypes';
import type { MatchCard } from '../../services/matchTypes';
import { getMatchPresence } from '../../services/matchPresence';
import { useRequireMatchPresence } from '../../hooks/useRequireMatchPresence';

type Nav = NativeStackNavigationProp<MainStackParamList, 'MatchProfile'>;

export default function MatchProfileScreen() {
  const c = useThemeColors();
  const { t, i18n } = useTranslation('match');
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<MainStackParamList, 'MatchProfile'>>();
  const language: 'en' | 'es' = i18n.language?.startsWith('es') ? 'es' : 'en';
  useRequireMatchPresence(params.businessId, 'active');

  const [card, setCard] = useState<MatchCard | null>(params.card ?? null);
  const [loading, setLoading] = useState(!params.card);
  const [unavailable, setUnavailable] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [interestNames, setInterestNames] = useState<Record<string, string>>({});
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const name = card ? (cardName(card) ?? t('card.unknownName')) : '';

  const safety = useMatchSafety({
    businessId: params.businessId,
    roomId: getMatchPresence().roomId,
    targetUserId: params.userId,
    targetName: name,
    onBlocked: () => navigation.goBack(),
  });

  useEffect(() => {
    let alive = true;
    void Promise.all([getMatchProfile(params.businessId, params.userId), fetchInterests()])
      .then(async ([fresh, catalog]) => {
        if (!alive) return;
        setInterestNames(Object.fromEntries(catalog.map((row) => [row.key, interestName(row, language)])));
        const current = fresh ?? params.card ?? null;
        if (!fresh && !params.card) setUnavailable(true);
        if (fresh) setCard(fresh);
        if (current) setUrls(await signedPhotoUrls(current.photos));
      })
      .catch(() => {
        if (alive && !params.card) setUnavailable(true);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [params.businessId, params.userId, params.card, language]);

  const act = useCallback(
    async (action: SwipeAction) => {
      if (!card || busy) return;
      setBusy(true);
      setNotice(null);
      try {
        const result = await matchSwipe(params.businessId, card.id, action);
        if (result.swiped && result.is_match) {
          navigation.replace('MatchItsAMatch', {
            businessId: params.businessId,
            businessName: params.businessName,
            other: card,
            conversationId: result.conversation_id,
            matchId: result.match_id,
          });
          return;
        }
        navigation.goBack();
      } catch (err) {
        const code = matchErrorCode(err);
        setNotice(t(code ? `deck.errors.${code}` : 'deck.errors.generic'));
      } finally {
        setBusy(false);
      }
    },
    [card, busy, params.businessId, params.businessName, navigation, t],
  );

  const photos = card?.photos ?? [];
  const common = new Set(card?.common_interests ?? []);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bgBase }]}>
      <View style={[styles.header, { borderBottomColor: c.borderSubtle }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('home.back')}
          hitSlop={10}
          style={styles.iconBtn}
        >
          <IconArrowLeft size={22} color={c.textPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: c.textPrimary }]} numberOfLines={1} accessibilityRole="header">
          {name}
        </Text>
        <Pressable
          onPress={safety.openMenu}
          accessibilityRole="button"
          accessibilityLabel={t('safety.menuTitle')}
          hitSlop={10}
          style={styles.iconBtn}
        >
          <IconDots size={22} color={c.textPrimary} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.brand} />
        </View>
      ) : unavailable || !card ? (
        <View style={styles.center}>
          <Text style={[styles.message, { color: c.textPrimary }]}>{t('profileView.unavailable')}</Text>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content}>
            {photos[0] && urls[photos[0]] ? (
              <Pressable
                onPress={() => setLightbox(urls[photos[0]])}
                accessibilityRole="imagebutton"
                accessibilityLabel={t('profileView.photoA11y', { name })}
                style={[styles.mainPhoto, { borderColor: card.super_liked_me ? c.brand : c.borderSubtle }]}
              >
                <Image source={{ uri: urls[photos[0]] }} style={StyleSheet.absoluteFill} contentFit="cover" />
              </Pressable>
            ) : null}

            {photos.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
                {photos.slice(1).map((path) =>
                  urls[path] ? (
                    <Pressable
                      key={path}
                      onPress={() => setLightbox(urls[path])}
                      accessibilityRole="imagebutton"
                      accessibilityLabel={t('profileView.photoA11y', { name })}
                      style={styles.thumb}
                    >
                      <Image source={{ uri: urls[path] }} style={StyleSheet.absoluteFill} contentFit="cover" />
                    </Pressable>
                  ) : null,
                )}
              </ScrollView>
            )}

            <View style={styles.nameRow}>
              <Text style={[styles.name, { color: c.textPrimary }]}>{name}</Text>
              {card.is_verified && (
                <IconRosetteDiscountCheckFilled size={22} color={c.brand} accessibilityLabel={t('card.verified')} />
              )}
            </View>
            {card.username && card.display_name?.trim() ? (
              <Text style={[styles.username, { color: c.textSecondary }]}>@{card.username}</Text>
            ) : null}
            {card.super_liked_me && (
              <View style={[styles.superPill, { backgroundColor: c.brand }]}>
                <Text style={[styles.superPillText, { color: palette.onBrand }]}>{t('card.superLikedMe')}</Text>
              </View>
            )}

            {card.bio?.trim() ? (
              <Text style={[styles.bio, { color: c.textPrimary }]}>{card.bio.trim()}</Text>
            ) : null}

            {card.interests.length > 0 && (
              <View style={styles.chips}>
                {[...card.interests]
                  .sort((a, b) => Number(common.has(b)) - Number(common.has(a)))
                  .map((key) => {
                    const isCommon = common.has(key);
                    return (
                      <View
                        key={key}
                        style={[
                          styles.chip,
                          isCommon
                            ? { backgroundColor: c.brand, borderColor: c.brand }
                            : { backgroundColor: c.bgElevated, borderColor: c.borderSubtle },
                        ]}
                      >
                        <Text style={[styles.chipText, { color: isCommon ? palette.onBrand : c.textPrimary }]}>
                          {interestNames[key] ?? key}
                        </Text>
                      </View>
                    );
                  })}
              </View>
            )}

            <Pressable
              onPress={() => navigation.navigate('UserProfile', { userId: card.id })}
              accessibilityRole="link"
              style={styles.fullProfile}
            >
              <Text style={[styles.fullProfileText, { color: c.brand }]}>{t('profileView.fullProfile')}</Text>
            </Pressable>

            {notice && (
              <Text style={[styles.notice, { color: c.warning }]} accessibilityLiveRegion="polite">
                {notice}
              </Text>
            )}
          </ScrollView>

          <View style={[styles.actions, { borderTopColor: c.borderSubtle, backgroundColor: c.bgSurface }]}>
            {(
              [
                { action: 'pass', label: t('deck.pass'), color: c.danger, icon: <IconX size={28} color={c.danger} /> },
                { action: 'super', label: t('deck.superLike'), color: c.brand, icon: <IconStarFilled size={24} color={c.brand} /> },
                { action: 'like', label: t('deck.likeButton'), color: c.success, icon: <IconHeartFilled size={26} color={c.success} /> },
              ] as const
            ).map(({ action, label, color, icon }) => (
              <Pressable
                key={action}
                onPress={() => void act(action)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={label}
                style={[styles.actionBtn, { borderColor: color, backgroundColor: c.bgSurface, opacity: busy ? 0.5 : 1 }]}
              >
                {icon}
              </Pressable>
            ))}
          </View>
        </>
      )}

      <MatchLightbox url={lightbox} onClose={() => setLightbox(null)} />
      {safety.sheets}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700', flex: 1, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  message: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  content: { padding: 20, gap: 12, paddingBottom: 24 },
  mainPhoto: { width: '100%', aspectRatio: 3 / 4, borderRadius: 20, overflow: 'hidden', borderWidth: 2 },
  thumbs: { gap: 8 },
  thumb: { width: 72, height: 96, borderRadius: 12, overflow: 'hidden' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 26, fontWeight: '800', flexShrink: 1 },
  username: { fontSize: 15 },
  superPill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  superPillText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
  bio: { fontSize: 15, lineHeight: 22 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: '600' },
  fullProfile: { minHeight: 44, justifyContent: 'center' },
  fullProfileText: { fontSize: 15, fontWeight: '600' },
  notice: { fontSize: 13, textAlign: 'center' },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionBtn: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
