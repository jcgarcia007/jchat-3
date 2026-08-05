"use client";

/**
 * JChat 3.0 — Super Admin: Panel de Afiliados (Pasada A + B)
 *
 * Sección ①  Afiliados       — lista+CRUD, badge fiscal, fix A (número oblig.) /B (notas) /C (confirmar terminate)
 * Sección B  Comisiones       — buckets por afiliado, detalle, pagos grupales
 * Sección ②  Asignar usuario  — buscar y asignar afiliado a user
 * Sección ③  Ajustes          — clawback, toggles globales, planes
 * Sección 1099 — reporte anual de referencia
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
  IconChevronDown,
  IconChevronUp,
  IconCreditCard,
  IconFileText,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

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
  tax_form_type: "w9" | "w8ben" | null;
  tax_form_on_file: boolean;
}

interface AffiliateCommission {
  id: string;
  commission_amount_cents: number;
  base_amount_cents: number;
  commission_pct: number;
  currency: string;
  status: "pending" | "approved" | "paid" | "reversed" | "void";
  reversed_reason: string | null;
  created_at: string;
  user_id: string;
}

interface YearlyPayout {
  affiliate_id: string;
  affiliate_number: string;
  name: string;
  tax_form_type: "w9" | "w8ben" | null;
  tax_form_on_file: boolean;
  total_paid_cents: number;
  payout_count: number;
  currency: string;
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

interface AffiliateFormState {
  affiliate_number: string;
  name: string;
  email: string;
  phone: string;
  commission_pct: string;
  notes: string;
  status: AffiliateStatus;
  tax_form_type: "none" | "w9" | "w8ben";
  tax_form_on_file: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatMoney(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function emptyForm(): AffiliateFormState {
  return {
    affiliate_number: "",
    name: "",
    email: "",
    phone: "",
    commission_pct: "10",
    notes: "",
    status: "active",
    tax_form_type: "none",
    tax_form_on_file: false,
  };
}

function affiliateToForm(a: AffiliateSummary): AffiliateFormState {
  return {
    affiliate_number: a.affiliate_number,
    name: a.name,
    email: a.email ?? "",
    phone: a.phone ?? "",
    commission_pct: String(a.commission_pct),
    notes: "", // loaded separately via openEdit fetch
    status: a.status,
    tax_form_type: a.tax_form_type ?? "none",
    tax_form_on_file: a.tax_form_on_file,
  };
}

// ── Shared UI ─────────────────────────────────────────────────────────────────

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

const STATUS_COLORS: Record<AffiliateStatus, string> = {
  active: "var(--color-success)",
  suspended: "var(--color-warning)",
  terminated: "var(--color-danger)",
};

const COMM_STATUS_COLORS: Record<string, string> = {
  pending: "var(--color-warning)",
  approved: "var(--color-brand)",
  paid: "var(--color-success)",
  reversed: "var(--color-danger)",
  void: "var(--text-tertiary)",
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

function CommPill({ status, label }: { status: string; label: string }) {
  const color = COMM_STATUS_COLORS[status] ?? "var(--text-tertiary)";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 7px",
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

function SectionTitle({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
      <Icon size={16} stroke={1.8} style={{ color: "var(--color-brand)" }} />
      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{label}</span>
    </div>
  );
}

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

  // B Commissions
  const [openDetailId, setOpenDetailId] = useState<string | null>(null);
  const [detailComms, setDetailComms] = useState<AffiliateCommission[]>([]);
  const [detailUsers, setDetailUsers] = useState<Record<string, string>>({});
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [selectedCommIds, setSelectedCommIds] = useState<Set<string>>(new Set());
  const [showPayForm, setShowPayForm] = useState(false);
  const [payMethod, setPayMethod] = useState("");
  const [payReference, setPayReference] = useState("");
  const [payNote, setPayNote] = useState("");
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [paySuccess, setPaySuccess] = useState(false);

  // ② Assign
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<UserRow[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [assignBusy, setAssignBusy] = useState<string | null>(null);
  const [assignAffiliateId, setAssignAffiliateId] = useState<Record<string, string>>({});
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

  // 1099
  const [yearlyYear, setYearlyYear] = useState(String(new Date().getFullYear()));
  const [yearlyData, setYearlyData] = useState<YearlyPayout[]>([]);
  const [loadingYearly, setLoadingYearly] = useState(false);
  const [yearlyError, setYearlyError] = useState<string | null>(null);

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

  // ── Commission detail ────────────────────────────────────────────────────────

  const fetchCommissionDetail = useCallback(async (affiliateId: string) => {
    if (!isSupabaseConfigured) return;
    setLoadingDetail(true);
    setDetailError(null);
    setDetailComms([]);
    setDetailUsers({});
    setSelectedCommIds(new Set());
    setShowPayForm(false);
    setPayError(null);
    setPaySuccess(false);

    const { data, error } = await db
      .from("affiliate_commissions")
      .select("id, commission_amount_cents, base_amount_cents, commission_pct, currency, status, reversed_reason, created_at, user_id")
      .eq("affiliate_id", affiliateId)
      .order("created_at", { ascending: false });

    if (error) { setDetailError(error.message); setLoadingDetail(false); return; }

    const comms = (data ?? []) as AffiliateCommission[];
    setDetailComms(comms);

    // Resolve usernames
    const userIds = [...new Set(comms.map((c) => c.user_id).filter(Boolean))];
    if (userIds.length > 0) {
      const { data: users } = await db
        .from("users")
        .select("id, username")
        .in("id", userIds);
      const map: Record<string, string> = {};
      ((users ?? []) as { id: string; username: string | null }[]).forEach(
        (u) => { map[u.id] = u.username ?? u.id.slice(0, 8); }
      );
      setDetailUsers(map);
    }

    setLoadingDetail(false);
  }, []);

  useEffect(() => {
    if (openDetailId) void fetchCommissionDetail(openDetailId);
  }, [openDetailId, fetchCommissionDetail]);

  // ── Payout error mapping ─────────────────────────────────────────────────────

  const mapPayoutError = useCallback(
    (msg: string): string => {
      const m = msg.toLowerCase();
      if (m.includes("globally paused")) return t("affiliates.errorPayoutsGloballyPaused");
      if (m.includes("payouts held")) return t("affiliates.errorPayoutsHeld");
      if (m.includes("terminated")) return t("affiliates.errorAffiliateTerminated");
      if (m.includes("tax form")) return t("affiliates.errorNoTaxForm");
      if (m.includes("no payable")) return t("affiliates.errorNoPayableCommissions");
      return msg;
    },
    [t],
  );

  // ── Handle payout ────────────────────────────────────────────────────────────

  const handlePayout = useCallback(
    async (affiliateId: string, mode: "all" | "selected") => {
      setPayBusy(true);
      setPayError(null);
      setPaySuccess(false);

      const commissionIds = mode === "selected" ? [...selectedCommIds] : null;

      const { error } = await db.rpc("record_affiliate_payout", {
        p_affiliate_id: affiliateId,
        p_commission_ids: commissionIds,
        p_method: payMethod.trim() || null,
        p_reference: payReference.trim() || null,
        p_note: payNote.trim() || null,
      });

      setPayBusy(false);
      if (error) { setPayError(mapPayoutError(error.message)); return; }

      setPaySuccess(true);
      setShowPayForm(false);
      setSelectedCommIds(new Set());
      setPayMethod("");
      setPayReference("");
      setPayNote("");
      await fetchCommissionDetail(affiliateId);
      await fetchAffiliates();
    },
    [selectedCommIds, payMethod, payReference, payNote, mapPayoutError, fetchCommissionDetail, fetchAffiliates],
  );

  // ── Yearly 1099 ─────────────────────────────────────────────────────────────

  const fetch1099 = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    setLoadingYearly(true);
    setYearlyError(null);
    setYearlyData([]);
    const year = parseInt(yearlyYear, 10);
    if (isNaN(year)) { setYearlyError(t("affiliates.validationClawbackDays")); setLoadingYearly(false); return; }
    const { data, error } = await db.rpc("affiliate_yearly_payouts", { p_year: year });
    setLoadingYearly(false);
    if (error) { setYearlyError(error.message); return; }
    setYearlyData((data ?? []) as YearlyPayout[]);
  }, [yearlyYear, t]);

  // ── Create / edit affiliate ──────────────────────────────────────────────────

  const openCreate = useCallback(() => {
    setEditingId(null);
    setForm(emptyForm());
    setActionError(null);
    setShowForm(true);
  }, []);

  // Fix B: fetch real notes before opening edit form
  const openEdit = useCallback(async (a: AffiliateSummary) => {
    setEditingId(a.id);
    setForm(affiliateToForm(a));
    setActionError(null);
    setShowForm(true);
    if (isSupabaseConfigured) {
      const { data } = await db
        .from("affiliates")
        .select("notes")
        .eq("id", a.id)
        .maybeSingle();
      if (data?.notes != null) {
        setForm((f) => ({ ...f, notes: data.notes as string }));
      }
    }
  }, []);

  const closeForm = useCallback(() => { setShowForm(false); setEditingId(null); }, []);

  const handleSave = useCallback(async () => {
    setActionError(null);

    // Fix A: affiliate_number required on create
    if (!editingId && !form.affiliate_number.trim()) {
      setActionError(t("affiliates.validationNumber"));
      return;
    }

    const pct = parseFloat(form.commission_pct);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      setActionError(t("affiliates.validationPct"));
      return;
    }
    if (!form.name.trim()) {
      setActionError(t("affiliates.validationName"));
      return;
    }

    // Fix C: confirm before terminating
    if (editingId && form.status === "terminated") {
      const aff = affiliates.find((a) => a.id === editingId);
      const ok = window.confirm(t("affiliates.terminateConfirm", { name: aff?.name ?? "" }));
      if (!ok) return;
    }

    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); setActionError("Session expired — please refresh."); return; }

    // Tax form: set tax_form_received_at when toggling on
    const currentAff = editingId ? affiliates.find((a) => a.id === editingId) : null;
    const taxFormJustEnabled = form.tax_form_on_file && !currentAff?.tax_form_on_file;

    const payload: Record<string, unknown> = {
      affiliate_number: form.affiliate_number.trim() || undefined,
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      commission_pct: pct,
      notes: form.notes.trim() || null,
      tax_form_type: form.tax_form_type === "none" ? null : form.tax_form_type,
      tax_form_on_file: form.tax_form_on_file,
      ...(taxFormJustEnabled ? { tax_form_received_at: new Date().toISOString() } : {}),
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
  }, [form, editingId, affiliates, fetchAffiliates, t]);

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

  // ── Search / assign users ────────────────────────────────────────────────────

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

  const assignAffiliate = useCallback(async (userId: string, affiliateId: string | null) => {
    setAssignError(null);
    setAssignBusy(userId);
    const { error } = await db.rpc("assign_affiliate_to_user", {
      p_user_id: userId,
      p_affiliate_id: affiliateId,
    });
    setAssignBusy(null);
    if (error) { setAssignError(error.message); return; }
    setUserResults((prev) =>
      prev.map((u) => u.id === userId ? { ...u, referred_by_affiliate_id: affiliateId } : u),
    );
  }, []);

  // ── Save config ──────────────────────────────────────────────────────────────

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

  // ── Label helpers ────────────────────────────────────────────────────────────

  const statusLabel = (s: AffiliateStatus) => {
    if (s === "active") return t("affiliates.statusActive");
    if (s === "suspended") return t("affiliates.statusSuspended");
    return t("affiliates.statusTerminated");
  };

  const commStatusLabel = (s: string) => {
    if (s === "pending") return t("affiliates.commStatusPending");
    if (s === "approved") return t("affiliates.commStatusApproved");
    if (s === "paid") return t("affiliates.commStatusPaid");
    if (s === "reversed") return t("affiliates.commStatusReversed");
    return t("affiliates.commStatusVoid");
  };

  const isCommPayable = (c: AffiliateCommission): boolean => {
    if (c.status !== "pending") return false;
    const clawback = cfg?.affiliate_clawback_days ?? 30;
    const created = new Date(c.created_at).getTime();
    const cutoff = Date.now() - clawback * 24 * 60 * 60 * 1000;
    return created < cutoff;
  };

  // ── Toggle commission checkbox ───────────────────────────────────────────────

  const toggleComm = (id: string) => {
    setSelectedCommIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
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
              {/* Tax form fields */}
              <Field label={t("affiliates.fieldTaxFormType")}>
                <select
                  value={form.tax_form_type}
                  onChange={(e) => setForm((f) => ({ ...f, tax_form_type: e.target.value as AffiliateFormState["tax_form_type"] }))}
                  style={{ ...inputStyle, width: 160 }}
                >
                  <option value="none">{t("affiliates.taxFormNone")}</option>
                  <option value="w9">{t("affiliates.taxFormW9")}</option>
                  <option value="w8ben">{t("affiliates.taxFormW8Ben")}</option>
                </select>
              </Field>
              <Field label={t("affiliates.fieldTaxFormOnFile")}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, height: 36 }}>
                  <input
                    type="checkbox"
                    checked={form.tax_form_on_file}
                    onChange={(e) => setForm((f) => ({ ...f, tax_form_on_file: e.target.checked }))}
                    style={{ accentColor: "var(--color-brand)", width: 16, height: 16 }}
                  />
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    {form.tax_form_on_file ? t("affiliates.taxYes") : t("affiliates.taxNo")}
                  </span>
                </div>
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
                {/* Number + name + tax badge */}
                <div style={{ flex: "1 1 180px", minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                    #{a.affiliate_number} · {a.name}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
                    {a.email ?? "—"}{a.phone ? ` · ${a.phone}` : ""}
                  </div>
                  {/* Tax form badge */}
                  {a.tax_form_on_file ? (
                    <span
                      style={{
                        display: "inline-block",
                        marginTop: 4,
                        padding: "2px 7px",
                        borderRadius: 20,
                        fontSize: 10,
                        fontWeight: 700,
                        color: "var(--color-success)",
                        border: "1px solid var(--color-success)",
                        textTransform: "uppercase",
                      }}
                    >
                      {a.tax_form_type === "w8ben" ? "W-8BEN" : "W-9"} ✓
                    </span>
                  ) : (
                    <span
                      style={{
                        display: "inline-block",
                        marginTop: 4,
                        padding: "2px 7px",
                        borderRadius: 20,
                        fontSize: 10,
                        fontWeight: 700,
                        color: "var(--color-warning)",
                        border: "1px solid var(--color-warning)",
                        textTransform: "uppercase",
                      }}
                    >
                      {t("affiliates.noTaxForm")}
                    </span>
                  )}
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

                {/* Status + actions */}
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
                      onClick={() => void openEdit(a)}
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

      {/* ════════════════ SECCIÓN B COMISIONES Y PAGOS ═════════════════════════ */}
      <div
        style={{
          border: "1px solid var(--border-subtle)",
          borderRadius: 12,
          background: "var(--bg-surface)",
          padding: 18,
          marginBottom: 22,
        }}
      >
        <SectionTitle icon={IconCreditCard} label={t("affiliates.sectionCommissions")} />

        {loadingAff ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
            <IconLoader2 size={22} stroke={1.6} style={{ color: "var(--color-brand)", animation: "spin 1s linear infinite" }} />
          </div>
        ) : affiliates.length === 0 ? (
          <div style={{ padding: "24px", textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
            {t("affiliates.emptyState")}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {affiliates.map((a) => {
              const total = a.waiting_cents + a.ready_cents + a.paid_cents + a.reversed_cents;
              const revRate = total > 0 ? ((a.reversed_cents / total) * 100).toFixed(1) + "%" : "—";
              const isOpen = openDetailId === a.id;
              return (
                <div
                  key={a.id}
                  style={{
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 10,
                    background: "var(--bg-base)",
                    overflow: "hidden",
                  }}
                >
                  {/* Summary row */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 16px",
                      flexWrap: "wrap",
                      rowGap: 8,
                    }}
                  >
                    <div style={{ flex: "0 0 160px", minWidth: 120 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                        #{a.affiliate_number}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 1 }}>{a.name}</div>
                    </div>

                    {/* Buckets */}
                    {(
                      [
                        { key: "bucketWaiting", val: a.waiting_cents, color: "var(--color-warning)" },
                        { key: "bucketPayable", val: a.ready_cents, color: "var(--color-brand)" },
                        { key: "bucketPaid", val: a.paid_cents, color: "var(--color-success)" },
                        { key: "bucketReversed", val: a.reversed_cents, color: "var(--color-danger)" },
                      ] as const
                    ).map(({ key, val, color }) => (
                      <div key={key} style={{ flex: "1 1 100px", textAlign: "center" }}>
                        <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 2 }}>
                          {t(`affiliates.${key}`)}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color }}>
                          {formatMoney(val, "usd")}
                        </div>
                      </div>
                    ))}

                    {/* Reversal rate */}
                    <div style={{ flex: "0 0 80px", textAlign: "center" }}>
                      <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 2 }}>
                        {t("affiliates.reversalRate")}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                        {revRate}
                      </div>
                    </div>

                    {/* Toggle detail */}
                    <button
                      onClick={() => {
                        if (isOpen) {
                          setOpenDetailId(null);
                        } else {
                          setOpenDetailId(a.id);
                        }
                      }}
                      style={{
                        ...inputStyle,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        fontSize: 12,
                        height: 32,
                        padding: "0 12px",
                        flex: "0 0 auto",
                      }}
                    >
                      {isOpen ? <IconChevronUp size={14} stroke={2} /> : <IconChevronDown size={14} stroke={2} />}
                      {isOpen ? t("affiliates.hideCommissions") : t("affiliates.viewCommissions")}
                    </button>
                  </div>

                  {/* Detail panel */}
                  {isOpen && (
                    <div
                      style={{
                        borderTop: "1px solid var(--border-subtle)",
                        padding: 16,
                        background: "var(--bg-surface)",
                      }}
                    >
                      {paySuccess && (
                        <Banner type="success" message={t("affiliates.paySuccessBanner")} onDismiss={() => setPaySuccess(false)} />
                      )}
                      {payError && (
                        <Banner type="error" message={payError} onDismiss={() => setPayError(null)} />
                      )}

                      {loadingDetail ? (
                        <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
                          <IconLoader2 size={20} stroke={1.6} style={{ color: "var(--color-brand)", animation: "spin 1s linear infinite" }} />
                        </div>
                      ) : detailError ? (
                        <Banner type="error" message={detailError} />
                      ) : detailComms.length === 0 ? (
                        <div style={{ color: "var(--text-secondary)", fontSize: 13, padding: "16px 0" }}>
                          {t("affiliates.noCommissions")}
                        </div>
                      ) : (
                        <>
                          {/* Commission rows */}
                          <div style={{ overflowX: "auto" }}>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "24px 1fr 90px 60px 80px 120px 100px",
                                gap: "0 10px",
                                alignItems: "center",
                                padding: "6px 0",
                                borderBottom: "1px solid var(--border-subtle)",
                                minWidth: 560,
                              }}
                            >
                              <div />
                              {(["commColPayer", "commColAmount", "commColRate", "commColStatus", "commColDate", ""] as const).map(
                                (col, ci) => (
                                  <div
                                    key={ci}
                                    style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase" }}
                                  >
                                    {col ? t(`affiliates.${col}`) : ""}
                                  </div>
                                ),
                              )}
                            </div>

                            {detailComms.map((c) => {
                              const payable = isCommPayable(c);
                              const isSelected = selectedCommIds.has(c.id);
                              const canSelect = c.status === "pending";
                              return (
                                <div
                                  key={c.id}
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "24px 1fr 90px 60px 80px 120px 100px",
                                    gap: "0 10px",
                                    alignItems: "center",
                                    padding: "8px 0",
                                    borderBottom: "1px solid var(--border-subtle)",
                                    minWidth: 560,
                                    opacity: c.status === "void" ? 0.5 : 1,
                                  }}
                                >
                                  <div>
                                    {canSelect && (
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => toggleComm(c.id)}
                                        style={{ accentColor: "var(--color-brand)" }}
                                      />
                                    )}
                                  </div>
                                  <div style={{ fontSize: 12, color: "var(--text-primary)" }}>
                                    @{detailUsers[c.user_id] ?? c.user_id.slice(0, 8)}
                                  </div>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                                    {formatMoney(c.commission_amount_cents, c.currency)}
                                  </div>
                                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                                    {c.commission_pct}%
                                  </div>
                                  <div>
                                    <CommPill status={c.status} label={commStatusLabel(c.status)} />
                                  </div>
                                  <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                                    {new Date(c.created_at).toLocaleDateString()}
                                  </div>
                                  <div style={{ fontSize: 11 }}>
                                    {c.status === "pending" && (
                                      <span
                                        style={{
                                          color: payable ? "var(--color-brand)" : "var(--color-warning)",
                                          fontWeight: 600,
                                        }}
                                      >
                                        {payable
                                          ? t("affiliates.commLabelPayable")
                                          : t("affiliates.commLabelInWindow")}
                                      </span>
                                    )}
                                    {c.status === "reversed" && c.reversed_reason && (
                                      <span style={{ color: "var(--color-danger)", fontSize: 10 }}>
                                        {c.reversed_reason}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Pay actions */}
                          {!showPayForm ? (
                            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                              <button
                                onClick={() => setShowPayForm(true)}
                                style={primaryBtn(false)}
                              >
                                <IconCreditCard size={15} stroke={2} />
                                {t("affiliates.payPayableButton")}
                              </button>
                              {selectedCommIds.size > 0 && (
                                <button
                                  onClick={() => setShowPayForm(true)}
                                  style={{
                                    ...primaryBtn(false),
                                    background: "var(--color-brand-purple)",
                                  }}
                                >
                                  <IconCheck size={15} stroke={2} />
                                  {t("affiliates.paySelectedButton", { count: selectedCommIds.size })}
                                </button>
                              )}
                            </div>
                          ) : (
                            /* Pay form */
                            <div
                              style={{
                                marginTop: 14,
                                padding: 14,
                                borderRadius: 8,
                                background: "var(--bg-base)",
                                border: "1px solid var(--border-subtle)",
                              }}
                            >
                              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>
                                {selectedCommIds.size > 0
                                  ? t("affiliates.paySelectedButton", { count: selectedCommIds.size })
                                  : t("affiliates.payPayableButton")}
                              </div>
                              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                                <Field label={t("affiliates.payMethodLabel")}>
                                  <input
                                    type="text"
                                    placeholder="bank_transfer / check / wire"
                                    value={payMethod}
                                    onChange={(e) => setPayMethod(e.target.value)}
                                    style={{ ...inputStyle, width: 160 }}
                                  />
                                </Field>
                                <Field label={t("affiliates.payReferenceLabel")}>
                                  <input
                                    type="text"
                                    value={payReference}
                                    onChange={(e) => setPayReference(e.target.value)}
                                    style={{ ...inputStyle, width: 200 }}
                                  />
                                </Field>
                                <Field label={t("affiliates.payNoteLabel")}>
                                  <input
                                    type="text"
                                    value={payNote}
                                    onChange={(e) => setPayNote(e.target.value)}
                                    style={{ ...inputStyle, width: 200 }}
                                  />
                                </Field>
                              </div>
                              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                                <button
                                  onClick={() =>
                                    void handlePayout(a.id, selectedCommIds.size > 0 ? "selected" : "all")
                                  }
                                  disabled={payBusy}
                                  style={primaryBtn(payBusy)}
                                >
                                  {payBusy ? (
                                    <IconLoader2 size={15} stroke={2} style={{ animation: "spin 1s linear infinite" }} />
                                  ) : (
                                    <IconCheck size={15} stroke={2} />
                                  )}
                                  {payBusy ? t("affiliates.payingState") : t("affiliates.payConfirmButton")}
                                </button>
                                <button
                                  onClick={() => { setShowPayForm(false); setPayError(null); }}
                                  style={{ ...inputStyle, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}
                                >
                                  <IconX size={14} stroke={2} />
                                  {t("affiliates.payCancelButton")}
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
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

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                {t("affiliates.globalPausesTitle")}
              </div>
              <ToggleRow label={t("affiliates.programEnabledLabel")} checked={programEnabled} onChange={setProgramEnabled} />
              <ToggleRow label={t("affiliates.payoutsEnabledLabel")} checked={payoutsEnabled} onChange={setPayoutsEnabled} />
            </div>

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

      {/* ════════════════ SECCIÓN 1099 ══════════════════════════════════════════ */}
      <div
        style={{
          border: "1px solid var(--border-subtle)",
          borderRadius: 12,
          background: "var(--bg-surface)",
          padding: 18,
          marginBottom: 22,
        }}
      >
        <SectionTitle icon={IconFileText} label={t("affiliates.section1099")} />
        {yearlyError && <Banner type="error" message={yearlyError} onDismiss={() => setYearlyError(null)} />}

        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap" }}>
          <Field label={t("affiliates.yearLabel")}>
            <input
              type="number"
              min={2020}
              max={2099}
              value={yearlyYear}
              onChange={(e) => setYearlyYear(e.target.value)}
              style={{ ...inputStyle, width: 100 }}
            />
          </Field>
          <button onClick={() => void fetch1099()} disabled={loadingYearly} style={primaryBtn(loadingYearly)}>
            {loadingYearly
              ? <IconLoader2 size={15} stroke={2} style={{ animation: "spin 1s linear infinite" }} />
              : <IconFileText size={15} stroke={2} />}
            {t("affiliates.load1099Button")}
          </button>
        </div>

        {yearlyData.length > 0 && (
          <>
            <Banner
              type="warning"
              message={t("affiliates.taxThresholdNote")}
            />
            <div style={{ overflowX: "auto" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "120px 1fr 100px 80px 120px 80px",
                  gap: "0 10px",
                  padding: "6px 0",
                  borderBottom: "1px solid var(--border-subtle)",
                  minWidth: 540,
                }}
              >
                {(["col1099Number", "col1099Name", "col1099TaxForm", "col1099OnFile", "col1099Total", "col1099Count"] as const).map(
                  (col) => (
                    <div
                      key={col}
                      style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase" }}
                    >
                      {t(`affiliates.${col}`)}
                    </div>
                  ),
                )}
              </div>
              {yearlyData.map((row) => {
                const highlight = row.total_paid_cents >= 60_000;
                return (
                  <div
                    key={row.affiliate_id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "120px 1fr 100px 80px 120px 80px",
                      gap: "0 10px",
                      padding: "9px 0",
                      borderBottom: "1px solid var(--border-subtle)",
                      minWidth: 540,
                      background: highlight ? "rgba(245,158,11,0.07)" : "transparent",
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                      #{row.affiliate_number}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-primary)" }}>{row.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      {row.tax_form_type === "w8ben" ? "W-8BEN" : row.tax_form_type === "w9" ? "W-9" : "—"}
                    </div>
                    <div style={{ fontSize: 12, color: row.tax_form_on_file ? "var(--color-success)" : "var(--color-warning)", fontWeight: 700 }}>
                      {row.tax_form_on_file ? t("affiliates.taxYes") : t("affiliates.taxNo")}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: highlight ? "var(--color-warning)" : "var(--text-primary)" }}>
                      {formatMoney(row.total_paid_cents, row.currency)}
                      {highlight && " ⚠"}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{row.payout_count}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {!loadingYearly && yearlyData.length === 0 && yearlyError === null && (
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
            {t("affiliates.empty1099", { year: yearlyYear })}
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
