"use client";

/**
 * JChat 3.0 — Service Calls (waiter requests)
 *
 * Lists pending and acknowledged service_calls for the owner's business,
 * newest first. Subscribes to Supabase Realtime so new calls appear instantly.
 *
 * Actions per call:
 *   "Atender"  → status: pending   → acknowledged
 *   "Resuelto" → status: any       → resolved
 *
 * Resolved calls are hidden from the list (they move to history, not shown here).
 * Uses --db-* tokens only; no hex hardcoded.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  IconBell,
  IconCheck,
  IconChecks,
  IconAlertCircle,
  IconRefresh,
  IconClock,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { resolveActiveBusiness } from "@/lib/business";
import { NoBusinessCTA } from "@/components/dashboard/NoBusinessCTA";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ServiceCall {
  id: string;
  status: string;       // pending | acknowledged | resolved
  type: string;         // waiter | bill | other
  table_label: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function elapsed(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "justo ahora";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `hace ${mins} min`;
  const h = Math.floor(mins / 60);
  return `hace ${h}h ${mins % 60}m`;
}

function typeLabel(type: string): string {
  if (type === "waiter") return "Mesero";
  if (type === "bill")   return "Cuenta";
  return "Otro";
}

function statusLabel(status: string): string {
  if (status === "pending")      return "Pendiente";
  if (status === "acknowledged") return "Atendiendo";
  return status;
}

// ── Demo data ─────────────────────────────────────────────────────────────────

const DEMO_CALLS: ServiceCall[] = [
  {
    id: "demo-sc-1",
    status: "pending",
    type: "waiter",
    table_label: "Mesa 3",
    notes: "Necesitamos la carta de vinos",
    created_at: new Date(Date.now() - 90_000).toISOString(),
    updated_at: new Date(Date.now() - 90_000).toISOString(),
  },
  {
    id: "demo-sc-2",
    status: "acknowledged",
    type: "bill",
    table_label: "Terraza 2",
    notes: null,
    created_at: new Date(Date.now() - 300_000).toISOString(),
    updated_at: new Date(Date.now() - 120_000).toISOString(),
  },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ServicePage() {
  const [calls, setCalls] = useState<ServiceCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsRegister, setNeedsRegister] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [, forceTick] = useState(0);

  const businessIdRef = useRef<string | null>(null);
  const channelRef    = useRef<RealtimeChannel | null>(null);
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load ─────────────────────────────────────────────────────────────────

  const loadCalls = useCallback(async (bizId: string) => {
    const { data, error: err } = await supabase
      .from("service_calls")
      .select("id, status, type, table_label, notes, created_at, updated_at")
      .eq("business_id", bizId)
      .in("status", ["pending", "acknowledged"])
      .order("created_at", { ascending: false });
    if (err) throw err;
    setCalls((data ?? []) as ServiceCall[]);
  }, []);

  // ── Bootstrap ─────────────────────────────────────────────────────────────

  useEffect(() => {
    let active = true;

    void (async () => {
      if (!isSupabaseConfigured) {
        setCalls(DEMO_CALLS);
        setLoading(false);
        return;
      }
      try {
        const res = await resolveActiveBusiness();
        if (!active) return;
        if (!res.ok) {
          if (res.reason === "no_business" || res.reason === "unauthenticated") {
            setNeedsRegister(true);
          } else {
            setError(res.message);
          }
          setLoading(false);
          return;
        }

        const bid = res.business.id;
        businessIdRef.current = bid;
        await loadCalls(bid);

        // Realtime subscription — service_calls filtered by business_id
        channelRef.current = supabase
          .channel(`service-calls-${bid}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "service_calls",
              filter: `business_id=eq.${bid}`,
            },
            () => { void loadCalls(bid).catch(() => {}); },
          )
          .subscribe();

        // 30s fallback refresh + elapsed-time tick
        timerRef.current = setInterval(() => {
          forceTick((t) => t + 1);
          if (businessIdRef.current) {
            void loadCalls(businessIdRef.current).catch(() => {});
          }
        }, 30_000);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Error al cargar las llamadas.");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
      if (channelRef.current) void supabase.removeChannel(channelRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [loadCalls]);

  // ── Status update ─────────────────────────────────────────────────────────

  const handleStatusChange = useCallback(
    async (callId: string, newStatus: "acknowledged" | "resolved") => {
      if (updatingId) return;
      setUpdatingId(callId);
      try {
        const { error: err } = await supabase
          .from("service_calls")
          .update({ status: newStatus })
          .eq("id", callId);
        if (err) throw err;
        // Optimistic update: remove resolved calls from list immediately
        if (newStatus === "resolved") {
          setCalls((prev) => prev.filter((c) => c.id !== callId));
        } else {
          setCalls((prev) =>
            prev.map((c) => (c.id === callId ? { ...c, status: newStatus } : c)),
          );
        }
      } catch {
        // Realtime will resync; no UI error needed for a transient failure
      } finally {
        setUpdatingId(null);
      }
    },
    [updatingId],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  if (needsRegister) return <NoBusinessCTA />;

  return (
    <div className="service-page">
      <div className="service-header">
        <div className="service-header-left">
          <IconBell size={22} className="service-header-icon" />
          <div>
            <h1 className="service-title">Llamadas de servicio</h1>
            <p className="service-subtitle">
              Solicitudes activas de mesero en tiempo real
            </p>
          </div>
        </div>
        <button
          className="service-refresh-btn"
          onClick={() => {
            if (businessIdRef.current) void loadCalls(businessIdRef.current).catch(() => {});
          }}
          aria-label="Refrescar"
        >
          <IconRefresh size={16} />
        </button>
      </div>

      {error && (
        <div className="service-error">
          <IconAlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="service-loading">
          <div className="service-spinner" />
          <span>Cargando llamadas…</span>
        </div>
      ) : calls.length === 0 ? (
        <div className="service-empty">
          <IconChecks size={40} className="service-empty-icon" />
          <p className="service-empty-title">Sin llamadas pendientes</p>
          <p className="service-empty-sub">Aquí aparecerán las solicitudes de los clientes en tiempo real.</p>
        </div>
      ) : (
        <ul className="service-list">
          {calls.map((call) => (
            <li key={call.id} className={`service-card service-card--${call.status}`}>
              <div className="service-card-top">
                <div className="service-card-left">
                  <span className={`service-badge service-badge--${call.status}`}>
                    {statusLabel(call.status)}
                  </span>
                  <span className="service-type">{typeLabel(call.type)}</span>
                </div>
                <div className="service-card-time">
                  <IconClock size={13} />
                  <span>{elapsed(call.created_at)}</span>
                </div>
              </div>

              {call.table_label && (
                <p className="service-table">
                  <strong>Mesa:</strong> {call.table_label}
                </p>
              )}
              {!call.table_label && (
                <p className="service-table service-table--none">Sin mesa especificada</p>
              )}

              {call.notes && (
                <p className="service-notes">{call.notes}</p>
              )}

              <div className="service-actions">
                {call.status === "pending" && (
                  <button
                    className="service-btn service-btn--attend"
                    disabled={updatingId === call.id}
                    onClick={() => void handleStatusChange(call.id, "acknowledged")}
                  >
                    <IconCheck size={15} />
                    Atender
                  </button>
                )}
                <button
                  className="service-btn service-btn--resolve"
                  disabled={updatingId === call.id}
                  onClick={() => void handleStatusChange(call.id, "resolved")}
                >
                  <IconChecks size={15} />
                  Resuelto
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <style>{`
        .service-page {
          padding: 24px;
          max-width: 780px;
        }
        .service-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 24px;
          gap: 12px;
        }
        .service-header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .service-header-icon {
          color: var(--db-accent);
          flex-shrink: 0;
        }
        .service-title {
          font-size: 20px;
          font-weight: 700;
          color: var(--db-text-primary);
          margin: 0 0 2px;
        }
        .service-subtitle {
          font-size: 13px;
          color: var(--db-text-secondary);
          margin: 0;
        }
        .service-refresh-btn {
          background: var(--db-surface);
          border: 1px solid var(--db-border);
          border-radius: 8px;
          padding: 7px 10px;
          color: var(--db-text-secondary);
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          transition: background 0.15s;
        }
        .service-refresh-btn:hover {
          background: var(--db-surface-hover);
        }
        .service-error {
          display: flex;
          align-items: center;
          gap: 8px;
          background: color-mix(in srgb, var(--db-danger) 12%, transparent);
          color: var(--db-danger);
          border: 1px solid color-mix(in srgb, var(--db-danger) 30%, transparent);
          border-radius: 10px;
          padding: 12px 16px;
          font-size: 14px;
          margin-bottom: 20px;
        }
        .service-loading {
          display: flex;
          align-items: center;
          gap: 12px;
          color: var(--db-text-secondary);
          font-size: 14px;
          padding: 40px 0;
        }
        .service-spinner {
          width: 20px;
          height: 20px;
          border: 2px solid var(--db-border);
          border-top-color: var(--db-accent);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .service-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 60px 24px;
          text-align: center;
          gap: 8px;
        }
        .service-empty-icon { color: var(--db-text-tertiary); margin-bottom: 8px; }
        .service-empty-title {
          font-size: 16px;
          font-weight: 600;
          color: var(--db-text-primary);
          margin: 0;
        }
        .service-empty-sub {
          font-size: 13px;
          color: var(--db-text-secondary);
          margin: 0;
          max-width: 320px;
        }
        .service-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .service-card {
          background: var(--db-surface);
          border: 1px solid var(--db-border);
          border-radius: 14px;
          padding: 16px 18px;
          transition: box-shadow 0.15s;
        }
        .service-card--pending {
          border-left: 4px solid var(--db-accent);
        }
        .service-card--acknowledged {
          border-left: 4px solid var(--db-success);
        }
        .service-card-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
          gap: 8px;
        }
        .service-card-left {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .service-badge {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.4px;
          text-transform: uppercase;
          padding: 3px 9px;
          border-radius: 20px;
        }
        .service-badge--pending {
          background: color-mix(in srgb, var(--db-accent) 15%, transparent);
          color: var(--db-accent);
        }
        .service-badge--acknowledged {
          background: color-mix(in srgb, var(--db-success) 15%, transparent);
          color: var(--db-success);
        }
        .service-type {
          font-size: 13px;
          color: var(--db-text-secondary);
          font-weight: 500;
        }
        .service-card-time {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          color: var(--db-text-tertiary);
          white-space: nowrap;
          flex-shrink: 0;
        }
        .service-table {
          font-size: 14px;
          color: var(--db-text-primary);
          margin: 0 0 6px;
        }
        .service-table--none {
          color: var(--db-text-tertiary);
          font-style: italic;
        }
        .service-notes {
          font-size: 14px;
          color: var(--db-text-secondary);
          margin: 0 0 12px;
          line-height: 1.5;
        }
        .service-actions {
          display: flex;
          gap: 8px;
          margin-top: 14px;
          flex-wrap: wrap;
        }
        .service-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 14px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          border: 1px solid transparent;
          transition: opacity 0.15s, background 0.15s;
        }
        .service-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .service-btn--attend {
          background: var(--db-accent);
          color: #fff;
          border-color: var(--db-accent);
        }
        .service-btn--attend:hover:not(:disabled) { opacity: 0.88; }
        .service-btn--resolve {
          background: var(--db-surface);
          color: var(--db-text-secondary);
          border-color: var(--db-border);
        }
        .service-btn--resolve:hover:not(:disabled) {
          background: var(--db-surface-hover);
          color: var(--db-text-primary);
        }
      `}</style>
    </div>
  );
}
