"use client";

/**
 * RoomHub — Post-login hub for /c/[token].
 * Shown after the user has a session. Calls join_room_via_qr on mount to
 * ensure membership, then presents three actions: Menú · Llamar al servicio
 * · Entrar al chat.
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  IconToolsKitchen2,
  IconBell,
  IconMessages,
  IconLoader2,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { WaiterSheet } from "@/components/c/WaiterSheet";

interface Props {
  token: string;
  roomId: string;
  businessId: string;
  isSubRoom: boolean;
  userId: string;
}

type JoinState = "joining" | "ok" | "invalid_qr" | "error";

export function RoomHub({ token, roomId, businessId, isSubRoom, userId }: Props) {
  const router = useRouter();
  const [joinState, setJoinState] = useState<JoinState>("joining");
  const [retryCount, setRetryCount] = useState(0);
  const [showWaiter, setShowWaiter] = useState(false);
  const [showMenuMsg, setShowMenuMsg] = useState(false);

  // Ensure membership on mount (or retry). join_room_via_qr is idempotent —
  // if membership already exists it just renews the 24h window.
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setJoinState("ok");
      return;
    }

    setJoinState("joining");

    void (async () => {
      const { error } = await supabase.rpc("join_room_via_qr", { token });

      if (!error) {
        setJoinState("ok");
        return;
      }

      const msg = (error as { message?: string }).message ?? "";

      if (msg.includes("auth_required")) {
        // Session expired between server render and client load — redirect to login.
        router.push(`/auth/login?next=${encodeURIComponent(`/c/${token}`)}`);
        return;
      }

      if (msg.includes("invalid_qr")) {
        setJoinState("invalid_qr");
        return;
      }

      setJoinState("error");
    })();
    // retryCount is intentional: incrementing it triggers a re-join attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, retryCount]);

  const btnBase: React.CSSProperties = {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "15px 18px",
    borderRadius: 14,
    border: "none",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "left" as const,
    transition: "opacity 0.15s",
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (joinState === "joining") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          padding: "14px 0",
          color: "var(--text-secondary)",
          fontSize: 14,
        }}
      >
        <IconLoader2 size={18} className="spin" />
        Verificando acceso…
      </div>
    );
  }

  // ── QR renewed between server render and client join ─────────────────────────
  if (joinState === "invalid_qr") {
    return (
      <div
        style={{
          padding: "12px 14px",
          borderRadius: 12,
          background: "rgba(239,68,68,0.1)",
          border: "1px solid var(--color-danger)",
          color: "var(--color-danger)",
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        Este QR ya no es válido. Pide el nuevo código al establecimiento.
      </div>
    );
  }

  // ── Generic join error ────────────────────────────────────────────────────────
  if (joinState === "error") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
          No se pudo verificar el acceso. Intenta de nuevo.
        </p>
        <button
          type="button"
          onClick={() => setRetryCount((c) => c + 1)}
          style={{
            ...btnBase,
            background: "var(--bg-elevated)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-subtle)",
            justifyContent: "center",
          }}
        >
          Reintentar
        </button>
      </div>
    );
  }

  // ── Hub ───────────────────────────────────────────────────────────────────────
  return (
    <>
      {isSubRoom && (
        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 4px", lineHeight: 1.5 }}>
          También tienes acceso a la sala principal del lugar.
        </p>
      )}

      <p
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: "var(--text-tertiary)",
          margin: 0,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        ¿Qué quieres hacer?
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* MENÚ — coming soon */}
        <div>
          <button
            type="button"
            onClick={() => setShowMenuMsg((v) => !v)}
            style={{
              ...btnBase,
              background: "var(--color-brand-light)",
              color: "var(--color-brand)",
              border: "1px solid rgba(92,124,250,0.3)",
              opacity: 0.8,
              cursor: "default",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "var(--color-brand)",
                color: "#fff",
                flexShrink: 0,
              }}
            >
              <IconToolsKitchen2 size={20} />
            </span>
            <span style={{ flex: 1 }}>Menú</span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: "3px 10px",
                borderRadius: 20,
                background: "var(--color-brand)",
                color: "#fff",
                whiteSpace: "nowrap",
              }}
            >
              pronto
            </span>
          </button>
          {showMenuMsg && (
            <p
              style={{
                fontSize: 12,
                color: "var(--text-tertiary)",
                margin: "6px 4px 0",
                lineHeight: 1.5,
              }}
            >
              El menú estará disponible próximamente.
            </p>
          )}
        </div>

        {/* LLAMAR AL SERVICIO */}
        <button
          type="button"
          onClick={() => setShowWaiter(true)}
          style={{
            ...btnBase,
            background: "var(--bg-elevated)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "var(--color-brand-light)",
              color: "var(--color-brand)",
              flexShrink: 0,
            }}
          >
            <IconBell size={20} />
          </span>
          Llamar al servicio
        </button>

        {/* ENTRAR AL CHAT */}
        <button
          type="button"
          onClick={() => router.push(`/c/${token}/room`)}
          style={{
            ...btnBase,
            background: "var(--color-brand)",
            color: "#fff",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "rgba(255,255,255,0.18)",
              flexShrink: 0,
            }}
          >
            <IconMessages size={20} />
          </span>
          Entrar al chat
        </button>
      </div>

      {showWaiter && (
        <WaiterSheet
          roomId={roomId}
          businessId={businessId}
          userId={userId}
          onClose={() => setShowWaiter(false)}
        />
      )}
    </>
  );
}
