"use client";

/**
 * ChatRoom — Client Component for /c/[token]/room (Pieza 3a/3b/3c + Fase 2)
 * Handles: message load, realtime INSERT, send text, upload+send photo,
 * role badges (Dueño/Staff), incognito identity masking,
 * and "Llamar al mesero" service_calls insert with cooldown.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { IconSend, IconArrowLeft, IconLoader2, IconCamera, IconToolsKitchen2, IconBell, IconHeart, IconX, IconPlus } from "@tabler/icons-react";
import Link from "next/link";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { getBusinessRoleMap, type ChatRole } from "@/lib/roleBadges";
import { getChatTheme } from "@/lib/chatThemes";

const WAITER_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

const PAGE_SIZE = 50;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB

// ── Types ─────────────────────────────────────────────────────────────────────

interface MessageSender {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface PresenceUser {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  isIncognito: boolean;
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

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0]! + parts[1][0]!).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function buildPresentUsers(state: Record<string, unknown[]>): PresenceUser[] {
  const seen = new Set<string>();
  const result: PresenceUser[] = [];
  for (const presences of Object.values(state)) {
    for (const raw of presences) {
      const p = raw as {
        user_id?: string;
        display_name?: string | null;
        avatar_url?: string | null;
        is_incognito?: boolean;
        nickname?: string | null;
      };
      if (!p.user_id || seen.has(p.user_id)) continue;
      seen.add(p.user_id);
      const incognito = p.is_incognito === true;
      result.push({
        userId: p.user_id,
        displayName: incognito
          ? (p.nickname?.trim() || "Anónimo")
          : (p.display_name?.trim() || "Usuario"),
        avatarUrl: incognito ? null : (p.avatar_url ?? null),
        isIncognito: incognito,
      });
    }
  }
  return result;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  token: string;
  roomId: string;
  roomName: string;
  businessName: string;
  businessId: string;
  userId: string;
  chatThemeId?: number;
}

export function ChatRoom({ token, roomId, roomName, businessName, businessId, userId, chatThemeId = 1 }: Props) {
  const theme = getChatTheme(chatThemeId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ok" | "no_access" | "error">("loading");
  const [roleMap, setRoleMap] = useState<Map<string, ChatRole>>(new Map());
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [showAttachPanel, setShowAttachPanel] = useState(false);
  const [presentUsers, setPresentUsers] = useState<PresenceUser[]>([]);

  // ── Waiter call state ─────────────────────────────────────────────────────────
  const [showWaiterSheet, setShowWaiterSheet] = useState(false);
  const [waiterTableLabel, setWaiterTableLabel] = useState("");
  const [waiterNotes, setWaiterNotes] = useState("");
  type WaiterState = "idle" | "sending" | "success" | "cooldown" | "error";
  const [waiterState, setWaiterState] = useState<WaiterState>("idle");
  const [waiterError, setWaiterError] = useState<string | null>(null);
  const [cooldownSecsLeft, setCooldownSecsLeft] = useState(0);
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const presenceChannelRef = useRef<RealtimeChannel | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachPanelRef = useRef<HTMLDivElement>(null);
  // Scroll container + guards for the "keep pinned to bottom" behavior. During
  // the initial-load window we re-anchor to the bottom whenever a message image
  // finishes loading (its height was unknown → the list grew after the first
  // snap). We stop as soon as the user scrolls up to read history.
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const initialScrollWindowRef = useRef(false);
  const userScrolledUpRef = useRef(false);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
  }, []);

  // Mark that the user scrolled away from the bottom (reading older messages),
  // which disables the initial-load auto-follow so we never yank them down.
  const handleListScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
    if (distanceFromBottom > 300) userScrolledUpRef.current = true;
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

  // Auto-scroll on initial load. Open a short "initial window" during which
  // image onLoad handlers re-anchor to the bottom (heights become known after
  // the first snap). Double rAF gives the first layout pass time to run.
  useEffect(() => {
    if (loadState !== "ok") return;
    initialScrollWindowRef.current = true;
    userScrolledUpRef.current = false;
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollToBottom("instant" as ScrollBehavior));
    });
    const closeWindow = setTimeout(() => {
      initialScrollWindowRef.current = false;
    }, 2000);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(closeWindow);
    };
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

  // ── Presence subscription ────────────────────────────────────────────────────
  useEffect(() => {
    if (loadState !== "ok") return;

    if (!isSupabaseConfigured) {
      // Demo mode: show the current user as sole presence
      setPresentUsers([{ userId, displayName: "Tú (demo)", avatarUrl: null, isIncognito: false }]);
      return;
    }

    let isMounted = true;

    async function setupPresence() {
      // Fetch current user profile for the presence payload
      const { data: profile } = await supabase
        .from("users")
        .select("display_name, username, avatar_url")
        .eq("id", userId)
        .maybeSingle();

      if (!isMounted) return;

      const p = profile as { display_name?: string | null; username?: string | null; avatar_url?: string | null } | null;
      const displayName = p?.display_name?.trim() || p?.username?.trim() || "Usuario";
      const avatarUrl = p?.avatar_url ?? null;

      const trackPayload = {
        user_id: userId,
        display_name: displayName,
        avatar_url: avatarUrl,
        // Debt: web has no per-user incognito state — always false for own presence.
        // Other users' incognito flag is honoured via their own payload.
        is_incognito: false,
        nickname: null as string | null,
      };

      const ch = supabase.channel(`presence:${roomId}`, {
        config: { presence: { key: userId } },
      });

      presenceChannelRef.current = ch;

      // Immediately clean up if unmounted between async operations
      if (!isMounted) {
        void supabase.removeChannel(ch);
        presenceChannelRef.current = null;
        return;
      }

      function handleSync() {
        if (!isMounted) return;
        setPresentUsers(buildPresentUsers(ch.presenceState() as Record<string, unknown[]>));
      }

      ch
        .on("presence", { event: "sync" }, handleSync)
        .on("presence", { event: "join" }, handleSync)
        .on("presence", { event: "leave" }, handleSync)
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED" && isMounted) {
            await ch.track(trackPayload);
          }
        });
    }

    void setupPresence();

    return () => {
      isMounted = false;
      const ch = presenceChannelRef.current;
      if (ch) {
        void ch.untrack().finally(() => {
          void supabase.removeChannel(ch);
        });
        presenceChannelRef.current = null;
      }
    };
  }, [loadState, roomId, userId]);

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

  // ── Waiter cooldown countdown ─────────────────────────────────────────────────
  function startCooldownTimer() {
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    const endsAt = Date.now() + WAITER_COOLDOWN_MS;
    setCooldownSecsLeft(Math.ceil(WAITER_COOLDOWN_MS / 1000));
    cooldownTimerRef.current = setInterval(() => {
      const remaining = Math.ceil((endsAt - Date.now()) / 1000);
      if (remaining <= 0) {
        if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
        setCooldownSecsLeft(0);
        setWaiterState("idle");
      } else {
        setCooldownSecsLeft(remaining);
      }
    }, 1000);
  }

  // Clear timer on unmount
  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    };
  }, []);

  // Close attach panel on click-outside
  useEffect(() => {
    if (!showAttachPanel) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        attachPanelRef.current &&
        !attachPanelRef.current.contains(e.target as Node)
      ) {
        setShowAttachPanel(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showAttachPanel]);

  // ── Call waiter ───────────────────────────────────────────────────────────────
  async function handleCallWaiter() {
    if (waiterState === "sending" || waiterState === "cooldown") return;
    setWaiterState("sending");
    setWaiterError(null);

    const tableLabel = waiterTableLabel.trim() || null;
    const notes = waiterNotes.trim() || null;

    const { error } = await supabase.from("service_calls").insert({
      room_id: roomId,
      business_id: businessId,
      user_id: userId,
      type: "waiter",
      table_label: tableLabel,
      notes,
      status: "pending",
    });

    if (!error) {
      setWaiterState("success");
      startCooldownTimer();
      // Auto-close sheet after brief success display
      setTimeout(() => {
        setShowWaiterSheet(false);
        setWaiterTableLabel("");
        setWaiterNotes("");
        // Transition from success to cooldown visually on bell button
        setWaiterState("cooldown");
      }, 1800);
      return;
    }

    const msg = (error as { message?: string }).message ?? "";
    if (msg.includes("service_call_cooldown")) {
      setWaiterState("cooldown");
      setShowWaiterSheet(false);
      startCooldownTimer();
      return;
    }

    setWaiterState("error");
    setWaiterError("No se pudo enviar la llamada. Intenta de nuevo.");
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

      // Capture the image's natural dimensions in parallel with the upload so
      // the render can reserve the exact height (aspect-ratio) and the layout
      // never jumps when the photo loads.
      const dimsPromise = new Promise<{ width: number; height: number } | null>((res) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          res({ width: img.naturalWidth, height: img.naturalHeight });
          URL.revokeObjectURL(url);
        };
        img.onerror = () => {
          res(null);
          URL.revokeObjectURL(url);
        };
        img.src = url;
      });

      const [{ error: uploadErr }, dims] = await Promise.all([
        supabase.storage
          .from("post-media")
          .upload(path, file, { contentType: file.type, upsert: false }),
        dimsPromise,
      ]);

      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage
        .from("post-media")
        .getPublicUrl(path);

      const { error: msgErr } = await supabase.from("messages").insert({
        room_id: roomId,
        user_id: userId,
        body: "",
        type: "photo",
        media_url: urlData.publicUrl,
        metadata: dims ? { width: dims.width, height: dims.height } : {},
      });

      if (msgErr) throw msgErr;
      // Message appears via realtime subscription
    } catch {
      setSendError("No se pudo enviar la imagen. Intenta de nuevo.");
    } finally {
      setUploading(false);
    }
  }

  // ── Theme-aware styles ────────────────────────────────────────────────────────
  const s = {
    wrap: {
      height: "100svh",
      display: "flex",
      flexDirection: "column" as const,
      background: theme.bg,
      color: theme.bubbleInText,
      overflow: "hidden",
      position: "relative" as const,
    } satisfies React.CSSProperties,

    header: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "12px 16px",
      background: theme.topBg,
      borderBottom: `1px solid ${theme.border}`,
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
      position: "relative",
      display: "flex",
      alignItems: "flex-end",
      gap: 8,
      padding: "10px 12px",
      background: theme.inputBg,
      borderTop: `1px solid ${theme.border}`,
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
            background: theme.inputBg,
            color: theme.bubbleInText,
            textDecoration: "none",
            flexShrink: 0,
            opacity: 0.8,
          }}
        >
          <IconArrowLeft size={18} />
        </Link>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: theme.bubbleInText,
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
              color: theme.bubbleInText,
              opacity: 0.55,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {businessName}
          </div>
        </div>
      </div>

      {/* Presence bar — horizontal avatar strip under header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 12px",
          background: theme.topBg,
          borderBottom: `1px solid ${theme.border}`,
          overflowX: "auto",
          flexShrink: 0,
          minHeight: 46,
          // Hide native scrollbar while keeping scroll
          scrollbarWidth: "none",
        }}
      >
        {presentUsers.length === 0 ? (
          <span
            style={{
              fontSize: 11,
              color: theme.bubbleInText,
              opacity: 0.35,
              whiteSpace: "nowrap",
            }}
          >
            Conectando…
          </span>
        ) : (
          <>
            {presentUsers.map((u) => (
              <div
                key={u.userId}
                title={u.displayName}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  overflow: "hidden",
                  background: theme.accent,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: u.isIncognito ? 18 : 12,
                  fontWeight: 700,
                  color: theme.bubbleOutText,
                  // Highlight own avatar with a border ring
                  boxSizing: "border-box" as const,
                  border: u.userId === userId
                    ? `2px solid ${theme.bubbleInText}`
                    : "2px solid transparent",
                  opacity: u.isIncognito ? 0.78 : 1,
                  cursor: "default",
                }}
              >
                {u.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={u.avatarUrl}
                    alt={u.displayName}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : u.isIncognito ? (
                  "🎭"
                ) : (
                  getInitials(u.displayName)
                )}
              </div>
            ))}
            <span
              style={{
                fontSize: 11,
                color: theme.bubbleInText,
                opacity: 0.5,
                whiteSpace: "nowrap",
                marginLeft: 4,
              }}
            >
              {presentUsers.length} en línea
            </span>
          </>
        )}
      </div>

      {/* Message list */}
      <div ref={scrollContainerRef} onScroll={handleListScroll} style={s.msgList}>
        {messages.length === 0 && (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: theme.bubbleInText,
              opacity: 0.45,
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
                  color: theme.bubbleInText,
                  opacity: 0.5,
                  padding: "4px 0",
                }}
              >
                {msg.body}
              </div>
            );
          }

          const incognito = isIncognito(msg);
          const authorRole = incognito ? null : (roleMap.get(msg.user_id) ?? null);
          const isImage = (msg.type === "photo" || msg.type === "image") && !!msg.media_url;
          // Stored natural dimensions (photos sent after this fix) let us reserve
          // the exact height via aspect-ratio so the layout never jumps.
          const imgW = typeof msg.metadata?.width === "number" ? msg.metadata.width : undefined;
          const imgH = typeof msg.metadata?.height === "number" ? msg.metadata.height : undefined;

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
                      color: incognito ? theme.bubbleInText : theme.accent,
                      opacity: incognito ? 0.65 : 1,
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
                    background: isOwn ? theme.bubbleOutBg : theme.bubbleInBg,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={msg.media_url!}
                    alt="Imagen enviada"
                    onLoad={() => {
                      // Safety net for legacy photos with no stored dims: while
                      // the list is still settling on entry and the user hasn't
                      // scrolled up, re-anchor to the bottom after the image grows.
                      if (initialScrollWindowRef.current && !userScrolledUpRef.current) {
                        scrollToBottom("instant" as ScrollBehavior);
                      }
                    }}
                    style={{
                      display: "block",
                      maxWidth: 220,
                      width: "100%",
                      height: "auto",
                      ...(imgW && imgH ? { aspectRatio: `${imgW} / ${imgH}` } : {}),
                    }}
                  />
                  {msg.body && (
                    <p
                      style={{
                        margin: 0,
                        padding: "6px 10px 8px",
                        fontSize: 13,
                        color: isOwn ? theme.bubbleOutText : theme.bubbleInText,
                        opacity: 0.75,
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
                    background: isOwn ? theme.bubbleOutBg : theme.bubbleInBg,
                    color: isOwn ? theme.bubbleOutText : theme.bubbleInText,
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
                  color: isOwn ? theme.bubbleOutText : theme.bubbleInText,
                  opacity: 0.45,
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
              background: theme.topBg,
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

        {/* "+" attach button + floating panel */}
        <div ref={attachPanelRef} style={{ flexShrink: 0 }}>
          {/* Floating attach panel — horizontal cards matching mobile AttachmentPanel */}
          {showAttachPanel && (
            <div
              style={{
                position: "absolute",
                bottom: 54,
                left: 0,
                right: 0,
                background: theme.topBg,
                border: `1px solid ${theme.border}`,
                borderRadius: 16,
                padding: 10,
                display: "flex",
                flexDirection: "row",
                flexWrap: "nowrap",
                gap: 8,
                boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
                zIndex: 20,
              }}
            >
              {/* Foto */}
              <button
                type="button"
                onClick={() => {
                  setShowAttachPanel(false);
                  fileInputRef.current?.click();
                }}
                disabled={uploading || sending}
                style={{
                  flex: 1,
                  minWidth: 62,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  padding: "12px 8px",
                  borderRadius: 14,
                  border: `1px solid ${theme.border}`,
                  background: theme.bubbleInBg,
                  cursor: uploading || sending ? "default" : "pointer",
                  opacity: uploading || sending ? 0.5 : 1,
                }}
              >
                {uploading
                  ? <IconLoader2 size={24} className="spin" style={{ color: theme.accent }} />
                  : <IconCamera size={24} style={{ color: theme.accent }} />
                }
                <span style={{ fontSize: 11, fontWeight: 600, color: theme.bubbleInText, whiteSpace: "nowrap" }}>
                  {uploading ? "Subiendo…" : "Foto"}
                </span>
              </button>

              {/* Menú — disabled, coming soon */}
              <div
                style={{
                  flex: 1,
                  minWidth: 62,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  padding: "12px 8px",
                  borderRadius: 14,
                  border: `1px solid ${theme.border}`,
                  background: theme.bubbleInBg,
                  opacity: 0.72,
                  cursor: "default",
                }}
              >
                <IconToolsKitchen2 size={24} style={{ color: theme.accent }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: theme.bubbleInText, whiteSpace: "nowrap" }}>
                  Menú
                </span>
                <span style={{ fontSize: 9, color: theme.bubbleInText, opacity: 0.55, marginTop: -2 }}>
                  pronto
                </span>
              </div>

              {/* Servicio */}
              <button
                type="button"
                onClick={() => {
                  setShowAttachPanel(false);
                  if (waiterState === "cooldown") return;
                  setWaiterState("idle");
                  setWaiterError(null);
                  setShowWaiterSheet(true);
                }}
                style={{
                  flex: 1,
                  minWidth: 62,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  padding: "12px 8px",
                  borderRadius: 14,
                  border: `1px solid ${theme.border}`,
                  background: theme.bubbleInBg,
                  cursor: "pointer",
                  opacity: waiterState === "cooldown" ? 0.5 : 1,
                }}
              >
                <IconBell size={24} style={{ color: theme.accent }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: theme.bubbleInText, whiteSpace: "nowrap" }}>
                  {waiterState === "cooldown" ? `${cooldownSecsLeft}s` : "Servicio"}
                </span>
              </button>

              {/* Match — disabled, coming soon */}
              <div
                style={{
                  flex: 1,
                  minWidth: 62,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  padding: "12px 8px",
                  borderRadius: 14,
                  border: `1px solid ${theme.border}`,
                  background: theme.bubbleInBg,
                  opacity: 0.72,
                  cursor: "default",
                }}
              >
                <IconHeart size={24} style={{ color: theme.accent }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: theme.bubbleInText, whiteSpace: "nowrap" }}>
                  Match
                </span>
                <span style={{ fontSize: 9, color: theme.bubbleInText, opacity: 0.55, marginTop: -2 }}>
                  pronto
                </span>
              </div>
            </div>
          )}

          {/* "+" / "×" toggle button */}
          <button
            type="button"
            onClick={() => setShowAttachPanel((v) => !v)}
            aria-label={showAttachPanel ? "Cerrar opciones" : "Adjuntar"}
            title={showAttachPanel ? "Cerrar" : "Adjuntar foto o llamar al mesero"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 42,
              height: 42,
              borderRadius: 12,
              border: `1px solid ${theme.border}`,
              background: showAttachPanel ? theme.bubbleInBg : theme.inputBg,
              color: showAttachPanel ? theme.accent : theme.bubbleInText,
              opacity: showAttachPanel ? 1 : 0.75,
              cursor: "pointer",
              transition: "background 0.15s, color 0.15s",
            }}
          >
            {showAttachPanel ? <IconX size={18} /> : <IconPlus size={18} />}
          </button>
        </div>

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
            border: `1px solid ${theme.border}`,
            background: theme.inputBg,
            color: theme.bubbleInText,
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
            background: theme.accent,
            color: theme.bubbleOutText,
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

      {/* ── Waiter sheet (bottom-sheet overlay) ─────────────────────────────── */}
      {showWaiterSheet && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Llamar al mesero"
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            zIndex: 50,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowWaiterSheet(false);
          }}
        >
          <div
            style={{
              background: theme.topBg,
              borderRadius: "20px 20px 0 0",
              padding: "20px 20px 32px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
              maxHeight: "80vh",
              overflowY: "auto",
            }}
          >
            {/* Handle + title row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <IconBell size={20} style={{ color: theme.accent }} />
                <span style={{ fontSize: 16, fontWeight: 700, color: theme.bubbleInText }}>
                  Llamar al mesero
                </span>
              </div>
              <button
                onClick={() => setShowWaiterSheet(false)}
                aria-label="Cerrar"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  border: "none",
                  background: theme.inputBg,
                  color: theme.bubbleInText,
                  opacity: 0.7,
                  cursor: "pointer",
                }}
              >
                <IconX size={16} />
              </button>
            </div>

            {/* Success state */}
            {waiterState === "success" && (
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

            {/* Error state */}
            {waiterState === "error" && waiterError && (
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
                {waiterError}
              </div>
            )}

            {/* Form fields (hidden after success) */}
            {waiterState !== "success" && (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: theme.bubbleInText,
                      opacity: 0.6,
                    }}
                  >
                    Mesa (opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. 5, barra, terraza…"
                    value={waiterTableLabel}
                    onChange={(e) => setWaiterTableLabel(e.target.value)}
                    maxLength={40}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: `1px solid ${theme.border}`,
                      background: theme.inputBg,
                      color: theme.bubbleInText,
                      fontSize: 14,
                      outline: "none",
                      fontFamily: "inherit",
                    }}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: theme.bubbleInText,
                      opacity: 0.6,
                    }}
                  >
                    Nota (opcional)
                  </label>
                  <textarea
                    placeholder="Ej. Traer la cuenta, más agua…"
                    value={waiterNotes}
                    onChange={(e) => setWaiterNotes(e.target.value)}
                    rows={2}
                    maxLength={200}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: `1px solid ${theme.border}`,
                      background: theme.inputBg,
                      color: theme.bubbleInText,
                      fontSize: 14,
                      outline: "none",
                      fontFamily: "inherit",
                      resize: "none",
                    }}
                  />
                </div>

                <button
                  onClick={() => void handleCallWaiter()}
                  disabled={waiterState === "sending"}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: "13px 16px",
                    borderRadius: 12,
                    border: "none",
                    background: theme.accent,
                    color: theme.bubbleOutText,
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: waiterState === "sending" ? "default" : "pointer",
                    opacity: waiterState === "sending" ? 0.7 : 1,
                    transition: "opacity 0.15s",
                  }}
                >
                  {waiterState === "sending" && (
                    <IconLoader2 size={18} className="spin" />
                  )}
                  {waiterState === "sending"
                    ? "Notificando…"
                    : "Llamar al mesero"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
