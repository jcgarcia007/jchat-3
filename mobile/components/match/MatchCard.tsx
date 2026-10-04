/**
 * JChat 3.0 — Match card (Fase D2, reused by the deck in D3)
 *
 * The person card exactly as others see it: main photo, name, @username, verified badge and
 * interest chips (common ones highlighted). Blue border when this person Super-Liked me.
 * NEVER shows an age or an email. Presentational: photo URLs are already signed.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { IconRosetteDiscountCheckFilled, IconUser } from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { cardName } from '../../services/matchTypes';
import type { MatchCard as MatchCardData } from '../../services/matchTypes';

interface MatchCardProps {
  card: MatchCardData;
  /** Signed URL of the main photo (null → placeholder). */
  photoUrl: string | null;
  /** Interest key → localized name. */
  interestNames: Record<string, string>;
  /** Max chips to show (default 4). */
  maxChips?: number;
}

export function MatchCard({ card, photoUrl, interestNames, maxChips = 4 }: MatchCardProps) {
  const c = useThemeColors();
  const { t } = useTranslation('match');
  const name = cardName(card) ?? t('card.unknownName');
  const common = new Set(card.common_interests ?? []);
  // Common interests first, then the rest.
  const ordered = [...card.interests].sort((a, b) => Number(common.has(b)) - Number(common.has(a)));
  const chips = ordered.slice(0, maxChips);

  return (
    <View
      accessible
      accessibilityLabel={t('card.a11y', { name })}
      style={[
        styles.card,
        { backgroundColor: c.bgElevated, borderColor: card.super_liked_me ? c.brand : c.borderSubtle },
        card.super_liked_me && styles.superBorder,
      ]}
    >
      {photoUrl ? (
        <Image source={{ uri: photoUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.placeholder, { backgroundColor: c.bgSurface }]}>
          <IconUser size={64} color={c.textTertiary} />
        </View>
      )}

      <LinearGradient
        colors={['transparent', palette.scrimMedium]}
        style={styles.gradient}
        pointerEvents="none"
      />

      {card.super_liked_me && (
        <View style={[styles.superBadge, { backgroundColor: c.brand }]}>
          <Text style={[styles.superBadgeText, { color: palette.onBrand }]}>{t('card.superLikedMe')}</Text>
        </View>
      )}

      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, { color: palette.onImage }]} numberOfLines={1}>
            {name}
          </Text>
          {card.is_verified && (
            <IconRosetteDiscountCheckFilled size={20} color={c.brand} accessibilityLabel={t('card.verified')} />
          )}
        </View>
        {card.username && card.display_name?.trim() ? (
          <Text style={[styles.username, { color: palette.onImageMuted }]} numberOfLines={1}>
            @{card.username}
          </Text>
        ) : null}
        {chips.length > 0 && (
          <View style={styles.chips}>
            {chips.map((key) => {
              const isCommon = common.has(key);
              return (
                <View
                  key={key}
                  style={[
                    styles.chip,
                    isCommon
                      ? { backgroundColor: c.brand }
                      : { backgroundColor: palette.scrimMedium, borderColor: palette.onImageFaint, borderWidth: 1 },
                  ]}
                >
                  <Text style={[styles.chipText, { color: isCommon ? palette.onBrand : palette.onImage }]}>
                    {interestNames[key] ?? key}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
  },
  superBorder: { borderWidth: 3 },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  gradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%' },
  superBadge: {
    position: 'absolute',
    top: 14,
    left: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  superBadgeText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
  info: { position: 'absolute', left: 16, right: 16, bottom: 16, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 24, fontWeight: '800', flexShrink: 1 },
  username: { fontSize: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  chipText: { fontSize: 12, fontWeight: '600' },
});
