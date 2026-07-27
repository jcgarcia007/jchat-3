/**
 * JChat 3.0 — RatingPrompt (Task 2.15)
 *
 * Post-order rating prompt: 1–5 star selector + optional text, then submits
 * a review via createReview().
 *
 * Intended to be shown as a bottom-sheet or modal after an order is delivered.
 * TODO(Task 3.8): show RatingPrompt after order status transitions to 'delivered'.
 *
 * Props:
 *   businessId  — UUID of the business to review.
 *   businessName — Display name shown in the prompt title.
 *   onDone      — Called when the review is submitted OR skipped. Parent
 *                 should dismiss the prompt.
 *
 * Design:
 *   - Colors: useThemeColors() only — no hardcoded hex.
 *   - Star gold: REVIEW_COLORS.starGold local block (see StarRating.tsx).
 *   - Icons: @tabler/icons-react-native.
 */

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../theme/colors';
import { StarRating } from './StarRating';
import { createReview } from '../../services/reviews';

// ── Props ──────────────────────────────────────────────────────────────────

export interface RatingPromptProps {
  /** UUID of the business being reviewed. */
  businessId: string;
  /** Human-readable name shown in the prompt. */
  businessName: string;
  /** Called after submit or skip so the parent can dismiss the sheet. */
  onDone: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export function RatingPrompt({
  businessId,
  businessName,
  onDone,
}: RatingPromptProps): React.ReactElement {
  const { t } = useTranslation('reviews');
  const c = useThemeColors();
  const [rating, setRating] = useState<number>(0);
  const [body, setBody] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const handleSubmit = useCallback(async () => {
    if (rating === 0) {
      Alert.alert(
        t('ratingPrompt.selectRatingTitle'),
        t('ratingPrompt.selectRatingMessage'),
      );
      return;
    }

    setLoading(true);
    try {
      await createReview({
        businessId,
        rating,
        body: body.trim() || undefined,
      });
      onDone();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : t('state.error', { ns: 'common' });
      Alert.alert(t('ratingPrompt.submitErrorTitle'), message);
    } finally {
      setLoading(false);
    }
  }, [businessId, rating, body, onDone, t]);

  const handleSkip = useCallback(() => {
    onDone();
  }, [onDone]);

  const styles = makeStyles(c);

  return (
    <View style={styles.container}>
      {/* Title */}
      <Text style={styles.title}>
        {t('ratingPrompt.title', { businessName })}
      </Text>
      <Text style={styles.subtitle}>
        {t('ratingPrompt.subtitle')}
      </Text>

      {/* Stars */}
      <View style={styles.starsRow}>
        <StarRating value={rating} onChange={setRating} size={36} />
      </View>

      {/* Optional text */}
      <TextInput
        style={styles.textInput}
        placeholder={t('ratingPrompt.bodyPlaceholder')}
        placeholderTextColor={c.textTertiary}
        multiline
        numberOfLines={3}
        maxLength={500}
        value={body}
        onChangeText={setBody}
        editable={!loading}
        accessibilityLabel={t('ratingPrompt.bodyAccessibilityLabel')}
      />

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable
          onPress={handleSkip}
          disabled={loading}
          style={styles.skipButton}
          accessibilityRole="button"
          accessibilityLabel={t('ratingPrompt.skipAccessibilityLabel')}
        >
          <Text style={styles.skipLabel}>{t('ratingPrompt.skip')}</Text>
        </Pressable>

        <Pressable
          onPress={handleSubmit}
          disabled={loading || rating === 0}
          style={[
            styles.submitButton,
            (loading || rating === 0) && styles.submitButtonDisabled,
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('ratingPrompt.submitAccessibilityLabel')}
          accessibilityState={{ disabled: loading || rating === 0 }}
        >
          {loading ? (
            <ActivityIndicator size="small" color={c.bgSurface} />
          ) : (
            <Text style={styles.submitLabel}>{t('ratingPrompt.submit')}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

function makeStyles(c: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    container: {
      backgroundColor: c.bgSurface,
      borderRadius: 16,
      padding: 24,
      gap: 12,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: c.textPrimary,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 13,
      color: c.textSecondary,
      textAlign: 'center',
    },
    starsRow: {
      alignItems: 'center',
      paddingVertical: 8,
    },
    textInput: {
      backgroundColor: c.bgBase,
      borderWidth: 1,
      borderColor: c.borderSubtle,
      borderRadius: 10,
      padding: 12,
      fontSize: 14,
      color: c.textPrimary,
      minHeight: 80,
      textAlignVertical: 'top',
    },
    actions: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 4,
    },
    skipButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.borderSubtle,
      alignItems: 'center',
    },
    skipLabel: {
      fontSize: 15,
      fontWeight: '500',
      color: c.textSecondary,
    },
    submitButton: {
      flex: 2,
      paddingVertical: 12,
      borderRadius: 10,
      backgroundColor: c.brand,
      alignItems: 'center',
    },
    submitButtonDisabled: {
      opacity: 0.45,
    },
    submitLabel: {
      fontSize: 15,
      fontWeight: '600',
      color: c.bgSurface,
    },
  });
}
