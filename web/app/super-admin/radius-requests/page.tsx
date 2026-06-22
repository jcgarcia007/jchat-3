/**
 * JChat 3.0 — Super Admin: Radius Increase Requests
 * Lists pending radius_increase_requests; Approve applies the new radius to the
 * business and notifies the owner; Deny notifies the owner. Gated by the
 * super-admin layout (SuperAdminGate). Global tokens only — no hardcoded hex.
 */

"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  IconRulerMeasure,
  IconLoader2,
  IconAlertCircle,
  IconCheck,
  IconBan,
  IconBuildingStore,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

interface RequestRow {
  id: string;
  business_id: string | null;
  event_id: string | null;
  requested_by: string | null;
  current_radius_m: number | null;
  requested_radius_m: number | null;
  reason: string;
  status: string;
  created_at: string;
  business_name: string | null;
}

const DEMO: RequestRow[] = [
  {
    id: "demo-r1",
    business_id: "demo-biz",
    event_id: null,
    requested_by: "demo-user",
    current_radius_m: 100,
    requested_radius_m: 400,
    reason: "Our patio and parking lot extend well beyond 100m and customers check in from there.",
    status: "pending",
    created_at: new Date(Date.now() - 3600_000).toISOString(),
    business_name: "The Velvet Lounge",
  },
];

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function RadiusRequestsPage() {
  const [items, setItems] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setItems(DEMO);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: e } = await supabase
        .from("radius_increase_requests")
        .select("id, business_id, event_id, requested_by, current_radius_m, requested_radius_m, reason, status, created_at, businesses(name)")
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (e) throw e;
      const rows = (data ?? []).map((raw) => {
        const r = raw as unknown as RequestRow & { businesses: { name: string } | { name: string }[] | null };
        const biz = Array.isArray(r.businesses) ? r.businesses[0] : r.businesses;
        return { ...r, business_name: biz?.name ?? null };
      });
      setItems(rows as RequestRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load requests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const review = useCallback(
    async (row: RequestRow, decision: "approved" | "denied") => {
      setBusyId(row.id);
      setError(null);
      setSuccess(null);
      try {
        if (isSupabaseConfigured) {
          const { data: { user } } = await supabase.auth.getUser();
          const adminId = user?.id ?? null;

          const { error: e1 } = await supabase
            .from("radius_increase_requests")
            .update({ status: decision, reviewed_by: adminId, reviewed_at: new Date().toISOString() })
            .eq("id", row.id);
          if (e1) throw e1;

          if (decision === "approved" && row.business_id && row.requested_radius_m != null) {
            // Apply to the business (events flow handled separately in the future).
            const { error: e2 } = await supabase
              .from("businesses")
              .update({ geofence_radius_m: row.requested_radius_m, radius_m: row.requested_radius_m })
              .eq("id", row.business_id);
            if (e2) throw e2;
          }

          if (row.requested_by) {
            await supabase.from("notifications").insert({
              user_id: row.requested_by,
              type: "radius_request",
              payload:
                decision === "approved"
                  ? { title: "Your radius increase request was approved!", body: `New radius: ${row.requested_radius_m} m` }
                  : { title: "Your radius increase request was denied." },
            });
          }
        }
        setItems((prev) => prev.filter((r) => r.id !== row.id));
        setSuccess(`Request ${decision}.`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update request.");
      } finally {
        setBusyId(null);
      }
    },
    [],
  );

  return (
    <div style={{ maxWidth: 880 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
        <IconRulerMeasure size={22} color="var(--color-brand)" />
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Radius Requests</h1>
      </div>
      <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "20px" }}>
        Pending geofence radius increase requests from business owners.
      </p>

      {error && (
        <Banner color="var(--color-danger)" bg="rgba(239,68,68,0.10)" icon={<IconAlertCircle size={15} />}>{error}</Banner>
      )}
      {success && (
        <Banner color="var(--color-success)" bg="rgba(29,158,117,0.10)" icon={<IconCheck size={15} />}>{success}</Banner>
      )}

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "40px", color: "var(--text-secondary)", fontSize: "14px" }}>
          <IconLoader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Loading…
        </div>
      ) : items.length === 0 ? (
        <div style={{ padding: "48px 24px", textAlign: "center", background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "12px" }}>
          <IconRulerMeasure size={28} color="var(--text-tertiary)" />
          <p style={{ fontSize: "14px", color: "var(--text-secondary)", margin: "10px 0 0" }}>No pending radius requests.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {items.map((r) => (
            <div key={r.id} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "12px", padding: "18px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginBottom: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <IconBuildingStore size={18} color="var(--color-brand)" />
                  <span style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>{r.business_name ?? "Business"}</span>
                  {r.event_id && <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>(event)</span>}
                </div>
                <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>{timeAgo(r.created_at)}</span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px", fontSize: "14px", color: "var(--text-primary)" }}>
                <span style={{ padding: "3px 10px", borderRadius: "999px", background: "var(--bg-elevated)", color: "var(--text-secondary)", fontWeight: 600 }}>
                  {r.current_radius_m ?? "—"} m
                </span>
                <span style={{ color: "var(--text-tertiary)" }}>→</span>
                <span style={{ padding: "3px 10px", borderRadius: "999px", background: "color-mix(in srgb, var(--color-brand) 14%, transparent)", color: "var(--color-brand)", fontWeight: 700 }}>
                  {r.requested_radius_m ?? "—"} m
                </span>
              </div>

              <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: "0 0 14px", lineHeight: 1.5 }}>
                “{r.reason}”
              </p>

              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => void review(r, "approved")}
                  disabled={busyId === r.id}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--color-success)", color: "#fff", fontSize: "13px", fontWeight: 600, cursor: busyId === r.id ? "wait" : "pointer", opacity: busyId === r.id ? 0.7 : 1 }}
                >
                  <IconCheck size={15} /> Approve
                </button>
                <button
                  type="button"
                  onClick={() => void review(r, "denied")}
                  disabled={busyId === r.id}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "8px", border: "1px solid var(--border-subtle)", background: "transparent", color: "var(--color-danger)", fontSize: "13px", fontWeight: 600, cursor: busyId === r.id ? "wait" : "pointer", opacity: busyId === r.id ? 0.7 : 1 }}
                >
                  <IconBan size={15} /> Deny
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Banner({ color, bg, icon, children }: { color: string; bg: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 16px", borderRadius: "8px", background: bg, color, fontSize: "14px", marginBottom: "16px" }}>
      {icon}
      {children}
    </div>
  );
}
