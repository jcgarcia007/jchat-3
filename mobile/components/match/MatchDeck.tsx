/**
 * JChat 3.0 — MatchDeck (Fase D3)
 *
 * Own wrapper around @react-native-motion-kit/swipe-deck (pinned 1.5.0) — nobody else imports the
 * library, so swapping it for our own deck (Plan B: Reanimated + Gesture Handler) only touches
 * this file.
 *
 * Gestures: left = pass, right = like, up = super. Threshold 40% of the width (a 3:4 card makes
 * that equal to 30% of its height); fast flicks count; rotation anchored at the bottom (14°);
 * haptic when the threshold is crossed; LIKE / NOPE / SUPER LIKE stamps follow the drag on the UI
 * thread (no setState during the gesture). At most 3 cards are mounted; the next 2 photos are
 * prefetched. Accessible buttons (≥ 44 px, labelled) mirror every gesture. Reduce Motion shortens
 * the programmatic animations.
 *
 * The parent owns the data and the server calls:
 *  - onSwipe(card, action) → true when the server accepted it; false makes the deck restore the card.
 *  - onUndo() → true when the server undid the last swipe; then the card is restored visually.
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedReaction, useAnimatedStyle } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import {
  SwipeDeckActionMotion,
  SwipeDeckMotion,
  SwipeDeckUndoMotion,
  createSwipeDeck,
} from '@react-native-motion-kit/swipe-deck';
import type { SwipeDirection } from '@react-native-motion-kit/swipe-deck';
import { useTranslation } from 'react-i18next';
import { IconArrowBackUp, IconHeartFilled, IconStarFilled, IconX } from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { MatchCard } from './MatchCard';
import type { MatchCard as MatchCardData } from '../../services/matchTypes';
import type { SwipeAction } from '../../services/matchDeck';

const SWIPE_THRESHOLD = (layout: { width: number }) => layout.width * 0.4;

const Deck = createSwipeDeck<MatchCardData>({
  motion: SwipeDeckMotion.tinder({
    rotation: { mode: 'fixed', origin: 'bottom-center', maxDegrees: 14 },
    drag: { mode: 'free' },
    swipeProgressDistance: SWIPE_THRESHOLD, // progress reaches 1 exactly at the commit threshold
    dismiss: { threshold: SWIPE_THRESHOLD },
  }),
});

const DIRECTION_TO_ACTION: Record<SwipeDirection, SwipeAction> = {
  left: 'pass',
  right: 'like',
  up: 'super',
};

interface MatchDeckProps {
  cards: MatchCardData[];
  /** Storage path → signed URL for card photos. */
  photoUrls: Record<string, string>;
  interestNames: Record<string, string>;
  /** Super Likes left today (server-side count). */
  superLeft: number;
  onSwipe: (card: MatchCardData, action: SwipeAction) => Promise<boolean>;
  onUndo: () => Promise<boolean>;
  onCardPress: (card: MatchCardData) => void;
  /** Rendered instead of the deck when there are no cards left. */
  endContent: React.ReactNode;
}

function mainPhotoUrl(card: MatchCardData, photoUrls: Record<string, string>): string | null {
  return card.photos[0] ? (photoUrls[card.photos[0]] ?? null) : null;
}

// ── Stamps (LIKE / NOPE / SUPER LIKE) driven by the UI thread ─────────────────────────────

function tick(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

function Stamps() {
  const c = useThemeColors();
  const { t } = useTranslation('match');
  const { intentDirection, progress } = Deck.useDeckInteraction();

  const likeStyle = useAnimatedStyle(() => ({
    opacity: intentDirection.value === 'right' ? Math.min(1, progress.value * 1.4) : 0,
  }));
  const nopeStyle = useAnimatedStyle(() => ({
    opacity: intentDirection.value === 'left' ? Math.min(1, progress.value * 1.4) : 0,
  }));
  const superStyle = useAnimatedStyle(() => ({
    opacity: intentDirection.value === 'up' ? Math.min(1, progress.value * 1.4) : 0,
  }));

  // Haptic tick the moment the swipe crosses its commit threshold (progress === 1).
  useAnimatedReaction(
    () => progress.value >= 1,
    (crossed, previous) => {
      if (crossed && !previous) scheduleOnRN(tick);
    },
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no">
      <Animated.View style={[styles.stamp, styles.stampLike, { borderColor: c.success }, likeStyle]}>
        <Text style={[styles.stampText, { color: c.success }]}>{t('deck.like')}</Text>
      </Animated.View>
      <Animated.View style={[styles.stamp, styles.stampNope, { borderColor: c.danger }, nopeStyle]}>
        <Text style={[styles.stampText, { color: c.danger }]}>{t('deck.nope')}</Text>
      </Animated.View>
      <Animated.View style={[styles.stamp, styles.stampSuper, { borderColor: c.brand }, superStyle]}>
        <Text style={[styles.stampText, { color: c.brand }]}>{t('deck.superLike')}</Text>
      </Animated.View>
    </View>
  );
}

// ── Controls ─────────────────────────────────────────────────────────────────────────────────

function Controls({
  superLeft,
  onUndo,
}: {
  superLeft: number;
  onUndo: () => Promise<boolean>;
}) {
  const c = useThemeColors();
  const { t } = useTranslation('match');
  const { canSwipe, canUndo } = Deck.useDeckState();
  const { swipeLeft, swipeRight, swipeUp, undo } = Deck.useDeckActions();

  const handleUndo = useCallback(async () => {
    if (!canUndo) return;
    const done = await onUndo();
    if (done) undo();
  }, [canUndo, onUndo, undo]);

  const button = (
    label: string,
    onPress: () => void,
    disabled: boolean,
    color: string,
    icon: React.ReactNode,
    badge?: string,
  ) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge}` : label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.controlBtn,
        { borderColor: color, backgroundColor: c.bgSurface, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 },
      ]}
    >
      {icon}
      {badge ? (
        <View style={[styles.badge, { backgroundColor: color }]}>
          <Text style={[styles.badgeText, { color: palette.onBrand }]}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );

  return (
    <View style={styles.controls}>
      {button(t('deck.undo'), () => void handleUndo(), !canUndo, c.warning, <IconArrowBackUp size={24} color={c.warning} />)}
      {button(t('deck.pass'), () => swipeLeft(), !canSwipe, c.danger, <IconX size={28} color={c.danger} />)}
      {button(
        t('deck.superLike'),
        () => swipeUp(),
        !canSwipe || superLeft <= 0,
        c.brand,
        <IconStarFilled size={24} color={c.brand} />,
        String(superLeft),
      )}
      {button(t('deck.likeButton'), () => swipeRight(), !canSwipe, c.success, <IconHeartFilled size={26} color={c.success} />)}
    </View>
  );
}

// ── Event bridge (swipes → parent; prefetch) ───────────────────────────────────────────────

function prefetch(next: MatchCardData[], photoUrls: Record<string, string>): void {
  const urls = next.map((card) => mainPhotoUrl(card, photoUrls)).filter((u): u is string => !!u);
  if (urls.length > 0) void Image.prefetch(urls).catch(() => undefined);
}

function Bridge({
  cards,
  photoUrls,
  onSwipe,
}: {
  cards: MatchCardData[];
  photoUrls: Record<string, string>;
  onSwipe: (card: MatchCardData, action: SwipeAction) => Promise<boolean>;
}) {
  const { undo } = Deck.useDeckActions();

  Deck.useDeckEventListener('swipe', (event) => {
    void onSwipe(event.item, DIRECTION_TO_ACTION[event.direction]).then((accepted) => {
      if (!accepted) undo(); // server refused / failed → put the card back
    });
  });

  // Prefetch the main photo of the next two cards.
  Deck.useDeckEventListener('indexChange', (event) => {
    prefetch(cards.slice(event.index + 1, event.index + 3), photoUrls);
  });
  useEffect(() => {
    prefetch(cards.slice(0, 3), photoUrls);
  }, [cards, photoUrls]);

  return null;
}

/** Shows the end-of-deck content once the library reports the deck is consumed. */
function DeckEnd({ endContent }: { endContent: React.ReactNode }) {
  const { isCompleted } = Deck.useDeckState();
  return isCompleted ? <View style={styles.endOverlay}>{endContent}</View> : null;
}

// ── Public component ───────────────────────────────────────────────────────────────────────

export function MatchDeck({
  cards,
  photoUrls,
  interestNames,
  superLeft,
  onSwipe,
  onUndo,
  onCardPress,
  endContent,
}: MatchDeckProps) {
  const reduceMotion = useReduceMotion();
  const allowedDirections = useMemo<SwipeDirection[]>(
    () => (superLeft > 0 ? ['left', 'right', 'up'] : ['left', 'right']),
    [superLeft],
  );

  if (cards.length === 0) return <>{endContent}</>;

  return (
    <View style={styles.wrap}>
      <View style={styles.deckArea}>
        <Deck.Root
          data={cards}
          getKey={(card) => card.id}
          allowedDirections={allowedDirections}
          undoEnabled
          visibleCardCount={3}
          containerStyle={styles.deck}
          actionMotion={reduceMotion ? SwipeDeckActionMotion.direct({ duration: 60 }) : undefined}
          undoMotion={reduceMotion ? SwipeDeckUndoMotion.timing({ duration: 60 }) : undefined}
        >
          <Deck.Card interactive>
            {({ item }) => (
              <Pressable
                onPress={() => onCardPress(item)}
                accessibilityRole="button"
                style={styles.cardPressable}
              >
                <MatchCard card={item} photoUrl={mainPhotoUrl(item, photoUrls)} interestNames={interestNames} />
              </Pressable>
            )}
          </Deck.Card>
        </Deck.Root>
        <Stamps />
        <DeckEnd endContent={endContent} />
      </View>

      <Bridge cards={cards} photoUrls={photoUrls} onSwipe={onSwipe} />
      <Controls superLeft={superLeft} onUndo={onUndo} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', alignItems: 'center', gap: 16 },
  deckArea: { width: '100%', maxWidth: 380, aspectRatio: 3 / 4 },
  deck: { width: '100%', aspectRatio: 3 / 4 },
  cardPressable: { width: '100%', height: '100%' },
  endOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  controlBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 11, fontWeight: '800' },
  stamp: {
    position: 'absolute',
    top: 28,
    borderWidth: 4,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  stampLike: { left: 24, transform: [{ rotate: '-14deg' }] },
  stampNope: { right: 24, transform: [{ rotate: '14deg' }] },
  stampSuper: { alignSelf: 'center', top: 60, left: '25%' },
  stampText: { fontSize: 28, fontWeight: '900', letterSpacing: 1 },
});
