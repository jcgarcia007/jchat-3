"use client";

/**
 * JoinRoomButton — client-side join action for /c/[token]
 * Calls join_room_via_qr(token), then navigates to the live chat room.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconLoader2, IconAlertCircle } from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

interface Props {
  token: string;
}

type State = "idle" | "loading" | "error";

export function JoinRoomButton({ token }: Props) {
  const router = useRouter();
  const [state, setState] = useState<State>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleJoin() {
    if (state === "loading") return;
    setState("loading");
    setErrorMsg(null);

    if (!isSupabaseConfigured) {
      router.push(`/c/${token}/room`);
      return;
    }

    const { error } = await supabase.rpc("join_room_via_qr", { token });

    if (!error) {
      router.push(`/c/${token}/room`);
      return;
    }

    const msg = (error as { message?: string }).message ?? "";
    if (msg.includes("auth_required")) {
      router.push(
        `/auth/login?next=${encodeURIComponent(`/c/${token}`)}`
      );
      return;
    }
    if (msg.includes("invalid_qr")) {
      setState("error");
      setErrorMsg("Este código QR ya no es válido. Pide uno nuevo al establecimiento.");
      return;
    }
    setState("error");
    setErrorMsg("Algo salió mal. Intenta de nuevo.");
  }

  const btnBase: React.CSSProperties = {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "13px 16px",
    borderRadius: 12,
    border: "none",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    transition: "opacity 0.15s",
  };

  // ── Idle / Loading / Error ────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {state === "error" && errorMsg && (
        <div
          role="alert"
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            padding: "10px 12px",
            borderRadius: 10,
            background: "var(--color-brand-light)",
            border: "1px solid var(--color-danger)",
            color: "var(--color-danger)",
            fontSize: 13,
          }}
        >
          <IconAlertCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{errorMsg}</span>
        </div>
      )}

      <button
        onClick={handleJoin}
        disabled={state === "loading"}
        style={{
          ...btnBase,
          background: "var(--color-brand)",
          color: "#fff",
          opacity: state === "loading" ? 0.7 : 1,
        }}
      >
        {state === "loading" && (
          <IconLoader2 size={18} className="spin" />
        )}
        {state === "loading" ? "Entrando…" : "Entrar al chat"}
      </button>

      {state === "error" && (
        <button
          onClick={() => { setState("idle"); setErrorMsg(null); }}
          style={{
            ...btnBase,
            background: "var(--bg-elevated)",
            color: "var(--text-secondary)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          Reintentar
        </button>
      )}
    </div>
  );
}
