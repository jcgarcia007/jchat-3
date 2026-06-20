/**
 * JChat 3.0 — MapReactionButton (Task 2.18)
 *
 * A button rendered inside a chat room that lets in-room users send one of
 * five emoji reactions. Tapping an emoji:
 *   1. Inserts a row into `map_reactions` (DB persist).
 *   2. Broadcasts the emoji on the Supabase Realtime channel for the room.
 *
 * Props:
 *   businessId  — UUID of the business the room belongs to.
 *   roomId      — UUID of the current room.
 *   inRoom      — true ONLY while the user is inside the room. The button
 *                 renders nothing (returns null) when false.
 *
 * Rate limit:
 *   One reaction per user per 10 seconds, enforced client-side via a timestamp
 *   ref. Taps within the cooldown window are silently ignored; the button
 *   shows a subtle disabled/greyed state during the cooldown.
 *
 * Stage 4 (Map) float animation:
 *   When a reaction is received on the map (Stage 4), it floats up from the
 *   business pin and fades out.
 *   // TODO(Stage 4): map float animation — on MapScreen receive emoji via
 *   subscribeMapReactions and animate each emoji:
 *     translateY: 0 → -30,  opacity: 1 → 0,  scale: 1 → 1.3
 *     duration: 3000ms, easing: ease-out
 *   Implementation hint: use Animated.parallel([translateY, opacity, scale])
 *   spawned per-emoji from a queue; each animation starts on payload arrival.
 *
 * Design:
 *   - Colors from useThemeColors() — no hardcoded hex
 *   - Dark + light mode via useThemeColors()
 *   - Icon: IconMoodSmile from @tabler/icons-react-native (opens picker)
 *   - Platform: mobile only (no .web.tsx split needed — button lives in chat)
 *   - Guard: isSupabaseConfigured (sendMapReaction handles it internally)
 *
 * // TODO(i18n)
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { IconMoodSmile } from '@tabler/icons-react-native';
import { useThemeColors } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import { sendMapReaction } from '../../services/mapReactions';

// ── Constants ─────────────────────────────────────────────────────────────────

/** The five available reaction emojis (max 5 per spec). */
const REACTION_EMOJIS = ['🔥', '🎉', '❤️', '😂', '👍'] as const;

/** Rate-limit window in milliseconds (10 seconds). */
const RATE_LIMIT_MS = 10_000;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MapReactionButtonProps {
  /** UUID of the business the room belongs to. */
  businessId: string;
  /** UUID of the chat room. */
  roomId: string;
  /**
   * Must be true for the button to render. The button is ONLY usable by users
   * who are currently inside the room. Pass false to hide the entire button.
   */
  inRoom: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MapReactionButton({
  businessId,
  roomId,
  inRoom,
}: MapReactionButtonProps) {
  const c = useThemeColors();
  const { user } = useAuth();

  // Whether the emoji picker panel is open.
  const [pickerOpen, setPickerOpen] = useState(false);

  // During cooldown the button shows a disabled/greyed state.
  const [onCooldown, setOnCooldown] = useState(false);

  // Timestamp of the last sent reaction (monotonic — Date.now()).
  const lastSentRef = useRef<number>(0);

  // Timer ref so we can clear it if the component unmounts during cooldown.
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fade animation value used to show subtle disabled visual during cooldown.
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Toggle the emoji picker panel.
  const handleTogglePicker = useCallback(() => {
    if (onCooldown) return; // Silently ignore taps during cooldown.
    setPickerOpen((prev) => !prev);
  }, [onCooldown]);

  // Close picker without sending.
  const handleClosePicker = useCallback(() => {
    setPickerOpen(false);
  }, []);

  // Called when the user taps one of the emoji options.
  const handleEmojiPress = useCallback(
    async (emoji: string) => {
      // ── Rate-limit guard ────────────────────────────────────────────────
      const now = Date.now();
      if (now - lastSentRef.current < RATE_LIMIT_MS) {
        // Within cooldown window — silently ignore.
        setPickerOpen(false);
        return;
      }

      if (!user) {
        // Not authenticated — ignore.
        setPickerOpen(false);
        return;
      }

      // Record send timestamp and begin cooldown.
      lastSentRef.current = now;
      setPickerOpen(false);
      setOnCooldown(true);

      // Animate to disabled opacity.
      Animated.timing(fadeAnim, {
        toValue: 0.45,
        duration: 150,
        useNativeDriver: true,
      }).start();

      // Clear previous cooldown timer (safety) and start new one.
      if (cooldownTimerRef.current !== null) {
        clearTimeout(cooldownTimerRef.current);
      }
      cooldownTimerRef.current = setTimeout(() => {
        setOnCooldown(false);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }).start();
        cooldownTimerRef.current = null;
      }, RATE_LIMIT_MS);

      // ── Send (fire-and-forget, errors are silent — UX stays unblocked) ──
      await sendMapReaction({ businessId, roomId, emoji });
    },
    [user, businessId, roomId, fadeAnim],
  );

  // Only users inside the room can send reactions.
  if (!inRoom) return null;

  const styles = makeStyles(c);

  return (
    <View style={styles.wrapper}>
      {/* ── Emoji picker panel ────────────────────────────────────────────── */}
      {pickerOpen && (
        <View style={styles.pickerPanel}>
          {REACTION_EMOJIS.map((emoji) => (
            <Pressable
              key={emoji}
              onPress={() => handleEmojiPress(emoji)}
              accessibilityRole="button"
              accessibilityLabel={`React with ${emoji}`} // TODO(i18n)
              style={({ pressed }) => [
                styles.emojiButton,
                pressed && styles.emojiButtonPressed,
              ]}
            >
              <Text style={styles.emojiText}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* ── Trigger button ────────────────────────────────────────────────── */}
      <Animated.View style={{ opacity: fadeAnim }}>
        <Pressable
          onPress={pickerOpen ? handleClosePicker : handleTogglePicker}
          disabled={onCooldown}
          accessibilityRole="button"
          accessibilityLabel={
            pickerOpen
              ? 'Close reaction picker' // TODO(i18n)
              : 'Send a reaction'        // TODO(i18n)
          }
          accessibilityState={{ disabled: onCooldown }}
          style={({ pressed }) => [
            styles.triggerButton,
            pickerOpen && styles.triggerButtonActive,
            onCooldown && styles.triggerButtonCooldown,
            pressed && !onCooldown && styles.triggerButtonPressed,
          ]}
        >
          <IconMoodSmile
            size={20}
            color={
              onCooldown
                ? c.textTertiary
                : pickerOpen
                ? c.bgSurface
                : c.brand
            }
          />
        </Pressable>
      </Animated.View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(c: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    wrapper: {
      alignItems: 'center',
      gap: 8,
    },

    // Emoji picker panel — floats above the trigger button.
    pickerPanel: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: c.bgElevated,
      borderRadius: 24,
      paddingHorizontal: 10,
      paddingVertical: 6,
      // Subtle border so it lifts off the chat background.
      borderWidth: 1,
      borderColor: c.borderSubtle,
      // Shadow (iOS).
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.18,
      shadowRadius: 6,
      // Elevation (Android).
      elevation: 4,
    },

    // Individual emoji option inside the picker.
    emojiButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 20,
    },
    emojiButtonPressed: {
      backgroundColor: c.bgOverlay,
    },
    emojiText: {
      fontSize: 22,
      lineHeight: 26,
    },

    // Main trigger button (smiley icon).
    triggerButton: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 18,
      backgroundColor: c.bgElevated,
      borderWidth: 1,
      borderColor: c.borderSubtle,
    },
    triggerButtonActive: {
      backgroundColor: c.brand,
      borderColor: c.brand,
    },
    triggerButtonCooldown: {
      borderColor: c.borderSubtle,
    },
    triggerButtonPressed: {
      opacity: 0.75,
    },
  });
}
