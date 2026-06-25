"use client";

/**
 * ChatRoom — Client Component for /c/[token]/room (Pieza 3a)
 * Handles: message load, realtime INSERT subscription, send, auto-scroll.
 * Scoped to text messages only — no media, badges, or incognito (3b/3c).
 */

import { useEffect, useRef, useState, useCallback } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { IconSend, IconArrowLeft, IconLoader2 } from "@tabler/icons-react";
import Link from "next/link";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

const PAGE_SIZE = 50;

// ── Types ─────────────────────────────────────────────────────────────────────

interface MessageSender {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface ChatMessage {
  id: string;
  room_id: string;
  user_id: string;
  body: string;
  type: string;
  metadata: Record<string, unknown>;
  is_system: boolean;
  created_at: string;
  users: MessageSender | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function senderName(msg: ChatMessage): string {
  if (msg.users?.display_name) return msg.users.display_name;
  if (msg.users?.username) return msg.users.username;
  return "Usuario";
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  token: string;
  roomId: string;
  roomName: string;
  businessName: string;
  userId: string;
}

export function ChatRoom({ token, roomId, roomName, businessName, userId }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ok" | "no_access" | "error">("loading");
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
  }, []);

  // Fetch a single message with the users join (used after realtime INSERT)
  const fetchMessage = useCallback(
    async (id: string): Promise<ChatMessage | null> => {
      const { data } = await supabase
        .from("messages")
        .select(
          "id, room_id, user_id, body, type, metadata, is_system, created_at, users(username, display_name, avatar_url)"
        )
        .eq("id", id)
        .maybeSingle();
      return (data as unknown as ChatMessage | null) ?? null;
    },
    []
  );

  // ── Initial load ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoadState("ok");
      return;
    }

    let cancelled = false;

    async function load() {
      // Check membership: user must have a valid room_members entry.
      // Without one, a password-protected room would silently return 0 messages.
      const [{ data: membership }, { data: msgs, error: msgsErr }] =
        await Promise.all([
          supabase
            .from("room_members")
            .select("expires_at")
            .eq("room_id", roomId)
            .eq("user_id", userId)
            .gt("expires_at", new Date().toISOString())
            .maybeSingle(),
          supabase
            .from("messages")
            .select(
              "id, room_id, user_id, body, type, metadata, is_system, created_at, users(username, display_name, avatar_url)"
            )
            .eq("room_id", roomId)
            .order("created_at", { ascending: false })
            .limit(PAGE_SIZE),
        ]);

      if (cancelled) return;

      // No valid membership → show no-access screen
      if (!membership) {
        setLoadState("no_access");
        return;
      }

      if (msgsErr) {
        setLoadState("error");
        return;
      }

      // Reverse to chronological order for display.
      // Cast via unknown: Supabase infers users as array due to FK metadata,
      // but messages.user_id is a many-to-one ref → always a single object/null.
      const sorted = ((msgs ?? []) as unknown as ChatMessage[]).slice().reverse();
      setMessages(sorted);
      setLoadState("ok");
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [roomId, userId]);

  // Auto-scroll on initial load
  useEffect(() => {
    if (loadState === "ok") {
      scrollToBottom("instant" as ScrollBehavior);
    }
  }, [loadState, scrollToBottom]);

  // ── Realtime subscription ─────────────────────────────────────────────────────
  useEffect(() => {
    if (loadState !== "ok" || !isSupabaseConfigured) return;

    channelRef.current = supabase
      .channel(`room-messages:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `room_id=eq.${roomId}`,
        },
        async (payload) => {
          const newId = (payload.new as { id: string }).id;
          const full = await fetchMessage(newId);
          if (!full) return;
          setMessages((prev) => {
            // Dedup by id — prevents doubling own messages sent optimistically
            if (prev.some((m) => m.id === full.id)) return prev;
            return [...prev, full];
          });
          scrollToBottom();
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [loadState, roomId, fetchMessage, scrollToBottom]);

  // ── Send message ──────────────────────────────────────────────────────────────
  async function handleSend() {
    const body = inputText.trim();
    if (!body || sending) return;
    setSending(true);
    setSendError(null);

    const { error } = await supabase.from("messages").insert({
      room_id: roomId,
      user_id: userId,
      body,
      type: "text",
    });

    setSending(false);

    if (error) {
      setSendError("No se pudo enviar. Intenta de nuevo.");
      return;
    }

    setInputText("");
    inputRef.current?.focus();
    // Message appears via realtime subscription
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  // ── CSS token shorthand ───────────────────────────────────────────────────────
  const s = {
    wrap: {
      height: "100svh",
      display: "flex",
      flexDirection: "column" as const,
      background: "var(--bg-base)",
      color: "var(--text-primary)",
      overflow: "hidden",
    } satisfies React.CSSProperties,

    header: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "12px 16px",
      background: "var(--bg-surface)",
      borderBottom: "1px solid var(--border-subtle)",
      flexShrink: 0,
    } satisfies React.CSSProperties,

    msgList: {
      flex: 1,
      overflowY: "auto" as const,
      padding: "12px 16px",
      display: "flex",
      flexDirection: "column" as const,
      gap: 8,
    } satisfies React.CSSProperties,

    inputRow: {
      display: "flex",
      alignItems: "flex-end",
      gap: 8,
      padding: "10px 12px",
      background: "var(--bg-surface)",
      borderTop: "1px solid var(--border-subtle)",
      flexShrink: 0,
    } satisfies React.CSSProperties,
  };

  // ── No-access / loading / error states ───────────────────────────────────────
  if (loadState === "loading") {
    return (
      <div
        style={{
          ...s.wrap,
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          color: "var(--text-secondary)",
        }}
      >
        <IconLoader2 size={32} className="spin" />
        <span style={{ fontSize: 14 }}>Cargando sala…</span>
      </div>
    );
  }

  if (loadState === "no_access") {
    return (
      <div
        style={{
          ...s.wrap,
          alignItems: "center",
          justifyContent: "center",
          padding: "24px 16px",
        }}
      >
        <div
          style={{
            maxWidth: 380,
            width: "100%",
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 20,
            padding: "28px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 40 }}>🔒</div>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 6px" }}>
              Sin acceso a esta sala
            </h2>
            <p
              style={{
                fontSize: 14,
                color: "var(--text-secondary)",
                margin: "0 0 20px",
                lineHeight: 1.5,
              }}
            >
              No tienes una membresía vigente. Escanea el código QR del lugar
              para entrar.
            </p>
          </div>
          <Link
            href={`/c/${token}`}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "12px 16px",
              borderRadius: 12,
              background: "var(--color-brand)",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Volver a la entrada
          </Link>
        </div>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div style={{ ...s.wrap, alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
        <p style={{ color: "var(--color-danger)", fontSize: 14 }}>
          Error al cargar los mensajes. Recarga la página.
        </p>
      </div>
    );
  }

  // ── Chat UI ───────────────────────────────────────────────────────────────────
  return (
    <div style={s.wrap}>
      {/* Header */}
      <div style={s.header}>
        <Link
          href={`/c/${token}`}
          aria-label="Volver"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 34,
            height: 34,
            borderRadius: 10,
            background: "var(--bg-elevated)",
            color: "var(--text-secondary)",
            textDecoration: "none",
            flexShrink: 0,
          }}
        >
          <IconArrowLeft size={18} />
        </Link>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {roomName}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--text-secondary)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {businessName}
          </div>
        </div>
      </div>

      {/* Message list */}
      <div style={s.msgList}>
        {messages.length === 0 && (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-tertiary)",
              fontSize: 14,
            }}
          >
            Sé el primero en escribir algo 👋
          </div>
        )}

        {messages.map((msg) => {
          const isOwn = msg.user_id === userId;

          if (msg.is_system || msg.type === "system") {
            return (
              <div
                key={msg.id}
                style={{
                  textAlign: "center",
                  fontSize: 12,
                  color: "var(--text-tertiary)",
                  padding: "4px 0",
                }}
              >
                {msg.body}
              </div>
            );
          }

          return (
            <div
              key={msg.id}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: isOwn ? "flex-end" : "flex-start",
                gap: 2,
              }}
            >
              {!isOwn && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--color-brand)",
                    paddingLeft: 4,
                  }}
                >
                  {senderName(msg)}
                </span>
              )}
              <div
                style={{
                  maxWidth: "78%",
                  padding: "8px 12px",
                  borderRadius: isOwn
                    ? "16px 4px 16px 16px"
                    : "4px 16px 16px 16px",
                  background: isOwn
                    ? "var(--color-brand)"
                    : "var(--bg-elevated)",
                  color: isOwn ? "#fff" : "var(--text-primary)",
                  fontSize: 14,
                  lineHeight: 1.45,
                  wordBreak: "break-word",
                }}
              >
                {msg.body}
              </div>
              <span
                style={{
                  fontSize: 10,
                  color: "var(--text-tertiary)",
                  paddingLeft: isOwn ? 0 : 4,
                  paddingRight: isOwn ? 4 : 0,
                }}
              >
                {formatTime(msg.created_at)}
              </span>
            </div>
          );
        })}

        {/* Scroll anchor */}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={s.inputRow}>
        {sendError && (
          <div
            style={{
              position: "absolute",
              bottom: 72,
              left: 12,
              right: 12,
              padding: "8px 12px",
              background: "var(--bg-surface)",
              border: "1px solid var(--color-danger)",
              borderRadius: 10,
              fontSize: 12,
              color: "var(--color-danger)",
            }}
          >
            {sendError}
          </div>
        )}
        <textarea
          ref={inputRef}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escribe un mensaje…"
          rows={1}
          style={{
            flex: 1,
            resize: "none",
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid var(--border-subtle)",
            background: "var(--bg-elevated)",
            color: "var(--text-primary)",
            fontSize: 14,
            lineHeight: 1.4,
            outline: "none",
            fontFamily: "inherit",
            maxHeight: 96,
            overflowY: "auto",
          }}
        />
        <button
          onClick={() => void handleSend()}
          disabled={!inputText.trim() || sending}
          aria-label="Enviar"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 42,
            height: 42,
            borderRadius: 12,
            border: "none",
            background: "var(--color-brand)",
            color: "#fff",
            cursor: !inputText.trim() || sending ? "default" : "pointer",
            opacity: !inputText.trim() || sending ? 0.5 : 1,
            flexShrink: 0,
            transition: "opacity 0.15s",
          }}
        >
          {sending ? (
            <IconLoader2 size={18} className="spin" />
          ) : (
            <IconSend size={18} />
          )}
        </button>
      </div>
    </div>
  );
}
