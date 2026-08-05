"use client";

/**
 * JChat 3.0 — Super Admin: Panel de Afiliados (Pasada A)
 *
 * Sección ①  Afiliados  — lista, crear, editar, toggle payouts_held
 * Sección ②  Asignar    — buscar usuario y asignar/quitar afiliado
 * Sección ③  Ajustes    — clawback_days, toggles globales, planes comisionables
 *
 * Pasada B (comisiones/pagos) es independiente — NO incluida aquí.
 */

import React, { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  IconLoader2,
  IconAlertCircle,
  IconX,
  IconRefresh,
  IconCheck,
  IconEdit,
  IconUserPlus,
  IconAffiliate,
  IconSearch,
  IconSettings,
  IconBan,
  IconTrash,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// Tables / RPCs / columns added after the last `supabase gen types` run are
// not in the generated schema yet. Cast once so callers stay readable.
// Remove this cast once `supabase gen types` picks up: affiliates,
// affiliate_commissions, platform_config.affiliate_*, users.referred_by_affiliate_id.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// ── Types ──────────────────────────────────────────────────────────────────────

interface AffiliateSummary {
  id: string;
  affiliate_number: string;
  name: string;
  email: string | null;
  phone: string | null;
  commission_pct: number;
  status: "active" | "suspended" | "terminated";
  payouts_held: boolean;
  referred_users: number;
  waiting_cents: number;
  ready_cents: number;
  paid_cents: number;
  reversed_cents: number;
  last_payout_at: string | null;
}

interface UserRow {
  id: string;
  username: string | null;
  display_name: string | null;
  referred_by_affiliate_id: string | null;
}

interface PlatformConfig {
  affiliate_program_enabled: boolean;
  affiliate_payouts_enabled: boolean;
  affiliate_clawback_days: number;
  affiliate_commissionable_plans: string[];
}

type AffiliateStatus = "active" | "suspended" | "terminated";

// ── Shared helpers (same shape as promo-codes) ─────────────────────────────────

function Banner({
  type,
  message,
  onDismiss,
}: {
  type: "error" | "success" | "warning";
  message: string;
  onDismiss?: () => void;
}) {
  const color =
    type === "error"
      ? "var(--color-danger)"
      : type === "success"
        ? "var(--color-success)"
        : "var(--color-warning)";
  const bg =
    type === "error"
      ? "rgba(239,68,68,0.08)"
      : type === "success"
        ? "rgba(29,158,117,0.08)"
        : "rgba(245,158,11,0.08)";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "10px 14px",
        borderRadius: 8,
        background: bg,
        border: `1px solid ${color}`,
        color,
        fontSize: 13,
        marginBottom: 14,
      }}
    >
      <IconAlertCircle size={15} stroke={1.6} style={{ flexShrink: 0, marginTop: 1 }} />
      <span style={{ flex: 1 }}>{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          style={{ background: "none", border: "none", cursor: "pointer", color, display: "flex" }}
        >
          <IconX size={14} stroke={2} />
        </button>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{label}</span>
      {children}
    </label>
  );
}

function IconBtn({
  title,
  onClick,
  disabled,
  icon: Icon,
  color,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 30,
        height: 30,
        borderRadius: 8,
        border: "1px solid var(--border-subtle)",
        background: "transparent",
        color,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Icon size={15} stroke={1.8} />
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--border-subtle)",
  background: "var(--bg-base)",
  color: "var(--text-primary)",
  fontSize: 13,
};

function primaryBtn(busy: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "9px 16px",
    borderRadius: 8,
    border: "none",
    background: busy ? "var(--text-tertiary)" : "var(--color-brand)",
    color: "var(--bg-surface-light)",
    fontSize: 13,
    fontWeight: 600,
    cursor: busy ? "not-allowed" : "pointer",
    height: 38,
  };
}

// ── StatusPill ─────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<AffiliateStatus, string> = {
  active: "var(--color-success)",
  suspended: "var(--color-warning)",
  terminated: "var(--color-danger)",
};

function StatusPill({ status, label }: { status: AffiliateStatus; label: string }) {
  const color = STATUS_COLORS[status];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 9px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 700,
        color,
        border: `1px solid ${color}`,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

// ── Section header ─────────────────────────────────────────────────────────────

function SectionTitle({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
      <Icon size={16} stroke={1.8} style={{ color: "var(--color-brand)" }} />
      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{label}</span>
    </div>
  );
}

// ── AffiliateForm (create / edit) ──────────────────────────────────────────────

interface AffiliateFormState {
  affiliate_number: string;
  name: string;
  email: string;
  phone: string;
  commission_pct: string;
  notes: string;
  status: AffiliateStatus;
}

function emptyForm(): AffiliateFormState {
  return { affiliate_number: "", name: "", email: "", phone: "", commission_pct: "10", notes: "", status: "active" };
}

function affiliateToForm(a: AffiliateSummary): AffiliateFormState {
  return {
    affiliate_number: a.affiliate_number,
    name: a.name,
    email: a.email ?? "",
    phone: a.phone ?? "",
    commission_pct: String(a.commission_pct),
    notes: "",
    status: a.status,
  };
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AfiliadosPage() {
  const t = useTranslations("superAdmin");

  // ① Affiliates
  const [affiliates, setAffiliates] = useState<AffiliateSummary[]>([]);
  const [loadingAff, setLoadingAff] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AffiliateFormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // ② Assign
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<UserRow[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [assignBusy, setAssignBusy] = useState<string | null>(null); // user id
  const [assignAffiliateId, setAssignAffiliateId] = useState<Record<string, string>>({}); // user id → selected affiliate id
  const [assignError, setAssignError] = useState<string | null>(null);

  // ③ Settings
  const [cfg, setCfg] = useState<PlatformConfig | null>(null);
  const [loadingCfg, setLoadingCfg] = useState(true);
  const [cfgError, setCfgError] = useState<string | null>(null);
  const [savingCfg, setSavingCfg] = useState(false);
  const [clawbackDays, setClawbackDays] = useState("30");
  const [programEnabled, setProgramEnabled] = useState(true);
  const [payoutsEnabled, setPayoutsEnabled] = useState(true);
  const [commissionablePlans, setCommissionablePlans] = useState<string[]>([]);

  // ── Fetch affiliates ─────────────────────────────────────────────────────────

  const fetchAffiliates = useCallback(async () => {
    if (!isSupabaseConfigured) { setAffiliates([]); setLoadingAff(false); return; }
    setLoadingAff(true);
    setFetchError(null);
    const { data, error } = await db.rpc("affiliate_summary");
    if (error) { setFetchError(error.message); setLoadingAff(false); return; }
    setAffiliates((data ?? []) as AffiliateSummary[]);
    setLoadingAff(false);
  }, []);

  useEffect(() => { void fetchAffiliates(); }, [fetchAffiliates]);

  // ── Fetch platform config ────────────────────────────────────────────────────

  const fetchConfig = useCallback(async () => {
    if (!isSupabaseConfigured) { setLoadingCfg(false); return; }
    setLoadingCfg(true);
    const { data, error } = await db
      .from("platform_config")
      .select("affiliate_program_enabled, affiliate_payouts_enabled, affiliate_clawback_days, affiliate_commissionable_plans")
      .eq("id", true)
      .maybeSingle();
    if (error) { setCfgError(error.message); setLoadingCfg(false); return; }
    if (data) {
      const c = data as unknown as PlatformConfig;
      setCfg(c);
      setProgramEnabled(c.affiliate_program_enabled);
      setPayoutsEnabled(c.affiliate_payouts_enabled);
      setClawbackDays(String(c.affiliate_clawback_days ?? 30));
      setCommissionablePlans(c.affiliate_commissionable_plans ?? []);
    }
    setLoadingCfg(false);
  }, []);

  useEffect(() => { void fetchConfig(); }, [fetchConfig]);

  // ── Create / edit affiliate ──────────────────────────────────────────────────

  const openCreate = useCallback(() => {
    setEditingId(null);
    setForm(emptyForm());
    setActionError(null);
    setShowForm(true);
  }, []);

  const openEdit = useCallback((a: AffiliateSummary) => {
    setEditingId(a.id);
    setForm(affiliateToForm(a));
    setActionError(null);
    setShowForm(true);
  }, []);

  const closeForm = useCallback(() => { setShowForm(false); setEditingId(null); }, []);

  const handleSave = useCallback(async () => {
    setActionError(null);
    const pct = parseFloat(form.commission_pct);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      setActionError(t("affiliates.validationPct"));
      return;
    }
    if (!form.name.trim()) {
      setActionError(t("affiliates.validationName"));
      return;
    }
    setSaving(true);

    // `created_by` is NOT NULL in the affiliates table — pass the current admin's id.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); setActionError("Session expired — please refresh."); return; }

    const payload = {
      affiliate_number: form.affiliate_number.trim() || undefined,
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      commission_pct: pct,
      notes: form.notes.trim() || null,
      ...(editingId ? { status: form.status } : { created_by: user.id }),
    };

    if (editingId) {
      const { error } = await db.from("affiliates").update(payload).eq("id", editingId);
      setSaving(false);
      if (error) { setActionError(error.message); return; }
    } else {
      const { error } = await db.from("affiliates").insert(payload);
      setSaving(false);
      if (error) {
        if ((error as { code?: string }).code === "23505") {
          setActionError(t("affiliates.numberTaken"));
        } else {
          setActionError(error.message);
        }
        return;
      }
    }
    setShowForm(false);
    setEditingId(null);
    await fetchAffiliates();
  }, [form, editingId, fetchAffiliates, t]);

  // ── Toggle payouts_held ──────────────────────────────────────────────────────

  const togglePayoutsHeld = useCallback(async (a: AffiliateSummary) => {
    setActionError(null);
    setBusyId(a.id);
    const { error } = await db
      .from("affiliates")
      .update({ payouts_held: !a.payouts_held })
      .eq("id", a.id);
    setBusyId(null);
    if (error) { setActionError(error.message); return; }
    await fetchAffiliates();
  }, [fetchAffiliates]);

  // ── Search users ─────────────────────────────────────────────────────────────

  const searchUsers = useCallback(async () => {
    if (!userQuery.trim()) return;
    setSearchingUsers(true);
    setAssignError(null);
    const { data, error } = await db
      .from("users")
      .select("id, username, display_name, referred_by_affiliate_id")
      .ilike("username", `%${userQuery.trim()}%`)
      .limit(20);
    setSearchingUsers(false);
    if (error) { setAssignError(error.message); return; }
    setUserResults((data ?? []) as UserRow[]);
  }, [userQuery]);

  // ── Assign / remove affiliate ────────────────────────────────────────────────

  const assignAffiliate = useCallback(async (userId: string, affiliateId: string | null) => {
    setAssignError(null);
    setAssignBusy(userId);
    const { error } = await db.rpc("assign_affiliate_to_user", {
      p_user_id: userId,
      p_affiliate_id: affiliateId,
    });
    setAssignBusy(null);
    if (error) { setAssignError(error.message); return; }
    // Update local state optimistically
    setUserResults((prev) =>
      prev.map((u) =>
        u.id === userId ? { ...u, referred_by_affiliate_id: affiliateId } : u,
      ),
    );
  }, []);

  // ── Save platform config ─────────────────────────────────────────────────────

  const saveConfig = useCallback(async () => {
    setCfgError(null);
    const days = parseInt(clawbackDays, 10);
    if (isNaN(days) || days < 0) {
      setCfgError(t("affiliates.validationClawbackDays"));
      return;
    }
    setSavingCfg(true);
    const { error } = await db
      .from("platform_config")
      .update({
        affiliate_program_enabled: programEnabled,
        affiliate_payouts_enabled: payoutsEnabled,
        affiliate_clawback_days: days,
        affiliate_commissionable_plans: commissionablePlans,
      })
      .eq("id", true);
    setSavingCfg(false);
    if (error) { setCfgError(error.message); return; }
    await fetchConfig();
  }, [clawbackDays, programEnabled, payoutsEnabled, commissionablePlans, fetchConfig, t]);

  const togglePlan = useCallback((plan: string) => {
    setCommissionablePlans((prev) =>
      prev.includes(plan) ? prev.filter((p) => p !== plan) : [...prev, plan],
    );
  }, []);

  // ── Status label helper ──────────────────────────────────────────────────────

  const statusLabel = (s: AffiliateStatus) => {
    if (s === "active") return t("affiliates.statusActive");
    if (s === "suspended") return t("affiliates.statusSuspended");
    return t("affiliates.statusTerminated");
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 980 }}>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <IconAffiliate size={22} stroke={1.6} style={{ color: "var(--color-brand)" }} />
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
          {t("affiliates.title")}
        </h1>
      </div>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 22px" }}>
        {t("affiliates.subtitle")}
      </p>

      {!isSupabaseConfigured && <Banner type="warning" message={t("affiliates.demoBanner")} />}
      {fetchError && <Banner type="error" message={fetchError} />}
      {actionError && <Banner type="error" message={actionError} onDismiss={() => setActionError(null)} />}

      {/* ════════════════ SECCIÓN ① AFILIADOS ══════════════════════════════════ */}
      <div
        style={{
          border: "1px solid var(--border-subtle)",
          borderRadius: 12,
          background: "var(--bg-surface)",
          padding: 18,
          marginBottom: 22,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <SectionTitle icon={IconAffiliate} label={t("affiliates.sectionAffiliates")} />
          <button onClick={openCreate} style={primaryBtn(false)}>
            <IconUserPlus size={15} stroke={2} />
            {t("affiliates.createButton")}
          </button>
        </div>

        {/* Form (create / edit) */}
        {showForm && (
          <div
            style={{
              padding: 16,
              borderRadius: 10,
              background: "var(--bg-base)",
              border: "1px solid var(--border-subtle)",
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>
              {editingId ? t("affiliates.formTitleEdit") : t("affiliates.formTitleCreate")}
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              {!editingId && (
                <Field label={t("affiliates.fieldNumber")}>
                  <input
                    type="text"
                    placeholder={t("affiliates.fieldNumberPlaceholder")}
                    value={form.affiliate_number}
                    onChange={(e) => setForm((f) => ({ ...f, affiliate_number: e.target.value }))}
                    style={{ ...inputStyle, width: 120 }}
                  />
                </Field>
              )}
              <Field label={t("affiliates.fieldName")}>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  style={{ ...inputStyle, width: 200 }}
                />
              </Field>
              <Field label={t("affiliates.fieldEmail")}>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  style={{ ...inputStyle, width: 200 }}
                />
              </Field>
              <Field label={t("affiliates.fieldPhone")}>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  style={{ ...inputStyle, width: 140 }}
                />
              </Field>
              <Field label={t("affiliates.fieldCommissionPct")}>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={form.commission_pct}
                  onChange={(e) => setForm((f) => ({ ...f, commission_pct: e.target.value }))}
                  style={{ ...inputStyle, width: 90 }}
                />
              </Field>
              {editingId && (
                <Field label={t("affiliates.fieldStatus")}>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as AffiliateStatus }))}
                    style={inputStyle}
                  >
                    <option value="active">{t("affiliates.statusActive")}</option>
                    <option value="suspended">{t("affiliates.statusSuspended")}</option>
                    <option value="terminated">{t("affiliates.statusTerminated")}</option>
                  </select>
                </Field>
              )}
              <Field label={t("affiliates.fieldNotes")}>
                <input
                  type="text"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  style={{ ...inputStyle, width: 200 }}
                />
              </Field>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button onClick={() => void handleSave()} disabled={saving} style={primaryBtn(saving)}>
                {saving ? (
                  <IconLoader2 size={15} stroke={2} style={{ animation: "spin 1s linear infinite" }} />
                ) : (
                  <IconCheck size={15} stroke={2} />
                )}
                {saving ? t("affiliates.savingState") : t("affiliates.saveButton")}
              </button>
              <button
                onClick={closeForm}
                style={{ ...inputStyle, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}
              >
                <IconX size={14} stroke={2} />
                {t("affiliates.cancelButton")}
              </button>
            </div>
          </div>
        )}

        {/* List */}
        {loadingAff ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
            <IconLoader2 size={24} stroke={1.6} style={{ color: "var(--color-brand)", animation: "spin 1s linear infinite" }} />
          </div>
        ) : affiliates.length === 0 ? (
          <div
            style={{
              padding: "40px 24px",
              border: "1px dashed var(--border-subtle)",
              borderRadius: 10,
              textAlign: "center",
              color: "var(--text-secondary)",
              fontSize: 14,
            }}
          >
            {t("affiliates.emptyState")}
          </div>
        ) : (
          <div style={{ border: "1px solid var(--border-subtle)", borderRadius: 10, overflow: "hidden" }}>
            {affiliates.map((a, i) => (
              <div
                key={a.id}
                style={{
                  borderBottom: i === affiliates.length - 1 ? "none" : "1px solid var(--border-subtle)",
                  background: "var(--bg-surface)",
                  padding: "14px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                  rowGap: 10,
                }}
              >
                {/* Number + name */}
                <div style={{ flex: "1 1 180px", minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                    #{a.affiliate_number} · {a.name}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
                    {a.email ?? "—"}{a.phone ? ` · ${a.phone}` : ""}
                  </div>
                </div>

                {/* Commission + referred */}
                <div style={{ flex: "1 1 120px", fontSize: 12, color: "var(--text-secondary)" }}>
                  <div style={{ fontWeight: 700, color: "var(--color-brand)", fontSize: 14 }}>
                    {a.commission_pct}%
                  </div>
                  <div style={{ marginTop: 2 }}>
                    {t("affiliates.referredCount", { count: a.referred_users })}
                  </div>
                </div>

                {/* Status pill + payouts_held indicator + actions */}
                <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <StatusPill status={a.status} label={statusLabel(a.status)} />

                  {a.payouts_held && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "var(--color-warning)",
                        border: "1px solid var(--color-warning)",
                        borderRadius: 20,
                        padding: "3px 9px",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {t("affiliates.payoutsHeldBadge")}
                    </span>
                  )}

                  <div style={{ display: "flex", gap: 4 }}>
                    <IconBtn
                      title={t("affiliates.editTooltip")}
                      onClick={() => openEdit(a)}
                      icon={IconEdit}
                      color="var(--color-brand)"
                    />
                    <IconBtn
                      title={a.payouts_held ? t("affiliates.resumePayoutsTooltip") : t("affiliates.holdPayoutsTooltip")}
                      onClick={() => void togglePayoutsHeld(a)}
                      disabled={busyId === a.id}
                      icon={a.payouts_held ? IconCheck : IconBan}
                      color={a.payouts_held ? "var(--color-success)" : "var(--color-warning)"}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ════════════════ SECCIÓN ② ASIGNAR ════════════════════════════════════ */}
      <div
        style={{
          border: "1px solid var(--border-subtle)",
          borderRadius: 12,
          background: "var(--bg-surface)",
          padding: 18,
          marginBottom: 22,
        }}
      >
        <SectionTitle icon={IconSearch} label={t("affiliates.sectionAssign")} />
        {assignError && <Banner type="error" message={assignError} onDismiss={() => setAssignError(null)} />}

        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap" }}>
          <Field label={t("affiliates.searchUserLabel")}>
            <input
              type="text"
              placeholder={t("affiliates.searchUserPlaceholder")}
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void searchUsers(); }}
              style={{ ...inputStyle, width: 240 }}
            />
          </Field>
          <button onClick={() => void searchUsers()} disabled={searchingUsers} style={primaryBtn(searchingUsers)}>
            {searchingUsers
              ? <IconLoader2 size={15} stroke={2} style={{ animation: "spin 1s linear infinite" }} />
              : <IconSearch size={15} stroke={2} />}
            {t("affiliates.searchButton")}
          </button>
        </div>

        {userResults.length > 0 && (
          <div style={{ border: "1px solid var(--border-subtle)", borderRadius: 10, overflow: "hidden" }}>
            {userResults.map((u, i) => {
              const currentAff = affiliates.find((a) => a.id === u.referred_by_affiliate_id);
              const selectedId = assignAffiliateId[u.id] ?? u.referred_by_affiliate_id ?? "";
              return (
                <div
                  key={u.id}
                  style={{
                    borderBottom: i === userResults.length - 1 ? "none" : "1px solid var(--border-subtle)",
                    background: "var(--bg-surface)",
                    padding: "12px 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                    rowGap: 8,
                  }}
                >
                  <div style={{ flex: "1 1 180px" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                      @{u.username ?? "—"}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
                      {u.display_name ?? ""}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", flex: "1 1 140px" }}>
                    {currentAff
                      ? t("affiliates.currentAffiliate", { name: currentAff.name })
                      : t("affiliates.noAffiliate")}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flex: "0 0 auto" }}>
                    <select
                      value={selectedId}
                      onChange={(e) =>
                        setAssignAffiliateId((prev) => ({ ...prev, [u.id]: e.target.value }))
                      }
                      style={{ ...inputStyle, minWidth: 160 }}
                    >
                      <option value="">{t("affiliates.selectAffiliate")}</option>
                      {affiliates
                        .filter((a) => a.status === "active")
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            #{a.affiliate_number} {a.name}
                          </option>
                        ))}
                    </select>
                    <button
                      disabled={!selectedId || assignBusy === u.id}
                      onClick={() => void assignAffiliate(u.id, selectedId || null)}
                      style={primaryBtn(!selectedId || assignBusy === u.id)}
                    >
                      {assignBusy === u.id
                        ? <IconLoader2 size={14} stroke={2} style={{ animation: "spin 1s linear infinite" }} />
                        : <IconCheck size={14} stroke={2} />}
                      {t("affiliates.assignButton")}
                    </button>
                    {u.referred_by_affiliate_id && (
                      <IconBtn
                        title={t("affiliates.removeAssignmentTooltip")}
                        onClick={() => void assignAffiliate(u.id, null)}
                        disabled={assignBusy === u.id}
                        icon={IconTrash}
                        color="var(--color-danger)"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {userResults.length === 0 && userQuery && !searchingUsers && (
          <div
            style={{
              padding: "24px",
              textAlign: "center",
              color: "var(--text-secondary)",
              fontSize: 13,
              border: "1px dashed var(--border-subtle)",
              borderRadius: 10,
            }}
          >
            {t("affiliates.noUsersFound")}
          </div>
        )}
      </div>

      {/* ════════════════ SECCIÓN ③ AJUSTES ════════════════════════════════════ */}
      <div
        style={{
          border: "1px solid var(--border-subtle)",
          borderRadius: 12,
          background: "var(--bg-surface)",
          padding: 18,
          marginBottom: 22,
        }}
      >
        <SectionTitle icon={IconSettings} label={t("affiliates.sectionSettings")} />
        {cfgError && <Banner type="error" message={cfgError} onDismiss={() => setCfgError(null)} />}

        {loadingCfg ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
            <IconLoader2 size={22} stroke={1.6} style={{ color: "var(--color-brand)", animation: "spin 1s linear infinite" }} />
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Clawback days */}
            <div>
              <Field label={t("affiliates.clawbackDaysLabel")}>
                <input
                  type="number"
                  min={0}
                  value={clawbackDays}
                  onChange={(e) => setClawbackDays(e.target.value)}
                  style={{ ...inputStyle, width: 100 }}
                />
              </Field>
              <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 6 }}>
                {t("affiliates.clawbackHelp")}
              </p>
            </div>

            {/* Global toggles */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                {t("affiliates.globalPausesTitle")}
              </div>
              <ToggleRow
                label={t("affiliates.programEnabledLabel")}
                checked={programEnabled}
                onChange={setProgramEnabled}
              />
              <ToggleRow
                label={t("affiliates.payoutsEnabledLabel")}
                checked={payoutsEnabled}
                onChange={setPayoutsEnabled}
              />
            </div>

            {/* Commissionable plans */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10 }}>
                {t("affiliates.commissionablePlansTitle")}
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {(["business", "pro", "verified"] as const).map((plan) => (
                  <label
                    key={plan}
                    style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "var(--text-primary)" }}
                  >
                    <input
                      type="checkbox"
                      checked={commissionablePlans.includes(plan)}
                      onChange={() => togglePlan(plan)}
                      style={{ accentColor: "var(--color-brand)" }}
                    />
                    <span style={{ textTransform: "capitalize" }}>{plan}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Save button */}
            <div>
              <button onClick={() => void saveConfig()} disabled={savingCfg} style={primaryBtn(savingCfg)}>
                {savingCfg
                  ? <IconLoader2 size={15} stroke={2} style={{ animation: "spin 1s linear infinite" }} />
                  : <IconCheck size={15} stroke={2} />}
                {savingCfg ? t("affiliates.savingState") : t("affiliates.saveSettingsButton")}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Refresh */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <IconBtn
          title={t("affiliates.refreshTooltip")}
          onClick={() => { void fetchAffiliates(); void fetchConfig(); }}
          icon={IconRefresh}
          color="var(--text-secondary)"
        />
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── ToggleRow ──────────────────────────────────────────────────────────────────

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        cursor: "pointer",
        fontSize: 13,
        color: "var(--text-primary)",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: "var(--color-brand)", width: 16, height: 16 }}
      />
      {label}
    </label>
  );
}
