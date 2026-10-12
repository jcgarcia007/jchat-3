/**
 * JChat 3.0 — ProfileSheetFrame: the container of the profile opened ON TOP of the chat.
 *
 *   Phone (iOS / Android / narrow web): a dimmed backdrop and a sheet with rounded top corners and a handle that
 *   slides up from the bottom. Closes with ✕, by tapping the backdrop, by dragging the handle / header down, and
 *   with the system back (the screen is a transparentModal route: goBack()).
 *   Wide web (>= 900 px): a right-hand panel (420 px) and NO backdrop: the chat stays visible and usable on the
 *   left (WebFrame shifts the phone-width column, see utils/profilePanelStore).
 *
 * The drag uses React Native's PanResponder on the header only (so the profile's own scrolling is never fought
 * over) — the same on iOS, Android and web.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { IconX } from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { PROFILE_PANEL_WIDTH, isProfilePanelWidth } from '../../utils/profilePanelLayout';
import { setProfilePanelOpen } from '../../utils/profilePanelStore';

interface Props {
  onClose: () => void;
  children: React.ReactNode;
  /** Floating things drawn above the sheet (new-messages pill, DM notice). */
  overlay?: React.ReactNode;
  /** Accessible name of the sheet / panel (default: the profile's). */
  a11yLabel?: string;
  /** testID prefix: `<base>-sheet`, `<base>-panel`, `<base>-sheet-close` (default 'profile'). */
  testIDBase?: string;
}

const CLOSE_DISTANCE = 120;
const CLOSE_VELOCITY = 0.9;
const MAX_DOM_LEVELS = 8;
const TOP_GAP = 48; // room for the new-messages pill above the sheet

export function ProfileSheetFrame({ onClose, children, overlay, a11yLabel, testIDBase = 'profile' }: Props): React.ReactElement {
  const c = useThemeColors();
  const { t } = useTranslation('common');
  const { t: tp } = useTranslation('profile');
  const label = a11yLabel ?? tp('sheet.a11yLabel');
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // Set when the panel's pointer-events workaround cannot be applied (see below): this opening uses the sheet.
  const [panelFailed, setPanelFailed] = useState(false);
  const panel = Platform.OS === 'web' && isProfilePanelWidth(width) && !panelFailed;
  const sheetHeight = Math.max(320, height - insets.top - TOP_GAP);
  const translateY = useRef(new Animated.Value(panel ? 0 : sheetHeight)).current;

  useEffect(() => {
    if (!panel) return undefined;
    setProfilePanelOpen(true);
    // The route screen is an absolute, transparent layer over the whole chat column: it would swallow every click.
    // In panel mode it must let events through to the chat behind (only the panel itself takes them). React
    // Navigation's web stack gives no option for that, so the layers between the panel and the screen wrapper get
    // pointer-events: none while it is open. The wrapper is recognised as the first ancestor that has a screen below
    // it as a previous sibling. The walk is bounded: at most MAX_DOM_LEVELS ancestors. If the wrapper is not found
    // within that (a React Navigation / React Native Web update changed the DOM), everything touched is restored
    // and THIS opening uses the sheet instead of the panel (with a console.warn), so a layout change can never leave
    // the page unclickable.
    const restore: (() => void)[] = [];
    const undoAll = () => restore.splice(0).forEach((undo) => undo());
    let found = false;
    if (typeof document !== 'undefined') {
      let el = (document.querySelector(`[data-testid="${testIDBase}-panel"]`) as HTMLElement | null)?.parentElement ?? null;
      for (let level = 0; el && el !== document.body && level < MAX_DOM_LEVELS; level += 1) {
        const target = el;
        const previous = target.style.pointerEvents;
        target.style.pointerEvents = 'none';
        restore.push(() => { target.style.pointerEvents = previous; });
        if (target.previousElementSibling) { found = true; break; } // the screen wrapper: the chat's screen sits right before it
        el = target.parentElement;
      }
    }
    if (!found) {
      undoAll();
      console.warn(`[profile-panel] screen layer not found within ${MAX_DOM_LEVELS} levels; opening the profile as a sheet`);
      translateY.setValue(sheetHeight);
      setProfilePanelOpen(false);
      setPanelFailed(true);
      return undefined;
    }
    return () => {
      undoAll();
      setProfilePanelOpen(false);
    };
  }, [panel, sheetHeight, translateY]);

  const closingRef = useRef(false);
  const useNative = Platform.OS !== 'web';

  useEffect(() => {
    if (panel) return;
    Animated.timing(translateY, { toValue: 0, duration: 240, useNativeDriver: useNative }).start();
  }, [panel, translateY, useNative]);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (panel) {
      onClose();
      return;
    }
    Animated.timing(translateY, { toValue: sheetHeight, duration: 200, useNativeDriver: useNative }).start(() => onClose());
  }, [onClose, panel, sheetHeight, translateY, useNative]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        // The header is only a handle: it takes the gesture from the first touch (the ✕ inside claims its own taps).
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_e, g) => translateY.setValue(Math.max(0, g.dy)),
        onPanResponderRelease: (_e, g) => {
          if (g.dy > CLOSE_DISTANCE || g.vy > CLOSE_VELOCITY) close();
          else Animated.spring(translateY, { toValue: 0, useNativeDriver: useNative, bounciness: 0 }).start();
        },
        onPanResponderTerminate: () => Animated.spring(translateY, { toValue: 0, useNativeDriver: useNative, bounciness: 0 }).start(),
      }),
    [close, translateY, useNative],
  );

  const backdropOpacity = translateY.interpolate({ inputRange: [0, sheetHeight], outputRange: [1, 0], extrapolate: 'clamp' });

  if (panel) {
    return (
      <View testID={`${testIDBase}-panel`} pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <View
          accessibilityViewIsModal={false}
          accessibilityLabel={label}
          style={[styles.panel, { width: PROFILE_PANEL_WIDTH, backgroundColor: c.bgBase, borderLeftColor: c.borderSubtle, pointerEvents: 'auto' }]}
        >
          <View style={styles.panelHeader}>
            <CloseButton testID={`${testIDBase}-sheet-close`} label={t('actions.close')} color={c.textPrimary} bg={c.bgSurface} onPress={close} />
          </View>
          <View style={styles.flex}>{children}</View>
        </View>
        {overlay}
      </View>
    );
  }

  return (
    <View testID={`${testIDBase}-sheet`} style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: palette.scrimMedium, opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button" accessibilityLabel={t('actions.close')} />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        accessibilityLabel={label}
        style={[styles.sheet, { height: sheetHeight, backgroundColor: c.bgBase, transform: [{ translateY }] }]}
      >
        <View {...pan.panHandlers} style={styles.sheetHeader}>
          <View style={[styles.handle, { backgroundColor: c.borderSubtle }]} />
          <View style={styles.closeSlot}>
            <CloseButton testID={`${testIDBase}-sheet-close`} label={t('actions.close')} color={c.textPrimary} bg={c.bgSurface} onPress={close} />
          </View>
        </View>
        <View style={styles.flex}>{children}</View>
      </Animated.View>
      {overlay}
    </View>
  );
}

function CloseButton({ testID, label, color, bg, onPress }: { testID: string; label: string; color: string; bg: string; onPress: () => void }): React.ReactElement {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [styles.close, { backgroundColor: bg, opacity: pressed ? 0.7 : 1 }]}
    >
      <IconX size={18} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  sheetHeader: { height: 28, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 42, height: 5, borderRadius: 3 },
  closeSlot: { position: 'absolute', right: 10, top: 0, bottom: 0, justifyContent: 'center', zIndex: 5 },
  close: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  // Web only: fixed to the browser window, so it sits to the RIGHT of the phone-width column (the screen layer it is
  // rendered in is only as wide as that column).
  panel: { position: 'fixed' as unknown as 'absolute', top: 0, right: 0, bottom: 0, borderLeftWidth: StyleSheet.hairlineWidth },
  panelHeader: { height: 48, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 12 },
});
