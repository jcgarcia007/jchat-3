"use client";

/**
 * RoomHub — Post-login hub for /c/[token].
 * Shown after the user has a session. Calls join_room_via_qr on mount to
 * ensure membership, then presents three actions: Menú · Llamar al servicio
 * · Entrar al chat.
 *
 * Menu button behavior:
 *   menu_mode='external' + external_menu_url → opens URL in new tab
 *   menu_mode='web'                          → "Próximamente" (future)
 *   menu_mode='none' (or unset)              → "Próximamente" / disabled
 */

import { useTranslations } from "next-intl";
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
  const t = useTranslations("qrEntry");
  const router = useRouter();
  const [joinState, setJoinState] = useState<JoinState>("joining");
  const [retryCount, setRetryCount] = useState(0);
  const [showWaiter, setShowWaiter] = useState(false);

  // Menu mode from businesses table
  const [menuMode, setMenuMode] = useState<"none" | "external" | "web">("none");
  const [externalMenuUrl, setExternalMenuUrl] = useState<string | null>(null);
  const [bizSlug, setBizSlug] = useState<string | null>(null);

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

  // Fetch menu_mode + external_menu_url from the business (read-only, public fields).
  useEffect(() => {
    if (!isSupabaseConfigured || !businessId) return;

    void (async () => {
      const { data } = await supabase
        .from("businesses")
        .select("slug, menu_mode, external_menu_url")
        .eq("id", businessId)
        .maybeSingle();

      if (data) {
        setMenuMode((data.menu_mode as "none" | "external" | "web") ?? "none");
        setExternalMenuUrl(data.external_menu_url ?? null);
        setBizSlug((data as unknown as { slug?: string }).slug ?? null);
      }
    })();
  }, [businessId]);

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
        {t("verifyingAccess")}
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
          background: "rgb(var(--color-danger-rgb) / 0.1)",
          border: "1px solid var(--color-danger)",
          color: "var(--color-danger)",
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        {t("invalidQrShort")}
      </div>
    );
  }

  // ── Generic join error ────────────────────────────────────────────────────────
  if (joinState === "error") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
          {t("verifyFailed")}
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
          {t("retry")}
        </button>
      </div>
    );
  }

  // ── Derived: menu button state ────────────────────────────────────────────────
  const menuIsExternal = menuMode === "external" && !!externalMenuUrl;
  const menuIsWeb = menuMode === "web" && !!bizSlug;

  // ── Hub ───────────────────────────────────────────────────────────────────────
  return (
    <>
      {isSubRoom && (
        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 4px", lineHeight: 1.5 }}>
          {t("alsoMainRoomHub")}
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
        {t("whatToDo")}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* MENÚ */}
        {menuIsExternal ? (
          <a
            href={externalMenuUrl!}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              ...btnBase,
              background: "var(--color-brand-light)",
              color: "var(--color-brand)",
              border: "1px solid rgb(var(--color-brand-rgb) / 0.3)",
              textDecoration: "none",
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
                color: "var(--on-brand)",
                flexShrink: 0,
              }}
            >
              <IconToolsKitchen2 size={20} />
            </span>
            <span style={{ flex: 1 }}>{t("menu")}</span>
            <span style={{ fontSize: 11, color: "var(--color-brand)", opacity: 0.7 }}>↗</span>
          </a>
        ) : menuIsWeb ? (
          <a
            href={`/m/${bizSlug}`}
            style={{
              ...btnBase,
              background: "var(--color-brand-light)",
              color: "var(--color-brand)",
              border: "1px solid rgb(var(--color-brand-rgb) / 0.3)",
              textDecoration: "none",
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
                color: "var(--on-brand)",
                flexShrink: 0,
              }}
            >
              <IconToolsKitchen2 size={20} />
            </span>
            <span style={{ flex: 1 }}>{t("menu")}</span>
          </a>
        ) : (
          <button
            type="button"
            disabled
            style={{
              ...btnBase,
              background: "var(--color-brand-light)",
              color: "var(--color-brand)",
              border: "1px solid rgb(var(--color-brand-rgb) / 0.3)",
              opacity: 0.6,
              cursor: "not-allowed",
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
                color: "var(--on-brand)",
                flexShrink: 0,
              }}
            >
              <IconToolsKitchen2 size={20} />
            </span>
            <span style={{ flex: 1 }}>{t("menu")}</span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: "3px 10px",
                borderRadius: 20,
                background: "var(--color-brand)",
                color: "var(--on-brand)",
                whiteSpace: "nowrap",
              }}
            >
              {t("soon")}
            </span>
          </button>
        )}

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
          {t("callService")}
        </button>

        {/* ENTRAR AL CHAT */}
        <button
          type="button"
          onClick={() => router.push(`/c/${token}/room`)}
          style={{
            ...btnBase,
            background: "var(--color-brand)",
            color: "var(--on-brand)",
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
              background: "rgb(var(--white-rgb) / 0.18)",
              flexShrink: 0,
            }}
          >
            <IconMessages size={20} />
          </span>
          {t("enterChat")}
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
