/**
 * JChat 3.0 — StarRating (Task 2.15)
 *
 * Reusable star display / input component.
 *
 * Props:
 *   value     — current rating (1–5). 0 = nothing selected yet.
 *   onChange  — when provided, renders in interactive (input) mode.
 *               Calls back with the tapped star index (1–5).
 *   size      — icon size in dp (default: 24).
 *   readonly  — force display-only even when onChange is provided.
 *
 * Design:
 *   - Star gold color: REVIEW_COLORS.starGold (#FFCC00).
 *     No exact token for this value exists in tokens.ts; placed in a local
 *     commented block per design guidance. All other colors use useThemeColors().
 *   - Filled star = IconStarFilled, empty star = IconStar.
 *   - Icons: @tabler/icons-react-native.
 *
 * // TODO(i18n)
 */

import React, { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { IconStar, IconStarFilled } from '@tabler/icons-react-native';
import { useThemeColors } from '../../theme/colors';

// ── Local color block ──────────────────────────────────────────────────────
// No exact token in tokens.ts for gold star color — design spec calls for
// #FFCC00. See JCHAT_3.0_DESIGN_SYSTEM.docx · Section 2.
const REVIEW_COLORS = {
  /** Star fill color. Design spec: #FFCC00. No palette token for this value. */
  starGold: '#FFCC00',
} as const;

// ── Props ──────────────────────────────────────────────────────────────────

export interface StarRatingProps {
  /** Current rating value 1–5. Use 0 for no selection. */
  value: number;
  /** Provide to enable interactive mode; omit for display-only. */
  onChange?: (rating: number) => void;
  /** Icon size in dp. Default: 24. */
  size?: number;
  /** Force display-only regardless of onChange. */
  readonly?: boolean;
}

// ── Component ──────────────────────────────────────────────────────────────

export function StarRating({
  value,
  onChange,
  size = 24,
  readonly = false,
}: StarRatingProps): React.ReactElement {
  const c = useThemeColors();
  const interactive = !!onChange && !readonly;

  const handlePress = useCallback(
    (star: number) => {
      if (interactive && onChange) {
        onChange(star);
      }
    },
    [interactive, onChange],
  );

  return (
    <View style={styles.row} accessibilityRole="none">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= value;
        const Icon = filled ? IconStarFilled : IconStar;
        const color = filled ? REVIEW_COLORS.starGold : c.textTertiary;

        if (interactive) {
          return (
            <Pressable
              key={star}
              onPress={() => handlePress(star)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Rate ${star} star${star !== 1 ? 's' : ''}`} // TODO(i18n)
              style={({ pressed }) => [
                styles.star,
                pressed && styles.starPressed,
              ]}
            >
              <Icon size={size} color={color} />
            </Pressable>
          );
        }

        return (
          <View key={star} style={styles.star}>
            <Icon size={size} color={color} />
          </View>
        );
      })}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  star: {
    padding: 2,
  },
  starPressed: {
    opacity: 0.7,
  },
});
