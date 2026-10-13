/**
 * JChat 3.0 — Truth or Dare: the private card.
 *
 * Opens after tod_draw. The card turns over with a 3D flip (rotateY + perspective, two faces with backfaceVisibility hidden,
 * 650 ms, Reanimated); with "reduce motion" it cross-fades instead. No sound, no vibration. The text is announced to screen
 * readers once revealed. "Publish" / "Pass" call tod_decide through `onDecide`, which answers true when the card is finished
 * (published, passed, or no longer usable) and the modal can close; closing with ✕ leaves the draw open ("pending") so the next
 * tap on any round reopens it.
 */

import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Spinner } from '../common/Spinner';
import { AppModal } from '../common/AppModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { IconX } from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { getTodCard, todLocale, useTodCardText } from '../../services/tod';
import type { TodCategory, TodDrawOk } from '../../services/tod';
import { TOD_CATEGORY_META } from './todCategories';

const FLIP_MS = 650;
const FADE_MS = 250;
const PERSPECTIVE = 1200;

interface Props {
  draw: TodDrawOk;
  /** Category of the card that was tapped (used until the card text itself says its category). */
  fallbackCategory: TodCategory;
  /** true = the card is finished and the modal should close. */
  onDecide: (publish: boolean) => Promise<boolean>;
  onClose: () => void;
}

export function TodCardModal({ draw, fallbackCategory, onDecide, onClose }: Props) {
  const c = useThemeColors();
  const { t, i18n } = useTranslation('tod');
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const locale = todLocale(i18n.language);
  const card = useTodCardText(draw.concept_id, locale);

  const known = getTodCard(draw.concept_id, locale)?.category;
  const category = (known && known in TOD_CATEGORY_META ? known : fallbackCategory) as TodCategory;
  const meta = TOD_CATEGORY_META[category];
  const kindLabel = t(`kind.${draw.kind}`);

  const progress = useSharedValue(0);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState<'publish' | 'pass' | null>(null);

  const ready = card.status !== 'loading';
  const text = card.status === 'ready' ? card.text : t('result.unavailable');

  useEffect(() => {
    if (!ready) return undefined;
    const duration = reduceMotion ? FADE_MS : FLIP_MS;
    progress.value = withTiming(1, { duration });
    const timer = setTimeout(() => {
      setRevealed(true);
      AccessibilityInfo.announceForAccessibility(t('card.revealA11y', { kind: kindLabel, text }));
    }, duration);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reveal once, when the text is known
  }, [ready, reduceMotion]);

  const frontStyle = useAnimatedStyle(() =>
    reduceMotion
      ? { opacity: 1 - progress.value }
      : { transform: [{ perspective: PERSPECTIVE }, { rotateY: `${progress.value * 180}deg` }] },
  );
  const backStyle = useAnimatedStyle(() =>
    reduceMotion
      ? { opacity: progress.value }
      : { transform: [{ perspective: PERSPECTIVE }, { rotateY: `${180 + progress.value * 180}deg` }] },
  );

  const decide = async (publish: boolean) => {
    if (busy) return;
    setBusy(publish ? 'publish' : 'pass');
    try {
      if (await onDecide(publish)) onClose();
    } finally {
      setBusy(null);
    }
  };

  const cardWidth = Math.min(width - 48, 360);

  return (
    <AppModal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={[styles.scrim, { backgroundColor: c.scrim }]}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.topRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('card.later')}
              hitSlop={10}
              onPress={onClose}
              disabled={busy !== null}
              style={styles.closeBtn}
            >
              <IconX size={24} color={palette.onImage} />
            </Pressable>
          </View>

          <View style={styles.body}>
            <View style={[styles.cardBox, { width: cardWidth }]}>
              {/* Back of the card (the "?" face) */}
              <Animated.View
                pointerEvents="none"
                style={[styles.face, { backgroundColor: meta.color }, frontStyle]}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <meta.Icon size={64} color={meta.onColor} />
                <Text style={[styles.hiddenTitle, { color: meta.onColor }]}>{t('card.hiddenFace')}</Text>
                {!ready ? <Spinner color={meta.onColor} /> : null}
              </Animated.View>

              {/* The card itself */}
              <Animated.View
                style={[styles.face, styles.faceFront, { backgroundColor: c.bgSurface, borderColor: meta.color }, backStyle]}
                accessible
                accessibilityLiveRegion="polite"
                accessibilityLabel={revealed ? t('card.revealA11y', { kind: kindLabel, text }) : undefined}
              >
                <View style={[styles.cardBand, { backgroundColor: meta.color }]}>
                  <meta.Icon size={22} color={meta.onColor} />
                  <Text style={[styles.cardBandText, { color: meta.onColor }]}>{t(`category.${category}.name`)}</Text>
                </View>
                <View style={styles.cardBody}>
                  <Text style={[styles.kind, { color: meta.color }]}>
                    {kindLabel}
                    {draw.is_random ? ' 🎲' : ''}
                  </Text>
                  <Text style={[styles.cardText, { color: c.textPrimary }]}>{text}</Text>
                </View>
                <Text style={[styles.private, { color: c.textTertiary }]}>{t('card.private')}</Text>
              </Animated.View>
            </View>
          </View>

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !revealed || busy !== null, busy: busy === 'publish' }}
              disabled={!revealed || busy !== null}
              onPress={() => void decide(true)}
              style={[styles.publish, { backgroundColor: c.brandFill, opacity: revealed && busy === null ? 1 : 0.5 }]}
            >
              {busy === 'publish' ? (
                <Spinner color={palette.onBrand} />
              ) : (
                <Text style={styles.publishText}>{t('card.publish')}</Text>
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !revealed || busy !== null, busy: busy === 'pass' }}
              disabled={!revealed || busy !== null}
              onPress={() => void decide(false)}
              style={[styles.pass, { borderColor: palette.onImageMuted, opacity: revealed && busy === null ? 1 : 0.5 }]}
            >
              {busy === 'pass' ? (
                <Spinner color={palette.onImage} />
              ) : (
                <Text style={styles.passText}>{t('card.pass')}</Text>
              )}
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1 },
  safe: { flex: 1 },
  topRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 12, paddingTop: 4 },
  closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cardBox: { height: 360 },
  face: {
    ...StyleSheet.absoluteFill,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backfaceVisibility: 'hidden',
    overflow: 'hidden',
  },
  faceFront: { borderWidth: 2, justifyContent: 'flex-start', gap: 0 },
  hiddenTitle: { fontSize: 24, fontWeight: '800' },
  cardBand: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12 },
  cardBandText: { fontSize: 17, fontWeight: '800' },
  cardBody: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22, gap: 12 },
  kind: { fontSize: 14, fontWeight: '900', letterSpacing: 1.5 },
  cardText: { fontSize: 21, lineHeight: 29, fontWeight: '700', textAlign: 'center' },
  private: { fontSize: 12, textAlign: 'center', paddingBottom: 14, paddingHorizontal: 16 },
  actions: { paddingHorizontal: 24, paddingBottom: 20, gap: 10 },
  publish: { minHeight: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  publishText: { color: palette.onBrand, fontSize: 18, fontWeight: '800' },
  pass: { minHeight: 50, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  passText: { color: palette.onImage, fontSize: 17, fontWeight: '700' },
});
