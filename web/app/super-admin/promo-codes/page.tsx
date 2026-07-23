"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  IconTicket, IconLoader2, IconAlertCircle, IconCheck, IconCopy, IconX, IconSparkles, IconUser,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

interface PromoCode {
  id: string;
  code: string;
  plan: string;
  trial_days: number;
  expires_at: string | null;
  active: boolean;
  redeemed_by: string | null;
  redeemed_at: string | null;
  created_at: string;
}

type Status = "used" | "available" | "expired" | "inactive";

function statusOf(c: PromoCode): Status {
  if (!c.active) return "inactive";
  if (c.redeemed_by) return "used";
  if (c.expires_at && new Date(c.expires_at) <= new Date()) return "expired";
  return "available";
}

interface Redeemer {
  username: string | null;
  display_name: string | null;
  plan_trial_end: string | null;
  plan_status: string | null;
}

function daysLeft(trialEnd: string | null): number | null {
  if (!trialEnd) return null;
  return Math.ceil((new Date(trialEnd).getTime() - Date.now()) / 86400000);
}

export default function SuperAdminPromoCodesPage() {
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [redeemers, setRedeemers] = useState<Record<string, Redeemer>>({});
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [plan, setPlan] = useState<"pro" | "business">("pro");
  const [trialDays, setTrialDays] = useState("30");
  const [expiresAt, setExpiresAt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [justGenerated, setJustGenerated] = useState<PromoCode | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchCodes = useCallback(async () => {
    if (!isSupabaseConfigured) { setCodes([]); setLoading(false); return; }
    setLoading(true); setFetchError(null);
    const { data, error } = await supabase
      .from("promo_codes")
      .select("id, code, plan, trial_days, expires_at, active, redeemed_by, redeemed_at, created_at")
      .order("created_at", { ascending: false });
    if (error) { setFetchError(error.message); setLoading(false); return; }
    const list = (data ?? []) as PromoCode[];
    setCodes(list);

    const ids = Array.from(
      new Set(list.map((c) => c.redeemed_by).filter((x): x is string => !!x)),
    );
    if (ids.length > 0) {
      const { data: us } = await supabase
        .from("users")
        .select("id, username, display_name, plan_trial_end, plan_status")
        .in("id", ids);
      const map: Record<string, Redeemer> = {};
      for (const u of us ?? []) {
        map[u.id] = {
          username: u.username,
          display_name: u.display_name,
          plan_trial_end: u.plan_trial_end,
          plan_status: u.plan_status,
        };
      }
      setRedeemers(map);
    } else {
      setRedeemers({});
    }
    setLoading(false);
  }, []);

  useEffect(() => { void fetchCodes(); }, [fetchCodes]);

  const generate = useCallback(async () => {
    setActionError(null);
    const days = parseInt(trialDays, 10);
    if (!Number.isInteger(days) || days <= 0) { setActionError("Los días deben ser un número mayor que 0."); return; }
    setGenerating(true);
    const { data, error } = await supabase.rpc("create_promo_code", {
      p_plan: plan,
      p_trial_days: days,
      p_expires_at: expiresAt ? new Date(expiresAt + "T23:59:59").toISOString() : undefined,
    });
    setGenerating(false);
    if (error) { setActionError(error.message); return; }
    setJustGenerated(data as PromoCode);
    setCopied(false);
    await fetchCodes();
  }, [plan, trialDays, expiresAt, fetchCodes]);

  const copyCode = useCallback((code: string) => {
    void navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, []);

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <IconTicket size={22} stroke={1.6} style={{ color: "var(--color-brand)" }} />
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Promo codes</h1>
      </div>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 18px" }}>
        Cada código es de un solo uso y otorga una prueba de Business o Pro por los días indicados.
        Solo los administradores de la plataforma pueden crearlos.
      </p>

      {!isSupabaseConfigured && <Banner type="warning" message="Demo mode — no backend configured." />}
      {fetchError && <Banner type="error" message={`Failed to load: ${fetchError}`} />}
      {actionError && <Banner type="error" message={actionError} onDismiss={() => setActionError(null)} />}

      <div style={{ border: "1px solid var(--border-subtle)", borderRadius: 12, background: "var(--bg-surface)", padding: 18, marginBottom: 22 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>Generar nuevo código</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Field label="Plan">
            <select value={plan} onChange={(e) => setPlan(e.target.value as "pro" | "business")} style={inputStyle}>
              <option value="pro">Pro</option>
              <option value="business">Business</option>
            </select>
          </Field>
          <Field label="Días de prueba">
            <input type="number" min={1} value={trialDays} onChange={(e) => setTrialDays(e.target.value)} style={{ ...inputStyle, width: 120 }} />
          </Field>
          <Field label="Vence (opcional)">
            <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} style={{ ...inputStyle, width: 170 }} />
          </Field>
          <button onClick={() => void generate()} disabled={generating} style={genBtn(generating)}>
            {generating ? <IconLoader2 size={15} stroke={2} style={{ animation: "spin 1s linear infinite" }} /> : <IconSparkles size={15} stroke={2} />}
            Generar código
          </button>
        </div>

        {justGenerated && (
          <div style={{ marginTop: 16, padding: 14, borderRadius: 10, background: "rgba(29,158,117,0.08)", border: "1px solid var(--color-success)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--color-success)", marginBottom: 4, textTransform: "capitalize" }}>
                Código generado · {justGenerated.plan} · {justGenerated.trial_days} días
              </div>
              <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 18, fontWeight: 700, letterSpacing: 1, color: "var(--text-primary)" }}>
                {justGenerated.code}
              </span>
            </div>
            <button onClick={() => copyCode(justGenerated.code)} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-success)", background: "transparent", color: "var(--color-success)", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
              {copied ? <IconCheck size={15} stroke={2} /> : <IconCopy size={15} stroke={2} />}
              {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
        )}
      </div>

      <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>
        Códigos existentes{codes.length > 0 ? ` (${codes.length})` : ""}
      </div>

      {loading && (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
          <IconLoader2 size={28} stroke={1.6} style={{ color: "var(--color-brand)", animation: "spin 1s linear infinite" }} />
        </div>
      )}

      {!loading && codes.length === 0 && !fetchError && (
        <div style={{ padding: "48px 24px", border: "1px dashed var(--border-subtle)", borderRadius: 12, textAlign: "center", color: "var(--text-secondary)", fontSize: 14 }}>
          Aún no hay códigos. Genera el primero arriba.
        </div>
      )}

      {!loading && codes.length > 0 && (
        <div style={{ border: "1px solid var(--border-subtle)", borderRadius: 12, overflow: "hidden" }}>
          {codes.map((c, i) => (
            <CodeRow key={c.id} code={c} redeemer={c.redeemed_by ? redeemers[c.redeemed_by] : undefined} isLast={i === codes.length - 1} />
          ))}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function CodeRow({ code, redeemer, isLast }: { code: PromoCode; redeemer?: Redeemer; isLast: boolean }) {
  const status = statusOf(code);
  const name = redeemer?.username ?? redeemer?.display_name ?? (code.redeemed_by ? `${code.redeemed_by.slice(0, 8)}…` : null);
  return (
    <div style={{ borderBottom: isLast ? "none" : "1px solid var(--border-subtle)", background: "var(--bg-surface)", padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", rowGap: 10 }}>
      <div style={{ flex: "1 1 180px", minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{code.code}</div>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2, textTransform: "capitalize" }}>
          {code.plan} · {code.trial_days} días{code.expires_at ? ` · vence ${new Date(code.expires_at).toLocaleDateString()}` : ""}
        </div>
      </div>
      <div style={{ flex: "1 1 160px", fontSize: 12, color: "var(--text-tertiary)" }}>
        {code.redeemed_by ? (
          <>
            <div style={{ color: "var(--text-secondary)" }}>
              <IconUser size={13} stroke={1.8} style={{ verticalAlign: -2, marginRight: 4 }} />
              {name}
            </div>
            {code.redeemed_at && <div style={{ marginTop: 2 }}>Canjeado {new Date(code.redeemed_at).toLocaleDateString()}</div>}
          </>
        ) : (
          "Sin usar"
        )}
      </div>
      <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 10 }}>
        {code.redeemed_by && <DaysLeft days={daysLeft(redeemer?.plan_trial_end ?? null)} />}
        <StatusPill status={status} />
      </div>
    </div>
  );
}

const STATUS_META: Record<Status, { label: string; color: string }> = {
  used:      { label: "Usado",      color: "var(--color-success)" },
  available: { label: "Disponible", color: "var(--color-brand)" },
  expired:   { label: "Vencido",    color: "var(--color-warning)" },
  inactive:  { label: "Inactivo",   color: "var(--text-secondary)" },
};

function DaysLeft({ days }: { days: number | null }) {
  if (days === null) return null;
  const expired = days <= 0;
  const low = days > 0 && days <= 7;
  const color = expired ? "var(--text-tertiary)" : low ? "var(--color-warning)" : "var(--color-success)";
  return (
    <span style={{ fontSize: 12, fontWeight: 600, color, whiteSpace: "nowrap" }}>
      {expired ? "vencida" : `quedan ${days} día${days === 1 ? "" : "s"}`}
    </span>
  );
}

function StatusPill({ status }: { status: Status }) {
  const { label, color } = STATUS_META[status];
  return (
    <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 20, fontSize: 11, fontWeight: 700, color, border: `1px solid ${color}`, textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
      {label}
    </span>
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

const inputStyle: React.CSSProperties = {
  padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border-subtle)",
  background: "var(--bg-base)", color: "var(--text-primary)", fontSize: 13,
};

function genBtn(busy: boolean): React.CSSProperties {
  return { display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 8, border: "none", background: busy ? "var(--text-tertiary)" : "var(--color-brand)", color: "var(--bg-surface-light)", fontSize: 13, fontWeight: 600, cursor: busy ? "not-allowed" : "pointer", height: 38 };
}

function Banner({ type, message, onDismiss }: { type: "error" | "success" | "warning"; message: string; onDismiss?: () => void }) {
  const color = type === "error" ? "var(--color-danger)" : type === "success" ? "var(--color-success)" : "var(--color-warning)";
  const bg = type === "error" ? "rgba(239,68,68,0.08)" : type === "success" ? "rgba(29,158,117,0.08)" : "rgba(245,158,11,0.08)";
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 14px", borderRadius: 8, background: bg, border: `1px solid ${color}`, color, fontSize: 13, marginBottom: 14 }}>
      <IconAlertCircle size={15} stroke={1.6} style={{ flexShrink: 0, marginTop: 1 }} />
      <span style={{ flex: 1 }}>{message}</span>
      {onDismiss && <button onClick={onDismiss} style={{ background: "none", border: "none", cursor: "pointer", color, display: "flex" }}><IconX size={14} stroke={2} /></button>}
    </div>
  );
}
