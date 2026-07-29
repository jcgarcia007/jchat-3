/**
 * JChat 3.0 — Dashboard Loyalty Program (Task 2.20)
 *
 * Lets business owners configure:
 *  1. Point earn rule — points awarded per $1 spent.
 *  2. Member tiers   — Bronze / Silver / Gold thresholds (fully editable).
 *  3. Rewards catalog — CRUD list of redeemable rewards.
 *
 * Design: var(--db-*) tokens only. "use client" for hooks + form state.
 * Guard: isSupabaseConfigured check before any live DB calls.
 *
 * TODO(Task 3.x): award points on order completion — trigger from checkout.
 * TODO(Task 3.12): Pro ROI analytics (points issued vs revenue) go in Analytics.
 */

"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  IconAward,
  IconAlertCircle,
  IconCheck,
  IconTrash,
  IconPlus,
  IconCoin,
  IconStar,
  IconEdit,
  IconX,
} from "@tabler/icons-react";
import { isSupabaseConfigured } from "@/lib/supabase";
import { resolveActiveBusiness } from "@/lib/business";
import {
  getRules,
  upsertRules,
  listRewards,
  createReward,
  deleteReward,
  listTiers,
  upsertTiers,
} from "@/lib/loyalty";
import type { LoyaltyRule, LoyaltyReward, LoyaltyTier } from "@/lib/loyalty";

// ── Default tiers ─────────────────────────────────────────────────────────────

const DEFAULT_TIERS = [
  { name: "Bronze", min_points: 0 },
  { name: "Silver", min_points: 500 },
  { name: "Gold", min_points: 1500 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPoints(n: number): string {
  return n.toLocaleString();
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label
      style={{
        display: "block",
        fontSize: "12px",
        fontWeight: 600,
        color: "var(--db-text-secondary)",
        marginBottom: "6px",
        letterSpacing: "0.03em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </label>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%",
        padding: "10px 12px",
        borderRadius: "var(--db-radius)",
        border: "1px solid var(--db-border)",
        background: "var(--db-bg-elevated)",
        color: "var(--db-text-primary)",
        fontSize: "14px",
        outline: "none",
        boxSizing: "border-box",
      }}
    />
  );
}

function AlertBanner({
  type,
  message,
}: {
  type: "error" | "success" | "warning";
  message: string;
}) {
  const styles: Record<string, { bg: string; color: string }> = {
    error: { bg: "rgba(239,68,68,0.12)", color: "var(--db-danger)" },
    success: { bg: "rgba(34,197,94,0.12)", color: "var(--db-success)" },
    warning: { bg: "rgba(245,158,11,0.12)", color: "var(--db-warning)" },
  };
  const Icon =
    type === "error"
      ? IconAlertCircle
      : type === "success"
      ? IconCheck
      : IconAlertCircle;
  const s = styles[type] ?? styles.error;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "12px 16px",
        borderRadius: "var(--db-radius)",
        background: s.bg,
        color: s.color,
        fontSize: "14px",
        marginBottom: "16px",
      }}
    >
      <Icon size={16} />
      {message}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LoyaltyPage() {
  const t = useTranslations("dashboardCommon");
  const tCommon = useTranslations("common");

  // ── State ────────────────────────────────────────────────────────────────────
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [loadingBiz, setLoadingBiz] = useState(true);

  // Rules
  const [rule, setRule] = useState<LoyaltyRule | null>(null);
  const [pointsInput, setPointsInput] = useState("10");
  const [savingRule, setSavingRule] = useState(false);

  // Tiers
  const [tiers, setTiers] = useState<LoyaltyTier[]>([]);
  const [editingTiers, setEditingTiers] = useState(false);
  const [tierDraft, setTierDraft] = useState(
    DEFAULT_TIERS.map((t) => ({ name: t.name, min_points: String(t.min_points) }))
  );
  const [savingTiers, setSavingTiers] = useState(false);

  // Rewards
  const [rewards, setRewards] = useState<LoyaltyReward[]>([]);
  const [showRewardForm, setShowRewardForm] = useState(false);
  const [rewardName, setRewardName] = useState("");
  const [rewardDesc, setRewardDesc] = useState("");
  const [rewardCost, setRewardCost] = useState("100");
  const [creatingReward, setCreatingReward] = useState(false);
  const [deletingReward, setDeletingReward] = useState<string | null>(null);

  // Shared
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // ── Resolve business id ───────────────────────────────────────────────────────
  const resolveBusinessId = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoadingBiz(false);
      return;
    }
    try {
      // Shared resolver: tolerant of an owner having multiple businesses
      // (picks the most-recent). Avoids the .single() "multiple rows" error.
      const res = await resolveActiveBusiness();
      if (res.ok) {
        setBusinessId(res.business.id);
      }
    } catch {
      // business not found — keep null
    } finally {
      setLoadingBiz(false);
    }
  }, []);

  // ── Load data ─────────────────────────────────────────────────────────────────
  const loadAll = useCallback(async (bizId: string) => {
    try {
      const [ruleData, tiersData, rewardsData] = await Promise.all([
        getRules(bizId),
        listTiers(bizId),
        listRewards(bizId),
      ]);

      setRule(ruleData);
      if (ruleData) {
        setPointsInput(String(ruleData.points_per_dollar));
      }

      if (tiersData.length > 0) {
        setTiers(tiersData);
        setTierDraft(
          tiersData.map((t) => ({ name: t.name, min_points: String(t.min_points) }))
        );
      } else {
        setTierDraft(
          DEFAULT_TIERS.map((t) => ({
            name: t.name,
            min_points: String(t.min_points),
          }))
        );
      }

      setRewards(rewardsData);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(t("loyaltyLoadError", { msg }));
    }
  }, [t]);

  useEffect(() => {
    void resolveBusinessId();
  }, [resolveBusinessId]);

  useEffect(() => {
    if (businessId) void loadAll(businessId);
  }, [businessId, loadAll]);

  // ── Save earn rule ────────────────────────────────────────────────────────────
  const handleSaveRule = useCallback(async () => {
    setError(null);
    setSuccess(null);
    const pts = parseInt(pointsInput, 10);
    if (isNaN(pts) || pts < 1) {
      setError(t("loyaltyPointsValidationError"));
      return;
    }
    if (!businessId) {
      setError(t("loyaltyBusinessNotFoundError"));
      return;
    }
    setSavingRule(true);
    try {
      const updated = await upsertRules(businessId, pts);
      setRule(updated);
      setSuccess(t("loyaltyRuleSavedSuccess"));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(t("loyaltyRuleSaveError", { msg }));
    } finally {
      setSavingRule(false);
    }
  }, [businessId, pointsInput, t]);

  // ── Save tiers ────────────────────────────────────────────────────────────────
  const handleSaveTiers = useCallback(async () => {
    setError(null);
    setSuccess(null);
    if (!businessId) {
      setError(t("loyaltyBusinessNotFoundError"));
      return;
    }
    for (const row of tierDraft) {
      if (!row.name.trim()) {
        setError(t("loyaltyTierNameRequiredError"));
        return;
      }
      const pts = parseInt(row.min_points, 10);
      if (isNaN(pts) || pts < 0) {
        setError(t("loyaltyTierMinPointsError", { name: row.name }));
        return;
      }
    }
    setSavingTiers(true);
    try {
      const saved = await upsertTiers({
        businessId,
        tiers: tierDraft.map((row) => ({
          name: row.name.trim(),
          min_points: parseInt(row.min_points, 10),
        })),
      });
      setTiers(saved);
      setEditingTiers(false);
      setSuccess(t("loyaltyTiersSavedSuccess"));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(t("loyaltyTiersSaveError", { msg }));
    } finally {
      setSavingTiers(false);
    }
  }, [businessId, tierDraft, t]);

  // ── Tier draft helpers ────────────────────────────────────────────────────────
  const updateTierDraft = (
    idx: number,
    field: "name" | "min_points",
    value: string
  ) => {
    setTierDraft((prev) =>
      prev.map((t, i) => (i === idx ? { ...t, [field]: value } : t))
    );
  };

  const addTierRow = () => {
    setTierDraft((prev) => [...prev, { name: "", min_points: "" }]);
  };

  const removeTierRow = (idx: number) => {
    setTierDraft((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── Create reward ─────────────────────────────────────────────────────────────
  const handleCreateReward = useCallback(async () => {
    setError(null);
    setSuccess(null);
    if (!rewardName.trim()) {
      setError(t("loyaltyRewardNameRequiredError"));
      return;
    }
    const cost = parseInt(rewardCost, 10);
    if (isNaN(cost) || cost < 1) {
      setError(t("loyaltyRewardCostValidationError"));
      return;
    }
    if (!businessId) {
      setError(t("loyaltyBusinessNotFoundError"));
      return;
    }
    setCreatingReward(true);
    try {
      await createReward({
        businessId,
        name: rewardName.trim(),
        description: rewardDesc.trim() || undefined,
        costPoints: cost,
      });
      setRewardName("");
      setRewardDesc("");
      setRewardCost("100");
      setShowRewardForm(false);
      setSuccess(t("loyaltyRewardAddedSuccess", { name: rewardName.trim() }));
      await loadAll(businessId);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(t("loyaltyRewardCreateError", { msg }));
    } finally {
      setCreatingReward(false);
    }
  }, [businessId, rewardName, rewardDesc, rewardCost, loadAll, t]);

  // ── Delete reward ─────────────────────────────────────────────────────────────
  const handleDeleteReward = useCallback(
    async (reward: LoyaltyReward) => {
      if (!confirm(t("loyaltyRewardRemoveConfirm", { name: reward.name })))
        return;
      setDeletingReward(reward.id);
      setError(null);
      try {
        await deleteReward(reward.id);
        setRewards((prev) => prev.filter((r) => r.id !== reward.id));
        setSuccess(t("loyaltyRewardRemovedSuccess", { name: reward.name }));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(t("loyaltyRewardDeleteError", { msg }));
      } finally {
        setDeletingReward(null);
      }
    },
    [t]
  );

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 820 }}>
      {/* Page header */}
      <div style={{ marginBottom: "28px" }}>
        <h1
          style={{
            fontSize: "22px",
            fontWeight: 700,
            color: "var(--db-text-primary)",
            marginBottom: "4px",
          }}
        >
          {t("loyaltyPageTitle")}
        </h1>
        <p style={{ fontSize: "14px", color: "var(--db-text-secondary)" }}>
          {t("loyaltySubtitle")}
          {/* TODO(Task 3.x): points are awarded on order completion — wired in checkout */}
        </p>
      </div>

      {/* Alerts */}
      {error && <AlertBanner type="error" message={error} />}
      {success && <AlertBanner type="success" message={success} />}

      {/* Supabase not configured */}
      {!isSupabaseConfigured && (
        <AlertBanner
          type="warning"
          message={t("demoModeSupabaseMessage")}
        />
      )}

      {/* Business not found */}
      {!loadingBiz && isSupabaseConfigured && !businessId && (
        <AlertBanner
          type="warning"
          message={t("loyaltyNoBusinessAlert")}
        />
      )}

      {/* ── Section 1: Earn Rule ───────────────────────────────────────────────── */}
      <Section
        icon={<IconCoin size={18} color="var(--db-accent)" />}
        title={t("loyaltyEarnRuleTitle")}
        subtitle={t("loyaltyEarnRuleSubtitle")}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: "0 0 200px" }}>
            <Label>{t("loyaltyPointsPerDollarLabel")}</Label>
            <TextInput
              type="number"
              value={pointsInput}
              onChange={setPointsInput}
              placeholder={t("loyaltyPointsPlaceholderExample")}
            />
          </div>
          <button
            onClick={handleSaveRule}
            disabled={savingRule || !isSupabaseConfigured}
            style={primaryBtnStyle(savingRule || !isSupabaseConfigured)}
          >
            {savingRule ? t("loyaltySavingState") : t("loyaltySaveRuleButton")}
          </button>
        </div>

        {rule && (
          <p
            style={{
              marginTop: "10px",
              fontSize: "13px",
              color: "var(--db-text-secondary)",
            }}
          >
            {t.rich("loyaltyCurrentRuleText", {
              pts: formatPoints(rule.points_per_dollar),
              strong: (chunks) => (
                <strong style={{ color: "var(--db-accent)" }}>{chunks}</strong>
              ),
            })}
            {/* TODO(Task 3.x): award_points() called in checkout Edge Function */}
          </p>
        )}
      </Section>

      {/* ── Section 2: Member Tiers ───────────────────────────────────────────── */}
      <Section
        icon={<IconStar size={18} color="var(--db-accent)" />}
        title={t("loyaltyMemberTiersTitle")}
        subtitle={t("loyaltyMemberTiersSubtitle")}
      >
        {!editingTiers ? (
          <>
            {tiers.length === 0 ? (
              <p
                style={{ fontSize: "14px", color: "var(--db-text-secondary)" }}
              >
                {t("loyaltyNoTiersMessage")}
              </p>
            ) : (
              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  flexWrap: "wrap",
                  marginBottom: "14px",
                }}
              >
                {tiers.map((tier) => (
                  <TierBadge key={tier.id} tier={tier} />
                ))}
              </div>
            )}
            <button
              onClick={() => {
                setEditingTiers(true);
                setError(null);
                setSuccess(null);
                if (tiers.length > 0) {
                  setTierDraft(
                    tiers.map((t) => ({
                      name: t.name,
                      min_points: String(t.min_points),
                    }))
                  );
                }
              }}
              style={secondaryBtnStyle()}
            >
              <IconEdit size={14} />
              {t("loyaltyEditTiersButton")}
            </button>
          </>
        ) : (
          <div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                marginBottom: "16px",
              }}
            >
              {tierDraft.map((row, idx) => (
                <div
                  key={idx}
                  style={{ display: "flex", gap: "10px", alignItems: "center" }}
                >
                  <div style={{ flex: "1 1 140px" }}>
                    {idx === 0 && <Label>{t("loyaltyTierNameLabel")}</Label>}
                    <TextInput
                      value={row.name}
                      onChange={(v) => updateTierDraft(idx, "name", v)}
                      placeholder={t("loyaltyTierNamePlaceholderExample")}
                    />
                  </div>
                  <div style={{ flex: "1 1 120px" }}>
                    {idx === 0 && <Label>{t("loyaltyMinPointsLabel")}</Label>}
                    <TextInput
                      type="number"
                      value={row.min_points}
                      onChange={(v) => updateTierDraft(idx, "min_points", v)}
                      placeholder="0"
                    />
                  </div>
                  <button
                    onClick={() => removeTierRow(idx)}
                    aria-label={t("loyaltyRemoveTierAria")}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--db-danger)",
                      cursor: "pointer",
                      padding: "4px",
                      marginTop: idx === 0 ? "22px" : "0",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <IconX size={16} />
                  </button>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button onClick={addTierRow} style={secondaryBtnStyle()}>
                <IconPlus size={14} />
                {t("loyaltyAddTierButton")}
              </button>
              <button
                onClick={handleSaveTiers}
                disabled={savingTiers || !isSupabaseConfigured}
                style={primaryBtnStyle(savingTiers || !isSupabaseConfigured)}
              >
                {savingTiers ? t("loyaltySavingState") : t("loyaltySaveTiersButton")}
              </button>
              <button
                onClick={() => {
                  setEditingTiers(false);
                  setError(null);
                }}
                style={cancelBtnStyle()}
              >
                {tCommon("cancel")}
              </button>
            </div>
          </div>
        )}
      </Section>

      {/* ── Section 3: Rewards Catalog ─────────────────────────────────────────── */}
      <Section
        icon={<IconAward size={18} color="var(--db-accent)" />}
        title={t("loyaltyRewardsCatalogTitle")}
        subtitle={t("loyaltyRewardsCatalogSubtitle")}
      >
        {/* Add reward button */}
        {!showRewardForm && (
          <button
            onClick={() => {
              setShowRewardForm(true);
              setError(null);
              setSuccess(null);
            }}
            style={{ ...secondaryBtnStyle(), marginBottom: "16px" }}
          >
            <IconPlus size={14} />
            {t("loyaltyAddRewardButton")}
          </button>
        )}

        {/* Reward creation form */}
        {showRewardForm && (
          <div
            style={{
              background: "var(--db-bg-surface)",
              border: "1px solid var(--db-border)",
              borderRadius: "var(--db-radius-card)",
              padding: "20px",
              marginBottom: "20px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "16px",
              }}
            >
              <h3
                style={{
                  fontSize: "15px",
                  fontWeight: 600,
                  color: "var(--db-text-primary)",
                }}
              >
                {t("loyaltyNewRewardFormTitle")}
              </h3>
              <button
                onClick={() => {
                  setShowRewardForm(false);
                  setRewardName("");
                  setRewardDesc("");
                  setRewardCost("100");
                  setError(null);
                }}
                aria-label={tCommon("cancel")}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--db-text-tertiary)",
                  cursor: "pointer",
                  padding: "4px",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <IconX size={18} />
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "14px",
              }}
            >
              <div style={{ gridColumn: "1 / -1" }}>
                <Label>{t("loyaltyRewardNameLabel")}</Label>
                <TextInput
                  value={rewardName}
                  onChange={setRewardName}
                  placeholder={t("loyaltyRewardNamePlaceholderExample")}
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <Label>{t("loyaltyRewardDescriptionLabel")}</Label>
                <TextInput
                  value={rewardDesc}
                  onChange={setRewardDesc}
                  placeholder={t("loyaltyRewardDescPlaceholderExample")}
                />
              </div>
              <div>
                <Label>{t("loyaltyRewardCostLabel")}</Label>
                <TextInput
                  type="number"
                  value={rewardCost}
                  onChange={setRewardCost}
                  placeholder="100"
                />
              </div>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
                marginTop: "16px",
              }}
            >
              <button
                onClick={() => {
                  setShowRewardForm(false);
                  setError(null);
                }}
                style={cancelBtnStyle()}
              >
                {tCommon("cancel")}
              </button>
              <button
                onClick={handleCreateReward}
                disabled={creatingReward || !isSupabaseConfigured}
                style={primaryBtnStyle(creatingReward || !isSupabaseConfigured)}
              >
                {creatingReward ? t("loyaltyAddingRewardState") : t("loyaltyAddRewardButton")}
              </button>
            </div>
          </div>
        )}

        {/* Rewards list */}
        {rewards.length === 0 ? (
          <p style={{ fontSize: "14px", color: "var(--db-text-secondary)" }}>
            {t("loyaltyNoRewardsMessage")}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {rewards.map((reward) => (
              <RewardRow
                key={reward.id}
                reward={reward}
                isDeleting={deletingReward === reward.id}
                onDelete={handleDeleteReward}
              />
            ))}
          </div>
        )}

        {/* TODO(Task 3.5): redemption flow — when user selects a reward in checkout,
            discount is applied server-side and points deducted via redeemReward() */}
      </Section>
    </div>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────────────

function Section({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--db-bg-surface)",
        border: "1px solid var(--db-border)",
        borderRadius: "var(--db-radius-card)",
        padding: "24px",
        marginBottom: "20px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "6px",
        }}
      >
        {icon}
        <h2
          style={{
            fontSize: "16px",
            fontWeight: 600,
            color: "var(--db-text-primary)",
          }}
        >
          {title}
        </h2>
      </div>
      <p
        style={{
          fontSize: "13px",
          color: "var(--db-text-secondary)",
          marginBottom: "20px",
        }}
      >
        {subtitle}
      </p>
      {children}
    </div>
  );
}

// ── Tier badge ─────────────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: LoyaltyTier }) {
  const t = useTranslations("dashboardCommon");
  return (
    <div
      style={{
        background: "var(--db-bg-elevated)",
        border: "1px solid var(--db-border)",
        borderRadius: "var(--db-radius)",
        padding: "10px 16px",
        minWidth: "130px",
      }}
    >
      <div
        style={{
          fontSize: "13px",
          fontWeight: 700,
          color: "var(--db-accent)",
          marginBottom: "2px",
        }}
      >
        {tier.name}
      </div>
      <div style={{ fontSize: "12px", color: "var(--db-text-tertiary)" }}>
        {tier.min_points === 0
          ? t("loyaltyStartingTierBadge")
          : t("loyaltyTierPointsThreshold", { points: formatPoints(tier.min_points) })}
      </div>
    </div>
  );
}

// ── Reward row ─────────────────────────────────────────────────────────────────

function RewardRow({
  reward,
  isDeleting,
  onDelete,
}: {
  reward: LoyaltyReward;
  isDeleting: boolean;
  onDelete: (r: LoyaltyReward) => void;
}) {
  const t = useTranslations("dashboardCommon");
  return (
    <div
      style={{
        background: "var(--db-bg-elevated)",
        border: "1px solid var(--db-border)",
        borderRadius: "var(--db-radius-card)",
        padding: "14px 18px",
        display: "flex",
        alignItems: "center",
        gap: "14px",
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: "var(--db-radius)",
          background: "var(--db-accent-bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <IconAward size={18} color="var(--db-accent)" />
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: "14px",
            fontWeight: 600,
            color: "var(--db-text-primary)",
            marginBottom: "2px",
          }}
        >
          {reward.name}
        </div>
        {reward.description && (
          <div
            style={{
              fontSize: "12px",
              color: "var(--db-text-secondary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {reward.description}
          </div>
        )}
      </div>

      {/* Cost badge */}
      <div
        style={{
          padding: "4px 10px",
          borderRadius: "999px",
          background: "var(--db-accent-bg)",
          color: "var(--db-accent)",
          fontSize: "12px",
          fontWeight: 700,
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {t("loyaltyRewardCostBadge", { points: formatPoints(reward.cost_points) })}
      </div>

      {/* Delete */}
      <button
        onClick={() => onDelete(reward)}
        disabled={isDeleting}
        aria-label={t("loyaltyRemoveRewardAria", { name: reward.name })}
        style={{
          background: "none",
          border: "none",
          color: isDeleting ? "var(--db-text-tertiary)" : "var(--db-danger)",
          cursor: isDeleting ? "not-allowed" : "pointer",
          padding: "4px",
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        <IconTrash size={16} />
      </button>
    </div>
  );
}

// ── Button style helpers — zero hardcoded hex ──────────────────────────────────

function primaryBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "9px 18px",
    borderRadius: "var(--db-radius)",
    border: "none",
    background: disabled ? "var(--db-text-tertiary)" : "var(--db-accent)",
    color: "var(--db-accent-text)",
    fontSize: "14px",
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    whiteSpace: "nowrap" as const,
  };
}

function secondaryBtnStyle(): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "8px 14px",
    borderRadius: "var(--db-radius)",
    border: "1px solid var(--db-border)",
    background: "transparent",
    color: "var(--db-text-secondary)",
    fontSize: "14px",
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  };
}

function cancelBtnStyle(): React.CSSProperties {
  return {
    padding: "8px 16px",
    borderRadius: "var(--db-radius)",
    border: "1px solid var(--db-border)",
    background: "transparent",
    color: "var(--db-text-secondary)",
    fontSize: "14px",
    cursor: "pointer",
  };
}
