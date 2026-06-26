"use client";

/**
 * WaiterSheet — bottom-sheet for calling a waiter from /c/[token] (RoomHub).
 *
 * Self-contained: manages table label, note, send state, cooldown, and success/error.
 * Uses CSS design-system tokens (not chat-theme hex values) so it works in the hub.
 *
 * Debt: ChatRoom (/c/[token]/room) has an equivalent inline implementation that uses
 * chat-theme colors. Consolidate when ChatRoom is next touched significantly.
 */

import { useState, useRef, useEffect } from "react";
import { IconBell, IconLoader2, IconX } from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

const COOLDOWN_MS = 5 * 60 * 1000;

type WaiterState = "idle" | "sending" | "success" | "cooldown" | "error";

export interface WaiterSheetProps {
  roomId: string;
  businessId: string;
  userId: string;
  onClose: () => void;
}

export function WaiterSheet({ roomId, businessId, userId, onClose }: WaiterSheetProps) {
  const [tableLabel, setTableLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [state, setState] = useState<WaiterState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cooldownSecs, setCooldownSecs] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  function startCooldown() {
    if (timerRef.current) clearInterval(timerRef.current);
    const endsAt = Date.now() + COOLDOWN_MS;
    setCooldownSecs(Math.ceil(COOLDOWN_MS / 1000));
    timerRef.current = setInterval(() => {
      const rem = Math.ceil((endsAt - Date.now()) / 1000);
      if (rem <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        setCooldownSecs(0);
        setState("idle");
      } else {
        setCooldownSecs(rem);
      }
    }, 1000);
  }

  async function handleSend() {
    if (state === "sending" || state === "cooldown") return;
    setState("sending");
    setErrorMsg(null);

    if (!isSupabaseConfigured) {
      setState("success");
      startCooldown();
      setTimeout(onClose, 1800);
      return;
    }

    const { error } = await supabase.from("service_calls").insert({
      room_id: roomId,
      business_id: businessId,
      user_id: userId,
      type: "waiter",
      table_label: tableLabel.trim() || null,
      notes: notes.trim() || null,
      status: "pending",
    });

    if (!error) {
      setState("success");
      startCooldown();
      setTimeout(onClose, 1800);
      return;
    }

    const msg = (error as { message?: string }).message ?? "";
    if (msg.includes("service_call_cooldown")) {
      setState("cooldown");
      startCooldown();
      setTimeout(onClose, 800);
      return;
    }
    setState("error");
    setErrorMsg("No se pudo enviar. Intenta de nuevo.");
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Llamar al mesero"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        zIndex: 50,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "var(--bg-surface)",
          borderRadius: "20px 20px 0 0",
          padding: "20px 20px 32px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          maxHeight: "80vh",
          overflowY: "auto",
        }}
      >
        {/* Title row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <IconBell size={20} style={{ color: "var(--color-brand)" }} />
            <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
              Llamar al mesero
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "none",
              background: "var(--bg-elevated)",
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            <IconX size={16} />
          </button>
        </div>

        {state === "cooldown" && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              background: "var(--color-brand-light)",
              color: "var(--color-brand)",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            ⏱ Espera {cooldownSecs}s antes de enviar otra llamada.
          </div>
        )}

        {state === "success" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 14px",
              borderRadius: 12,
              background: "rgba(29,158,117,0.12)",
              color: "var(--color-success)",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            ✓ El mesero fue notificado
          </div>
        )}

        {state === "error" && errorMsg && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              background: "rgba(239,68,68,0.1)",
              border: "1px solid var(--color-danger)",
              color: "var(--color-danger)",
              fontSize: 13,
            }}
          >
            {errorMsg}
          </div>
        )}

        {state !== "success" && state !== "cooldown" && (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                Mesa (opcional)
              </label>
              <input
                type="text"
                placeholder="Ej. 5, barra, terraza…"
                value={tableLabel}
                onChange={(e) => setTableLabel(e.target.value)}
                maxLength={40}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--border-subtle)",
                  background: "var(--bg-elevated)",
                  color: "var(--text-primary)",
                  fontSize: 14,
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                Nota (opcional)
              </label>
              <textarea
                placeholder="Ej. Traer la cuenta, más agua…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                maxLength={200}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--border-subtle)",
                  background: "var(--bg-elevated)",
                  color: "var(--text-primary)",
                  fontSize: 14,
                  outline: "none",
                  fontFamily: "inherit",
                  resize: "none",
                }}
              />
            </div>

            <button
              onClick={() => void handleSend()}
              disabled={state === "sending"}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "13px 16px",
                borderRadius: 12,
                border: "none",
                background: "var(--color-brand)",
                color: "#ffffff",
                fontSize: 15,
                fontWeight: 600,
                cursor: state === "sending" ? "default" : "pointer",
                opacity: state === "sending" ? 0.7 : 1,
              }}
            >
              {state === "sending" && <IconLoader2 size={18} className="spin" />}
              {state === "sending" ? "Notificando…" : "Llamar al mesero"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
