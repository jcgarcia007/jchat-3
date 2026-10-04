/**
 * JChat 3.0 — Shell of the "boleto" login screens: night-photo header, dark background, the ES · EN
 * pill (top right, inside the safe area) and the rotated paper ticket that overlaps the photo.
 *
 * The login is fixed artwork: nothing here follows light/dark mode (see theme/ticket.ts).
 * With `entrance` the ticket rises from below the screen with a slight bounce; "Reduce motion"
 * skips it. `onContentReady` fires CONTENT_START_MS after the ticket starts rising (while it is still
 * moving), or immediately without animation.
 */

import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { ticket } from '../../theme/ticket';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { LanguagePill } from './LanguagePill';
import { TICKET_PADDING } from './ticketLayout';

// ── Entrance timing (tweak here) ──────────────────────────────────────────────
/** Firm spring: the ticket settles in ≈ 600 ms with very little bounce. */
const TICKET_SPRING = { stiffness: 95, damping: 15, mass: 1 } as const;
/** The content starts to appear this long after the ticket starts rising (it is still moving). */
const CONTENT_START_MS = 350;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const LOGIN_PHOTO = require('../../assets/images/login-bg.jpg') as number;

export interface TicketShellProps {
  /** Share of the screen height covered by the photo (≈ 0.47 login, shorter for the email step). */
  photoFraction?: number;
  /** How far the ticket climbs over the bottom of the photo. */
  overlap?: number;
  /** Rise-from-below entrance (login only). */
  entrance?: boolean;
  /** Time to start the content cascade; `reduceMotion` tells whether the entrance was skipped. */
  onContentReady?: (reduceMotion: boolean) => void;
  /** Top-left control over the photo (e.g. the Back button). */
  leftSlot?: React.ReactNode;
  children?: React.ReactNode;
}

/** Background only (photo + night color): shown while the fonts load so no system text flashes. */
export function TicketBackdrop({ photoFraction = 0.47 }: { photoFraction?: number }) {
  const { height } = useWindowDimensions();
  const { t } = useTranslation('auth');
  const photoHeight = Math.round(height * photoFraction);
  return (
    <>
      <StatusBar barStyle="light-content" />
      <Image
        source={LOGIN_PHOTO}
        style={[styles.photo, { height: photoHeight }]}
        resizeMode="cover"
        accessible
        accessibilityRole="image"
        accessibilityLabel={t('ticket.photoDescription')}
      />
      <LinearGradient
        colors={[ticket.ticketBgClear, ticket.ticketBg]}
        style={[styles.photoFade, { top: Math.round(photoHeight * 0.62), height: Math.round(photoHeight * 0.38) }]}
        pointerEvents="none"
      />
    </>
  );
}

export function TicketShell({
  photoFraction = 0.47,
  overlap = 64,
  entrance = false,
  onContentReady,
  leftSlot,
  children,
}: TicketShellProps) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const photoHeight = Math.round(height * photoFraction);
  const translateY = useRef(new Animated.Value(entrance ? height : 0)).current;
  const doneRef = useRef(false);
  const doneCallbackRef = useRef(onContentReady);
  doneCallbackRef.current = onContentReady;

  useEffect(() => {
    const finish = (reduceMotion: boolean) => {
      if (doneRef.current) return;
      doneRef.current = true;
      doneCallbackRef.current?.(reduceMotion);
    };
    if (!entrance) {
      finish(false);
      return undefined;
    }
    if (reduce === null) return undefined; // wait for the OS answer
    if (reduce) {
      translateY.setValue(0);
      finish(true);
      return undefined;
    }
    const spring = Animated.spring(translateY, {
      toValue: 0,
      ...TICKET_SPRING,
      useNativeDriver: true,
    });
    spring.start();
    const contentTimer = setTimeout(() => finish(false), CONTENT_START_MS);
    return () => {
      clearTimeout(contentTimer);
      spring.stop();
    };
  }, [entrance, reduce, translateY]);

  return (
    <View style={styles.root}>
      <TicketBackdrop photoFraction={photoFraction} />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={{
            paddingTop: photoHeight - overlap,
            paddingBottom: insets.bottom + 28,
            paddingHorizontal: 20,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={[styles.ticket, { transform: [{ translateY }, { rotate: '-2deg' }] }]}>
            {children}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[styles.topBar, { top: insets.top + 8 }]} pointerEvents="box-none">
        <View>{leftSlot}</View>
        <LanguagePill />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ticket.ticketBg },
  flex: { flex: 1 },
  photo: { position: 'absolute', top: 0, left: 0, right: 0, width: '100%' },
  photoFade: { position: 'absolute', left: 0, right: 0 },
  ticket: {
    backgroundColor: ticket.ticketPaper,
    borderRadius: 18,
    padding: TICKET_PADDING,
    shadowColor: ticket.ticketShadow,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 14,
  },
  topBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});

/** Full-screen placeholder while the fonts load: just the photo and the night background. */
export function TicketPlaceholder({ photoFraction = 0.47 }: { photoFraction?: number }) {
  return (
    <View style={styles.root}>
      <TicketBackdrop photoFraction={photoFraction} />
    </View>
  );
}
