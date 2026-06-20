/**
 * JChat 3.0 — Loyalty Screen (Task 2.20)
 *
 * Shows a user's loyalty balance, current tier, points history stub, and the
 * rewards catalog for a given business. Redemption triggers redeemReward()
 * from mobile/services/loyalty.ts; the price discount is applied server-side
 * at checkout (Task 3.5).
 *
 * Props:
 *   businessId — the business whose loyalty program to show.
 *                If omitted, renders an overview of all business balances.
 *
 * TODO(i18n): Replace English strings with translation keys.
 * TODO(Task 3.5): hook up reward selection to checkout discount flow.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { IconAward, IconCoin, IconStar, IconX } from '@tabler/icons-react-native';

import { useAuth } from '../../context/AuthContext';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import {
  getAllBalances,
  getBalance,
  getPointsHistory,
  listRewards,
  listTiers,
  getTierForPoints,
  redeemReward,
} from '../../services/loyalty';
import type {
  LoyaltyBalanceWithBusiness,
  LoyaltyBalance,
  LoyaltyHistoryEntry,
  LoyaltyReward,
  LoyaltyTier,
} from '../../services/loyalty';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPoints(n: number): string {
  return n.toLocaleString();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Large balance + tier hero card. */
function BalanceHero({
  balance,
  tier,
  nextTier,
}: {
  balance: LoyaltyBalance;
  tier: LoyaltyTier | null;
  nextTier: LoyaltyTier | null;
}) {
  const c = useThemeColors();
  const progress =
    nextTier && tier
      ? Math.min(
          ((balance.points - tier.min_points) /
            (nextTier.min_points - tier.min_points)) *
            100,
          100
        )
      : 100;

  return (
    <View style={[styles.heroCard, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>
      {/* Points */}
      <View style={styles.heroRow}>
        <View style={[styles.heroIconWrap, { backgroundColor: c.brandLight }]}>
          <IconCoin size={24} color={palette.brand} />
        </View>
        <View>
          <Text style={[styles.heroPoints, { color: c.textPrimary }]}>
            {formatPoints(balance.points)}
          </Text>
          <Text style={[styles.heroLabel, { color: c.textSecondary }]}>points</Text>
        </View>
      </View>

      {/* Current tier */}
      {tier !== null && (
        <View style={[styles.tierBadge, { backgroundColor: c.brandLight }]}>
          <IconStar size={13} color={palette.brand} />
          <Text style={[styles.tierBadgeText, { color: palette.brand }]}>
            {tier.name}
          </Text>
        </View>
      )}

      {/* Progress to next tier */}
      {nextTier !== null && (
        <View style={styles.progressWrap}>
          <View style={[styles.progressTrack, { backgroundColor: c.bgOverlay }]}>
            <View
              style={[
                styles.progressFill,
                { width: `${progress}%` as `${number}%`, backgroundColor: palette.brand },
              ]}
            />
          </View>
          <Text style={[styles.progressLabel, { color: c.textTertiary }]}>
            {formatPoints(nextTier.min_points - balance.points)} pts to {nextTier.name}
          </Text>
        </View>
      )}
    </View>
  );
}

/** Single history row. */
function HistoryRow({ entry }: { entry: LoyaltyHistoryEntry }) {
  const c = useThemeColors();
  const isPositive = entry.delta >= 0;

  return (
    <View style={[styles.historyRow, { borderBottomColor: c.borderSubtle }]}>
      <View style={styles.historyInfo}>
        <Text style={[styles.historyDesc, { color: c.textPrimary }]} numberOfLines={1}>
          {entry.description}
        </Text>
        <Text style={[styles.historyDate, { color: c.textTertiary }]}>
          {formatDate(entry.occurred_at)}
        </Text>
      </View>
      <Text
        style={[
          styles.historyDelta,
          { color: isPositive ? palette.success : palette.danger },
        ]}
      >
        {isPositive ? '+' : ''}
        {formatPoints(entry.delta)}
      </Text>
    </View>
  );
}

/** Reward card with redeem button. */
function RewardCard({
  reward,
  userPoints,
  onRedeem,
  redeeming,
}: {
  reward: LoyaltyReward;
  userPoints: number;
  onRedeem: (r: LoyaltyReward) => void;
  redeeming: boolean;
}) {
  const c = useThemeColors();
  const canAfford = userPoints >= reward.cost_points;

  return (
    <View style={[styles.rewardCard, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>
      <View style={[styles.rewardIconWrap, { backgroundColor: c.brandLight }]}>
        <IconAward size={20} color={palette.brand} />
      </View>
      <View style={styles.rewardInfo}>
        <Text style={[styles.rewardName, { color: c.textPrimary }]} numberOfLines={1}>
          {reward.name}
        </Text>
        {reward.description !== null && reward.description.length > 0 && (
          <Text
            style={[styles.rewardDesc, { color: c.textSecondary }]}
            numberOfLines={2}
          >
            {reward.description}
          </Text>
        )}
        <Text style={[styles.rewardCost, { color: canAfford ? palette.brand : c.textTertiary }]}>
          {formatPoints(reward.cost_points)} pts
        </Text>
      </View>
      <Pressable
        onPress={() => onRedeem(reward)}
        disabled={!canAfford || redeeming}
        style={[
          styles.redeemBtn,
          {
            backgroundColor: canAfford && !redeeming ? palette.brand : c.bgOverlay,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Redeem ${reward.name}`}
      >
        <Text
          style={[
            styles.redeemBtnText,
            { color: canAfford && !redeeming ? palette.textPrimary : c.textTertiary },
          ]}
        >
          {redeeming ? '…' : 'Redeem'}
        </Text>
      </Pressable>
    </View>
  );
}

/** Card for a business balance in the "all balances" wallet view. */
function WalletCard({ item }: { item: LoyaltyBalanceWithBusiness }) {
  const c = useThemeColors();
  return (
    <View style={[styles.walletCard, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>
      <View style={[styles.walletIconWrap, { backgroundColor: c.brandLight }]}>
        <IconCoin size={18} color={palette.brand} />
      </View>
      <View style={styles.walletInfo}>
        <Text style={[styles.walletBizName, { color: c.textPrimary }]} numberOfLines={1}>
          {item.business?.name ?? 'Business'}
        </Text>
        <Text style={[styles.walletPoints, { color: palette.brand }]}>
          {formatPoints(item.points)} pts
        </Text>
      </View>
    </View>
  );
}

// ── Empty / Error states ──────────────────────────────────────────────────────

function EmptyState({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  const c = useThemeColors();
  return (
    <View style={styles.emptyContainer}>
      {icon}
      <Text style={[styles.emptyTitle, { color: c.textSecondary }]}>{title}</Text>
      <Text style={[styles.emptySubtitle, { color: c.textTertiary }]}>{subtitle}</Text>
    </View>
  );
}

// ── LoyaltyScreen ─────────────────────────────────────────────────────────────

interface Props {
  /**
   * When provided, shows the single-business view (balance + tier + history + rewards).
   * When omitted, shows the wallet overview (all business balances).
   */
  businessId?: string;
}

export default function LoyaltyScreen({ businessId }: Props) {
  const c = useThemeColors();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  // ── Single-business state ───────────────────────────────────────────────────
  const [balance, setBalance] = useState<LoyaltyBalance | null>(null);
  const [tiers, setTiers] = useState<LoyaltyTier[]>([]);
  const [history, setHistory] = useState<LoyaltyHistoryEntry[]>([]);
  const [rewards, setRewards] = useState<LoyaltyReward[]>([]);

  // ── Wallet (all businesses) state ───────────────────────────────────────────
  const [allBalances, setAllBalances] = useState<LoyaltyBalanceWithBusiness[]>([]);

  // ── Shared state ────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // ── Load data ───────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (userId === null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (businessId) {
        const [bal, tiersData, hist, rewardsData] = await Promise.all([
          getBalance(userId, businessId),
          listTiers(businessId),
          getPointsHistory(userId, businessId),
          listRewards(businessId),
        ]);
        setBalance(bal);
        setTiers(tiersData);
        setHistory(hist);
        setRewards(rewardsData);
      } else {
        const rows = await getAllBalances(userId);
        setAllBalances(rows);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load loyalty data.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [userId, businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Redeem ──────────────────────────────────────────────────────────────────
  const handleRedeem = useCallback(
    async (reward: LoyaltyReward) => {
      if (!userId || !businessId) return;
      setRedeemingId(reward.id);
      setError(null);
      setSuccessMsg(null);
      try {
        const updated = await redeemReward(userId, businessId, reward);
        setBalance(updated);
        setSuccessMsg(`Redeemed "${reward.name}"! ${formatPoints(updated.points)} pts remaining.`);
        // TODO(Task 3.5): pass redeemed reward info to checkout discount handler
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Redemption failed.';
        setError(msg);
      } finally {
        setRedeemingId(null);
      }
    },
    [userId, businessId]
  );

  // ── Derived values (single-business view) ───────────────────────────────────
  const currentPoints = balance?.points ?? 0;
  const currentTier = businessId ? getTierForPoints(currentPoints, tiers) : null;
  const nextTier = businessId
    ? (tiers
        .filter((t) => t.min_points > currentPoints)
        .sort((a, b) => a.min_points - b.min_points)[0] ?? null)
    : null;

  // ── Render: loading ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: c.bgBase }]}>
        <ActivityIndicator color={palette.brand} size="large" />
      </View>
    );
  }

  // ── Render: error ───────────────────────────────────────────────────────────
  if (error !== null && !successMsg) {
    return (
      <View style={[styles.centered, { backgroundColor: c.bgBase }]}>
        <Text style={[styles.errorText, { color: palette.danger }]}>{error}</Text>
      </View>
    );
  }

  // ── Render: wallet overview (no businessId) ─────────────────────────────────
  if (!businessId) {
    return (
      <View style={[styles.root, { backgroundColor: c.bgBase }]}>
        <Text style={[styles.sectionHeader, { color: c.textSecondary }]}>
          My Loyalty Wallets
        </Text>
        {allBalances.length === 0 ? (
          <EmptyState
            icon={<IconCoin size={48} color={c.textTertiary} />}
            title="No loyalty balances"
            subtitle="Visit a participating business and make a purchase to earn your first points."
          />
        ) : (
          <FlatList<LoyaltyBalanceWithBusiness>
            data={allBalances}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <WalletCard item={item} />}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    );
  }

  // ── Render: single-business view ─────────────────────────────────────────────
  return (
    <ScrollView
      style={[styles.root, { backgroundColor: c.bgBase }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Success banner */}
      {successMsg !== null && (
        <View style={[styles.successBanner, { backgroundColor: c.bgSurface }]}>
          <Text style={[styles.successText, { color: palette.success }]} numberOfLines={2}>
            {successMsg}
          </Text>
          <Pressable
            onPress={() => setSuccessMsg(null)}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          >
            <IconX size={16} color={c.textTertiary} />
          </Pressable>
        </View>
      )}

      {/* Error banner (shown alongside content so user can still see points) */}
      {error !== null && (
        <View style={[styles.errorBanner, { backgroundColor: c.bgSurface }]}>
          <Text style={[styles.errorText, { color: palette.danger }]} numberOfLines={2}>
            {error}
          </Text>
        </View>
      )}

      {/* Balance hero */}
      {balance !== null ? (
        <BalanceHero balance={balance} tier={currentTier} nextTier={nextTier} />
      ) : (
        <View style={[styles.heroCard, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>
          <Text style={[styles.heroPoints, { color: c.textPrimary }]}>0</Text>
          <Text style={[styles.heroLabel, { color: c.textSecondary }]}>
            No points yet — make a purchase to start earning!
          </Text>
          {/* TODO(Task 3.x): points are awarded on order completion */}
        </View>
      )}

      {/* Points history */}
      <Text style={[styles.sectionHeader, { color: c.textSecondary }]}>
        Points History
      </Text>
      {history.length === 0 ? (
        <Text style={[styles.emptyHint, { color: c.textTertiary }]}>
          No history yet.{'\n'}
          {/* TODO(schema): full history available once loyalty_ledger table is added */}
          Full transaction history will appear here once a ledger table is added
          (stub — Task 2.20).
        </Text>
      ) : (
        <View style={[styles.historyContainer, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>
          {history.map((entry) => (
            <HistoryRow key={entry.id} entry={entry} />
          ))}
        </View>
      )}

      {/* Rewards catalog */}
      <Text style={[styles.sectionHeader, { color: c.textSecondary }]}>
        Rewards to Redeem
      </Text>
      {rewards.length === 0 ? (
        <EmptyState
          icon={<IconAward size={40} color={c.textTertiary} />}
          title="No rewards available"
          subtitle="This business hasn't added any rewards yet."
        />
      ) : (
        <View style={styles.rewardsList}>
          {rewards.map((reward) => (
            <RewardCard
              key={reward.id}
              reward={reward}
              userPoints={currentPoints}
              onRedeem={handleRedeem}
              redeeming={redeemingId === reward.id}
            />
          ))}
        </View>
      )}
      {/* TODO(Task 3.5): tap "Redeem" in checkout to apply discount server-side */}
    </ScrollView>
  );
}

// ── Styles — zero hardcoded hex; all color values come from theme/tokens ───────

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 40,
    gap: 8,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
    gap: 10,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Hero card ───────────────────────────────────────────────────────────────
  heroCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 18,
    gap: 12,
    marginBottom: 8,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  heroIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPoints: {
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: -1,
  },
  heroLabel: {
    fontSize: 14,
  },

  // ── Tier badge ──────────────────────────────────────────────────────────────
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  tierBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },

  // ── Progress bar ────────────────────────────────────────────────────────────
  progressWrap: {
    gap: 6,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },
  progressLabel: {
    fontSize: 12,
  },

  // ── Section headers ─────────────────────────────────────────────────────────
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 8,
  },

  // ── History ─────────────────────────────────────────────────────────────────
  historyContainer: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  historyInfo: {
    flex: 1,
    gap: 2,
  },
  historyDesc: {
    fontSize: 14,
    fontWeight: '500',
  },
  historyDate: {
    fontSize: 12,
  },
  historyDelta: {
    fontSize: 15,
    fontWeight: '700',
  },

  // ── Rewards ─────────────────────────────────────────────────────────────────
  rewardsList: {
    gap: 10,
  },
  rewardCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rewardIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rewardInfo: {
    flex: 1,
    gap: 2,
  },
  rewardName: {
    fontSize: 15,
    fontWeight: '600',
  },
  rewardDesc: {
    fontSize: 12,
    lineHeight: 17,
  },
  rewardCost: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  redeemBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    flexShrink: 0,
  },
  redeemBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },

  // ── Wallet cards ────────────────────────────────────────────────────────────
  walletCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  walletIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletInfo: {
    flex: 1,
    gap: 2,
  },
  walletBizName: {
    fontSize: 15,
    fontWeight: '600',
  },
  walletPoints: {
    fontSize: 13,
    fontWeight: '700',
  },

  // ── Banners ─────────────────────────────────────────────────────────────────
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 10,
    gap: 10,
    marginBottom: 4,
  },
  successText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  errorBanner: {
    padding: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
  },

  // ── Empty state ─────────────────────────────────────────────────────────────
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingVertical: 40,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyHint: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
});
