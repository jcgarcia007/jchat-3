"use client";

/**
 * ChatRoom — Client Component for /c/[token]/room (Pieza 3a/3b/3c)
 * Handles: message load, realtime INSERT, send text, upload+send photo,
 * role badges (Dueño/Staff), and incognito identity masking.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { IconSend, IconArrowLeft, IconLoader2, IconPhoto } from "@tabler/icons-react";
import Link from "next/link";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { getBusinessRoleMap, type ChatRole } from "@/lib/roleBadges";

const PAGE_SIZE = 50;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB

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
  media_url: string | null;
  metadata: Record<string, unknown>;
  is_system: boolean;
  created_at: string;
  users: MessageSender | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MSG_SELECT =
  "id, room_id, user_id, body, type, media_url, metadata, is_system, created_at, users(username, display_name, avatar_url)";

function isIncognito(msg: ChatMessage): boolean {
  return msg.metadata.incognito === true;
}

function senderName(msg: ChatMessage): string {
  if (isIncognito(msg)) {
    const nick = msg.metadata.nickname;
    return "🎭 " + (typeof nick === "string" && nick.trim() ? nick.trim() : "Anónimo");
  }
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

function fileExt(file: File): string {
  const parts = file.name.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "jpg";
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  token: string;
  roomId: string;
  roomName: string;
  businessName: string;
  businessId: string;
  userId: string;
}

export function ChatRoom({ token, roomId, roomName, businessName, businessId, userId }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ok" | "no_access" | "error">("loading");
  const [roleMap, setRoleMap] = useState<Map<string, ChatRole>>(new Map());
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
  }, []);

  // Fetch a single message with users join (used after realtime INSERT)
  const fetchMessage = useCallback(
    async (id: string): Promise<ChatMessage | null> => {
      const { data } = await supabase
        .from("messages")
        .select(MSG_SELECT)
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
            .select(MSG_SELECT)
            .eq("room_id", roomId)
            .order("created_at", { ascending: false })
            .limit(PAGE_SIZE),
        ]);

      if (cancelled) return;

      if (!membership) {
        setLoadState("no_access");
        return;
      }

      if (msgsErr) {
        setLoadState("error");
        return;
      }

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

  // Load role map once on entry — roles change infrequently
  useEffect(() => {
    if (loadState !== "ok") return;
    void getBusinessRoleMap(businessId).then(setRoleMap);
  }, [loadState, businessId]);

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

  // ── Send text message ──────────────────────────────────────────────────────────
  async function handleSend() {
    const body = inputText.trim();
    if (!body || sending || uploading) return;
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
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  // ── Photo upload + send ────────────────────────────────────────────────────────
  async function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset the input so the same file can be re-selected after an error
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setSendError("Solo se pueden enviar imágenes.");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setSendError("La imagen no puede superar los 10 MB.");
      return;
    }

    setSendError(null);
    setUploading(true);

    try {
      // Path: userId is the first segment — required by the storage RLS policy
      // (storage.foldername(name))[1] = auth.uid()
      const ext = fileExt(file);
      const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("post-media")
        .upload(path, file, { contentType: file.type, upsert: false });

      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage
        .from("post-media")
        .getPublicUrl(path);

      const { error: msgErr } = await supabase.from("messages").insert({
        room_id: roomId,
        user_id: userId,
        body: "",
        type: "image",
        media_url: urlData.publicUrl,
      });

      if (msgErr) throw msgErr;
      // Message appears via realtime subscription
    } catch {
      setSendError("No se pudo enviar la imagen. Intenta de nuevo.");
    } finally {
      setUploading(false);
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

  // ── Non-ok states ─────────────────────────────────────────────────────────────
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
      <div
        style={{
          ...s.wrap,
          alignItems: "center",
          justifyContent: "center",
          padding: "24px 16px",
        }}
      >
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

          const incognito = isIncognito(msg);
          const authorRole = incognito ? null : (roleMap.get(msg.user_id) ?? null);
          const isImage = msg.type === "image" && !!msg.media_url;

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
              {/* Sender name + role badge (others only) */}
              {!isOwn && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    paddingLeft: 4,
                    flexWrap: "nowrap",
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: incognito
                        ? "var(--text-secondary)"
                        : "var(--color-brand)",
                    }}
                  >
                    {senderName(msg)}
                  </span>
                  {/* CRITICAL: badge NEVER renders for incognito messages */}
                  {authorRole === "owner" && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "1px 5px",
                        borderRadius: 4,
                        background: "rgba(217,119,6,0.15)",
                        color: "var(--color-gold)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Dueño
                    </span>
                  )}
                  {authorRole === "staff" && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "1px 5px",
                        borderRadius: 4,
                        background: "var(--color-brand-light)",
                        color: "var(--color-brand)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Staff
                    </span>
                  )}
                </div>
              )}

              {/* Bubble: image or text */}
              {isImage ? (
                <div
                  style={{
                    maxWidth: "72%",
                    borderRadius: isOwn
                      ? "16px 4px 16px 16px"
                      : "4px 16px 16px 16px",
                    overflow: "hidden",
                    background: "var(--bg-elevated)",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={msg.media_url!}
                    alt="Imagen enviada"
                    style={{
                      display: "block",
                      maxWidth: 220,
                      width: "100%",
                      height: "auto",
                    }}
                  />
                  {msg.body && (
                    <p
                      style={{
                        margin: 0,
                        padding: "6px 10px 8px",
                        fontSize: 13,
                        color: "var(--text-secondary)",
                        lineHeight: 1.4,
                      }}
                    >
                      {msg.body}
                    </p>
                  )}
                </div>
              ) : (
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
              )}

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

      {/* Input row */}
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

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => void handlePhotoSelected(e)}
        />

        {/* Photo button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || sending}
          aria-label="Enviar imagen"
          title="Enviar imagen"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 42,
            height: 42,
            borderRadius: 12,
            border: "1px solid var(--border-subtle)",
            background: "var(--bg-elevated)",
            color: uploading ? "var(--color-brand)" : "var(--text-secondary)",
            cursor: uploading || sending ? "default" : "pointer",
            opacity: uploading || sending ? 0.6 : 1,
            flexShrink: 0,
            transition: "opacity 0.15s",
          }}
        >
          {uploading ? (
            <IconLoader2 size={18} className="spin" />
          ) : (
            <IconPhoto size={18} />
          )}
        </button>

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
          disabled={!inputText.trim() || sending || uploading}
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
            cursor: !inputText.trim() || sending || uploading ? "default" : "pointer",
            opacity: !inputText.trim() || sending || uploading ? 0.5 : 1,
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
