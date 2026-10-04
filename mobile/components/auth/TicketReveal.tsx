/**
 * Cascade + title reveal used by the login entrance animation.
 *
 *  - `useTicketCascade(count)` gives each block an opacity 0→1 / 8 px rise, STAGGER_MS apart.
 *  - `TicketTitle` can sweep in left→right: a paper-colored band (expo-linear-gradient) slides over
 *    the text and uncovers it (no masked-view / Reanimated needed).
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { ticket } from '../../theme/ticket';
import { loginFont } from '../../theme/loginFonts';

// ── Timing (tweak here) ───────────────────────────────────────────────────────
/** Delay between one block starting and the next. */
const STAGGER_MS = 50;
/** Each block: opacity 0→1 and RISE_PX px upward over this long. */
const BLOCK_MS = 250;
const RISE_PX = 8;
/** Title sweep (gradient band) duration. */
const REVEAL_MS = 450;
const BAND_WIDTH = 72;

export interface TicketCascade {
  /** Animated style for block `index` (opacity + translateY). */
  blockStyle: (index: number) => { opacity: Animated.Value; transform: { translateY: Animated.AnimatedInterpolation<number> }[] };
  /** 0 → 1 progress of the title sweep. */
  reveal: Animated.Value;
  /** Run the cascade (blocks appear one after another and the title sweeps in). */
  start: () => void;
  /** Reduce motion: show everything at once. */
  showAll: () => void;
}

export function useTicketCascade(count: number, titleIndex: number): TicketCascade {
  const progress = useRef(Array.from({ length: count }, () => new Animated.Value(0))).current;
  const reveal = useRef(new Animated.Value(0)).current;

  return useMemo<TicketCascade>(
    () => ({
      blockStyle: (index) => ({
        opacity: progress[index],
        transform: [
          {
            translateY: progress[index].interpolate({ inputRange: [0, 1], outputRange: [RISE_PX, 0] }),
          },
        ],
      }),
      reveal,
      start: () => {
        Animated.stagger(
          STAGGER_MS,
          progress.map((value) =>
            Animated.timing(value, {
              toValue: 1,
              duration: BLOCK_MS,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
          ),
        ).start();
        Animated.timing(reveal, {
          toValue: 1,
          duration: REVEAL_MS,
          delay: STAGGER_MS * titleIndex,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }).start();
      },
      showAll: () => {
        progress.forEach((value) => value.setValue(1));
        reveal.setValue(1);
      },
    }),
    [progress, reveal, titleIndex],
  );
}

export function TicketTitle({
  text,
  reveal,
}: {
  text: string;
  /** Sweep progress; omit for a static title. */
  reveal?: Animated.Value;
}) {
  const [width, setWidth] = useState(0);
  const onLayout = useCallback((e: { nativeEvent: { layout: { width: number } } }) => {
    setWidth(Math.round(e.nativeEvent.layout.width));
  }, []);

  return (
    <View onLayout={onLayout} style={styles.titleWrap}>
      <Text style={styles.title} accessibilityRole="header">
        {text}
        <Text style={styles.titleDot}>.</Text>
      </Text>
      {reveal && width > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.cover,
            {
              width: width + BAND_WIDTH,
              transform: [
                { translateX: reveal.interpolate({ inputRange: [0, 1], outputRange: [-BAND_WIDTH, width] }) },
              ],
            },
          ]}
        >
          <LinearGradient
            colors={[ticket.ticketPaperClear, ticket.ticketPaper]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ width: BAND_WIDTH }}
          />
          <View style={styles.coverSolid} />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  titleWrap: { overflow: 'hidden' },
  title: {
    fontFamily: loginFont.title,
    fontSize: 36,
    lineHeight: 40,
    letterSpacing: -0.5,
    color: ticket.ticketInk,
  },
  titleDot: { color: ticket.brandAccent },
  cover: { position: 'absolute', top: 0, bottom: 0, left: 0, flexDirection: 'row' },
  coverSolid: { flex: 1, backgroundColor: ticket.ticketPaper },
});
