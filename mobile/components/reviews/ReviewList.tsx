/**
 * JChat 3.0 — ReviewList (Task 2.15)
 *
 * Renders a vertical list of reviews for a business. Each review shows:
 *   - Author avatar initials (until avatar_url is available)
 *   - Author display name / username
 *   - Star rating (display mode)
 *   - Review body text (if present)
 *   - Relative date
 *   - Owner response (if present), visually distinguished
 *   - Report button (calls reportReview)
 *
 * Props:
 *   businessId — UUID used to fetch reviews on mount.
 *
 * Data:
 *   Fetches via getBusinessReviews(businessId) on mount.
 *   Pull-to-refresh supported via FlatList's onRefresh.
 *
 * Design:
 *   - Colors: useThemeColors() only.
 *   - No hardcoded hex.
 *   - Icons: @tabler/icons-react-native.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { IconFlag, IconMessageCircle } from '@tabler/icons-react-native';
import { useThemeColors } from '../../theme/colors';
import { StarRating } from './StarRating';
import {
  getBusinessReviews,
  reportReview,
  type ReviewWithAuthor,
} from '../../services/reviews';

// ── Props ──────────────────────────────────────────────────────────────────

export interface ReviewListProps {
  /** UUID of the business whose reviews to display. */
  businessId: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatRelativeDate(isoString: string, t: TFunction<'reviews'>): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return t('reviewList.today');
  if (days === 1) return t('reviewList.yesterday');
  if (days < 30) return t('reviewList.relativeDays', { count: days });
  const months = Math.floor(days / 30);
  if (months < 12) return t('reviewList.relativeMonths', { count: months });
  return t('reviewList.relativeYears', { count: Math.floor(months / 12) });
}

function authorInitials(review: ReviewWithAuthor): string {
  const name =
    review.author?.display_name ||
    review.author?.username ||
    '?';
  return name.slice(0, 2).toUpperCase();
}

function authorLabel(review: ReviewWithAuthor, t: TFunction<'reviews'>): string {
  if (review.author?.display_name) return review.author.display_name;
  if (review.author?.username) return `@${review.author.username}`;
  return t('reviewList.anonymous');
}

// ── Review card ────────────────────────────────────────────────────────────

interface ReviewCardProps {
  review: ReviewWithAuthor;
  onReport: (id: string) => void;
  colors: ReturnType<typeof useThemeColors>;
}

function ReviewCard({ review, onReport, colors: c }: ReviewCardProps): React.ReactElement {
  const { t } = useTranslation('reviews');
  const styles = makeCardStyles(c);

  const handleReport = useCallback(() => {
    Alert.alert(
      t('reviewList.reportConfirmTitle'),
      t('reviewList.reportConfirmMessage'),
      [
        { text: t('actions.cancel', { ns: 'common' }), style: 'cancel' },
        {
          text: t('reviewList.reportConfirmAction'),
          style: 'destructive',
          onPress: () => onReport(review.id),
        },
      ],
    );
  }, [onReport, review.id, t]);

  return (
    <View style={styles.card}>
      {/* Header row: avatar + author + date */}
      <View style={styles.headerRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{authorInitials(review)}</Text>
        </View>

        <View style={styles.authorBlock}>
          <Text style={styles.authorName} numberOfLines={1}>
            {authorLabel(review, t)}
          </Text>
          <Text style={styles.date}>{formatRelativeDate(review.created_at, t)}</Text>
        </View>

        <StarRating value={review.rating} size={14} readonly />

        <Pressable
          onPress={handleReport}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('reviewList.reportAccessibilityLabel')}
          style={styles.reportButton}
        >
          <IconFlag size={14} color={c.textTertiary} />
        </Pressable>
      </View>

      {/* Body */}
      {review.body ? (
        <Text style={styles.body}>{review.body}</Text>
      ) : null}

      {/* Owner response */}
      {review.response ? (
        <View style={styles.responseBlock}>
          <View style={styles.responseHeader}>
            <IconMessageCircle size={14} color={c.brand} />
            <Text style={styles.responseLabel}>{t('reviewList.ownerResponseLabel')}</Text>
            {review.responded_at ? (
              <Text style={styles.responseDate}>
                {formatRelativeDate(review.responded_at, t)}
              </Text>
            ) : null}
          </View>
          <Text style={styles.responseText}>{review.response}</Text>
        </View>
      ) : null}
    </View>
  );
}

// ── ReviewList ─────────────────────────────────────────────────────────────

export function ReviewList({ businessId }: ReviewListProps): React.ReactElement {
  const { t } = useTranslation('reviews');
  const c = useThemeColors();
  const [reviews, setReviews] = useState<ReviewWithAuthor[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const data = await getBusinessReviews(businessId);
      setReviews(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('reviewList.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [businessId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleReport = useCallback(async (reviewId: string) => {
    try {
      await reportReview(reviewId);
      // Optimistically remove the reported review from local state.
      setReviews((prev) => prev.filter((r) => r.id !== reviewId));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('reviewList.reportError');
      Alert.alert(t('reviewList.errorAlertTitle'), msg);
    }
  }, [t]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ReviewWithAuthor>) => (
      <ReviewCard review={item} onReport={handleReport} colors={c} />
    ),
    [handleReport, c],
  );

  const keyExtractor = useCallback((item: ReviewWithAuthor) => item.id, []);

  const styles = makeListStyles(c);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={c.brand} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable onPress={() => void load()} style={styles.retryButton}>
          <Text style={styles.retryLabel}>{t('actions.retry', { ns: 'common' })}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      data={reviews}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      contentContainerStyle={styles.list}
      onRefresh={() => void load(true)}
      refreshing={refreshing}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.emptyText}>{t('reviewList.emptyMessage')}</Text>
        </View>
      }
    />
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

function makeCardStyles(c: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    card: {
      backgroundColor: c.bgSurface,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
      gap: 8,
      borderWidth: 1,
      borderColor: c.borderSubtle,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    avatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: c.brandLight,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    avatarText: {
      fontSize: 12,
      fontWeight: '700',
      color: c.brand,
    },
    authorBlock: {
      flex: 1,
    },
    authorName: {
      fontSize: 14,
      fontWeight: '600',
      color: c.textPrimary,
    },
    date: {
      fontSize: 11,
      color: c.textTertiary,
      marginTop: 1,
    },
    reportButton: {
      padding: 4,
    },
    body: {
      fontSize: 14,
      color: c.textSecondary,
      lineHeight: 20,
    },
    responseBlock: {
      backgroundColor: c.bgBase,
      borderRadius: 8,
      padding: 10,
      gap: 4,
      borderLeftWidth: 2,
      borderLeftColor: c.brand,
    },
    responseHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    responseLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: c.brand,
      flex: 1,
    },
    responseDate: {
      fontSize: 11,
      color: c.textTertiary,
    },
    responseText: {
      fontSize: 13,
      color: c.textSecondary,
      lineHeight: 18,
    },
  });
}

function makeListStyles(c: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    list: {
      padding: 16,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      gap: 12,
    },
    errorText: {
      fontSize: 14,
      color: c.danger,
      textAlign: 'center',
    },
    emptyText: {
      fontSize: 14,
      color: c.textTertiary,
      textAlign: 'center',
    },
    retryButton: {
      paddingVertical: 8,
      paddingHorizontal: 20,
      backgroundColor: c.brand,
      borderRadius: 8,
    },
    retryLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: c.bgSurface,
    },
  });
}
