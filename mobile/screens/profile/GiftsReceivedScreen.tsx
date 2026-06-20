/**
 * JChat 3.0 — Gifts Received Screen (Task 1.17)
 *
 * Displays all gifts received by the current user.
 * Accessible as the "Gifts" tab on the user's profile (Task 1.7).
 *
 * Gift visibility is gated on the recipient's privacy setting (Task 1.13).
 * This screen is shown only when the user is viewing their own profile or
 * when the viewed user has enabled public gift visibility.
 *
 * TODO(i18n): Replace English strings with translation keys.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { IconGift } from '@tabler/icons-react-native';

import { useAuth } from '../../context/AuthContext';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { getReceivedGifts } from '../../services/gifts';
import type { GiftWithSender } from '../../services/gifts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatAmount(amountCents: number): string | null {
  if (amountCents <= 0) return null;
  return `$${(amountCents / 100).toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// GiftCard
// ---------------------------------------------------------------------------

interface GiftCardProps {
  gift: GiftWithSender;
}

function GiftCard({ gift }: GiftCardProps) {
  const c = useThemeColors();

  const senderName =
    gift.sender?.display_name ?? gift.sender?.username ?? 'Someone';
  const businessName = gift.room?.business?.name ?? null;
  const amountLabel = formatAmount(gift.amount_cents);

  return (
    <View style={[styles.card, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>
      {/* Icon + type row */}
      <View style={styles.cardHeader}>
        <View style={[styles.iconWrap, { backgroundColor: c.brandLight }]}>
          <IconGift size={20} color={palette.brand} />
        </View>
        <View style={styles.cardHeaderText}>
          <Text style={[styles.giftType, { color: c.textPrimary }]} numberOfLines={1}>
            {gift.type}
          </Text>
          {amountLabel !== null && (
            <Text style={[styles.amount, { color: palette.success }]}>
              {amountLabel}
            </Text>
          )}
        </View>
        <Text style={[styles.date, { color: c.textTertiary }]}>
          {formatDate(gift.created_at)}
        </Text>
      </View>

      {/* Sender + business context */}
      <Text style={[styles.meta, { color: c.textSecondary }]} numberOfLines={1}>
        From{' '}
        <Text style={[styles.metaBold, { color: c.textPrimary }]}>
          {senderName}
        </Text>
        {businessName !== null && (
          <>
            {' '}at{' '}
            <Text style={[styles.metaBold, { color: palette.brand }]}>
              {businessName}
            </Text>
          </>
        )}
      </Text>

      {/* Optional personal message */}
      {gift.message !== null && gift.message.length > 0 && (
        <Text
          style={[styles.message, { color: c.textSecondary, borderLeftColor: c.borderSubtle }]}
          numberOfLines={3}
        >
          {gift.message}
        </Text>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  const c = useThemeColors();
  return (
    <View style={styles.emptyContainer}>
      <IconGift size={48} color={c.textTertiary} />
      <Text style={[styles.emptyTitle, { color: c.textSecondary }]}>
        No gifts yet
      </Text>
      <Text style={[styles.emptySubtitle, { color: c.textTertiary }]}>
        Gifts you receive from other users will appear here.
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// GiftsReceivedScreen
// ---------------------------------------------------------------------------

interface Props {
  /** Override the user whose gifts to display. Defaults to the current user. */
  userId?: string;
}

export default function GiftsReceivedScreen({ userId }: Props) {
  const c = useThemeColors();
  const { user } = useAuth();

  const targetUserId = userId ?? user?.id ?? null;

  const [gifts, setGifts] = useState<GiftWithSender[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (targetUserId === null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await getReceivedGifts(targetUserId);
      setGifts(rows);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load gifts.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [targetUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: c.bgBase }]}>
        <ActivityIndicator color={palette.brand} size="large" />
      </View>
    );
  }

  if (error !== null) {
    return (
      <View style={[styles.centered, { backgroundColor: c.bgBase }]}>
        <Text style={[styles.errorText, { color: palette.danger }]}>{error}</Text>
      </View>
    );
  }

  return (
    <FlatList<GiftWithSender>
      data={gifts}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <GiftCard gift={item} />}
      ListEmptyComponent={<EmptyState />}
      contentContainerStyle={[
        styles.listContent,
        { backgroundColor: c.bgBase },
        gifts.length === 0 && styles.listContentEmpty,
      ]}
      style={{ backgroundColor: c.bgBase }}
      showsVerticalScrollIndicator={false}
    />
  );
}

// ---------------------------------------------------------------------------
// Styles — zero hardcoded hex; all color values come from theme/tokens
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
  },

  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 12,
  },
  listContentEmpty: {
    flex: 1,
  },

  // Card
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderText: {
    flex: 1,
    gap: 2,
  },
  giftType: {
    fontSize: 15,
    fontWeight: '600',
  },
  amount: {
    fontSize: 13,
    fontWeight: '500',
  },
  date: {
    fontSize: 12,
  },

  // Meta row
  meta: {
    fontSize: 13,
  },
  metaBold: {
    fontWeight: '600',
  },

  // Personal message
  message: {
    fontSize: 13,
    lineHeight: 18,
    paddingLeft: 10,
    borderLeftWidth: 2,
    marginTop: 2,
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
