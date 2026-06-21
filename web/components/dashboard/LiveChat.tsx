"use client";

/**
 * JChat 3.0 — Live chat view (dashboard)
 * Renders a room's live message stream with Supabase Realtime + a send box.
 * RLS: messages are authenticated-read / authenticated-insert. Uses --db-* tokens.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { IconArrowLeft, IconSend, IconAlertCircle } from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

interface Message {
  id: string;
  user_id: string | null;
  body: string | null;
  created_at: string;
  is_system: boolean;
  author: string;
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function LiveChat({ roomId }: { roomId: string }) {
  const [roomName, setRoomName] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);

  const namesRef = useRef<Record<string, string>>({});
  const channelRef = useRef<RealtimeChannel | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });
  }, []);

  const namesFor = useCallback(async (ids: string[]) => {
    const missing = ids.filter((id) => id && !namesRef.current[id]);
    if (missing.length === 0) return;
    const { data } = await supabase.from("users").select("id, display_name, username").in("id", missing);
    (data ?? []).forEach((u) => {
      namesRef.current[u.id as string] =
        (u.display_name as string) || (u.username ? `@${u.username}` : "User");
    });
  }, []);

  const loadMessages = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("messages")
      .select("id, user_id, body, created_at, is_system")
      .eq("room_id", roomId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true })
      .limit(200);
    if (err) throw err;
    const rows = (data ?? []) as Omit<Message, "author">[];
    await namesFor(rows.map((m) => m.user_id).filter(Boolean) as string[]);
    setMessages(rows.map((m) => ({ ...m, author: m.user_id ? namesRef.current[m.user_id] ?? "User" : "System" })));
    scrollToBottom();
  }, [roomId, namesFor, scrollToBottom]);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!isSupabaseConfigured) {
        setRoomName("Demo Room");
        setMessages([
          { id: "d1", user_id: "x", body: "Welcome to the room! 👋", created_at: new Date(Date.now() - 60000).toISOString(), is_system: false, author: "Host" },
          { id: "d2", user_id: "y", body: "Is the kitchen still open?", created_at: new Date(Date.now() - 30000).toISOString(), is_system: false, author: "Guest" },
        ]);
        setLoading(false);
        return;
      }
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (active) setMeId(user?.id ?? null);

        const { data: room } = await supabase.from("rooms").select("name").eq("id", roomId).maybeSingle();
        if (active && room) setRoomName((room as { name: string }).name);

        await loadMessages();

        channelRef.current = supabase
          .channel(`chat-${roomId}`)
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${roomId}` },
            () => {
              void loadMessages().catch(() => {});
            },
          )
          .subscribe();
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Failed to load chat.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      if (channelRef.current) void supabase.removeChannel(channelRef.current);
    };
  }, [roomId, loadMessages]);

  async function send() {
    const body = input.trim();
    if (!body) return;
    setSending(true);
    setError(null);
    try {
      if (!isSupabaseConfigured) {
        setMessages((prev) => [
          ...prev,
          { id: `local-${Date.now()}`, user_id: meId ?? "me", body, created_at: new Date().toISOString(), is_system: false, author: "You" },
        ]);
        setInput("");
        scrollToBottom();
        return;
      }
      if (!meId) {
        setError("You must be signed in to send messages.");
        return;
      }
      const { error: insErr } = await supabase.from("messages").insert({ room_id: roomId, user_id: meId, body, type: "text" });
      if (insErr) throw insErr;
      setInput("");
      await loadMessages();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ maxWidth: "860px", margin: "0 auto", display: "flex", flexDirection: "column", height: "calc(100vh - 96px)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", paddingBottom: "12px", borderBottom: "1px solid var(--db-border)" }}>
        <Link
          href="/dashboard/chat-rooms"
          aria-label="Back to chat rooms"
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "34px", height: "34px", borderRadius: "8px", border: "1px solid var(--db-border)", background: "var(--db-bg-surface)", color: "var(--db-text-secondary)" }}
        >
          <IconArrowLeft size={18} />
        </Link>
        <div>
          <h1 style={{ fontSize: "18px", fontWeight: 700, color: "var(--db-text-primary)", margin: 0 }}>
            {roomName || "Room chat"}
          </h1>
          <p style={{ fontSize: "12px", color: "var(--db-text-tertiary)", margin: 0 }}>Live · messages update in real time</p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "16px 4px", display: "flex", flexDirection: "column", gap: "10px" }}>
        {loading ? (
          <div style={{ color: "var(--db-text-secondary)", fontSize: "14px", padding: "20px" }}>Loading messages…</div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--db-text-tertiary)", fontSize: "14px", padding: "40px" }}>
            No messages yet. Say hello 👋
          </div>
        ) : (
          messages.map((m) => {
            if (m.is_system) {
              return (
                <div key={m.id} style={{ alignSelf: "center", fontSize: "12px", color: "var(--db-text-tertiary)", background: "var(--db-bg-elevated)", borderRadius: "999px", padding: "3px 12px" }}>
                  {m.body}
                </div>
              );
            }
            const mine = m.user_id === meId;
            return (
              <div key={m.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "72%" }}>
                {!mine && <div style={{ fontSize: "11px", color: "var(--db-text-tertiary)", marginBottom: "2px", marginLeft: "4px" }}>{m.author}</div>}
                <div
                  style={{
                    padding: "8px 12px",
                    borderRadius: "12px",
                    background: mine ? "var(--db-accent)" : "var(--db-bg-elevated)",
                    color: mine ? "var(--db-accent-text)" : "var(--db-text-primary)",
                    fontSize: "14px",
                    wordBreak: "break-word",
                  }}
                >
                  {m.body}
                </div>
                <div style={{ fontSize: "10px", color: "var(--db-text-tertiary)", marginTop: "2px", textAlign: mine ? "right" : "left", padding: "0 4px" }}>
                  {timeOf(m.created_at)}
                </div>
              </div>
            );
          })
        )}
      </div>

      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", borderRadius: "8px", background: "rgba(239,68,68,0.12)", color: "var(--db-danger)", fontSize: "13px", marginBottom: "8px" }}>
          <IconAlertCircle size={14} />
          {error}
        </div>
      )}

      {/* Composer */}
      <div style={{ display: "flex", gap: "8px", paddingTop: "12px", borderTop: "1px solid var(--db-border)" }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Type a message…"
          style={{ flex: 1, padding: "10px 14px", borderRadius: "10px", border: "1px solid var(--db-border)", background: "var(--db-bg-surface)", color: "var(--db-text-primary)", fontSize: "14px", outline: "none" }}
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={sending || !input.trim()}
          style={{
            display: "inline-flex", alignItems: "center", gap: "6px", padding: "10px 16px", borderRadius: "10px",
            border: "none", background: "var(--db-accent)", color: "var(--db-accent-text)", fontSize: "14px", fontWeight: 600,
            cursor: sending || !input.trim() ? "not-allowed" : "pointer", opacity: sending || !input.trim() ? 0.6 : 1,
          }}
        >
          <IconSend size={16} />
          Send
        </button>
      </div>
    </div>
  );
}
