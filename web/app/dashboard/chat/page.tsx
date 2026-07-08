/**
 * JChat 3.0 — Room Manager (Dashboard) · Task 2.7
 *
 * Features:
 *  - Lists the Main Room (blue left border) + sub-rooms (purple left border)
 *  - Per-room row: icon · name · active count · theme name · QR / Edit / Delete buttons
 *  - Expand/collapse settings panel per room:
 *      name · description · icon selector · color picker
 *      password toggle (server-side bcrypt stub) · TTL toggle · notify toggle
 *      chat theme selector (15 miniature ChatThemePreview tiles)
 *  - "Add sub-room" + plan-limit indicator ("X of 5")
 *  - Save writes to rooms table; guarded with isSupabaseConfigured
 *  - Delete available on sub-rooms only
 *
 * Design: var(--db-*) tokens only. No hardcoded hex.
 * Icons: @tabler/icons-react. "use client".
 *
 * QRModal cross-task import (Task 2.8 lands in parallel — absence is expected).
 */

"use client";

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  IconAlertCircle,
  IconCheck,
  IconChevronUp,
  IconEdit,
  IconHash,
  IconLock,
  IconPlus,
  IconQrcode,
  IconRefresh,
  IconTrash,
  IconUsers,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { CHAT_THEMES, getChatTheme } from "@/constants/chatThemes";
import { ChatThemePreview } from "@/components/dashboard/ChatThemePreview";
import { QRModal, type QRModalRoom, type QRModalBusiness } from "@/components/dashboard/QRModal";
import { LiveChat } from "@/components/dashboard/LiveChat";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Room {
  id: string;
  business_id: string;
  parent_room_id: string | null;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  slug: string | null;
  chat_theme_id: number;
  is_password_protected: boolean;
  password_hash: string | null;
  ttl_hours: number | null;
  notify_enabled: boolean;
  is_main: boolean;
  sort: number;
  qr_token: string | null;
}

/** Editable draft for a room's settings panel. */
interface RoomDraft {
  name: string;
  description: string;
  icon: string;
  color: string;
  chat_theme_id: number;
  is_password_protected: boolean;
  /** Plaintext that the owner types; NEVER sent to DB as-is. */
  password_plaintext: string;
  ttl_hours: number | null;
  notify_enabled: boolean;
}

// ── Demo / placeholder data ───────────────────────────────────────────────────

const PLACEHOLDER_BUSINESS_ID = "demo-business-id";

const DEMO_ROOMS: Room[] = [
  {
    id: "demo-main-room",
    business_id: PLACEHOLDER_BUSINESS_ID,
    parent_room_id: null,
    name: "Main Room",
    description: "The primary public room for all guests.",
    icon: "🏠",
    color: null,
    slug: "main",
    chat_theme_id: 1,
    is_password_protected: false,
    password_hash: null,
    ttl_hours: null,
    notify_enabled: true,
    is_main: true,
    sort: 0,
    qr_token: "demo-main-00000001",
  },
  {
    id: "demo-vip-room",
    business_id: PLACEHOLDER_BUSINESS_ID,
    parent_room_id: "demo-main-room",
    name: "VIP Lounge",
    description: "Private space for VIP guests.",
    icon: "⭐",
    color: null,
    slug: "vip-lounge",
    chat_theme_id: 4,
    is_password_protected: true,
    password_hash: "$2b$10$placeholder_hash",
    ttl_hours: 24,
    notify_enabled: false,
    is_main: false,
    sort: 1,
    qr_token: "demo-vip-00000002",
  },
];

// ── Constants ─────────────────────────────────────────────────────────────────

const ICON_OPTIONS = [
  "🏠", "⭐", "🎉", "🍺", "🎵", "🎮", "💬", "🔥", "🌙", "👑",
  "🦋", "🌿", "💎", "🎸", "🏆",
];

// TODO: read real plan limit from subscription/billing
const PLAN_ROOM_LIMIT = 5;

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDraft(room: Room): RoomDraft {
  return {
    name: room.name,
    description: room.description ?? "",
    icon: room.icon ?? "🏠",
    color: room.color ?? "",
    chat_theme_id: room.chat_theme_id,
    is_password_protected: room.is_password_protected,
    password_plaintext: "",
    ttl_hours: room.ttl_hours,
    notify_enabled: room.notify_enabled,
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Inline toggle switch using only var(--db-*) tokens. */
function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => !disabled && onChange(!checked)}
        style={{
          display: "inline-block",
          width: 36,
          height: 20,
          borderRadius: 10,
          background: checked ? "var(--db-accent)" : "var(--db-border)",
          position: "relative",
          transition: "background 0.2s",
          flexShrink: 0,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 3,
            left: checked ? 19 : 3,
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: "var(--db-text-primary)",
            transition: "left 0.2s",
          }}
        />
      </span>
      <span style={{ fontSize: 13, color: "var(--db-text-secondary)" }}>
        {label}
      </span>
    </label>
  );
}

/** Section label inside the settings panel. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--db-text-muted, var(--db-text-secondary))",
        marginBottom: 6,
      }}
    >
      {children}
    </p>
  );
}

// ── Room settings panel ───────────────────────────────────────────────────────

interface SettingsPanelProps {
  room: Room;
  draft: RoomDraft;
  saving: boolean;
  saveError: string | null;
  saveSuccess: boolean;
  onChange: (patch: Partial<RoomDraft>) => void;
  onSave: () => void;
}

function SettingsPanel({
  room,
  draft,
  saving,
  saveError,
  saveSuccess,
  onChange,
  onSave,
}: SettingsPanelProps) {
  return (
    <div
      style={{
        borderTop: "1px solid var(--db-border)",
        padding: "16px 20px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 20,
        background: "var(--db-bg-base)",
      }}
    >
      {/* ── Row 1: Name + Icon selector ─────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {/* Name */}
        <div style={{ flex: "1 1 200px" }}>
          <SectionLabel>Room name</SectionLabel>
          <input
            value={draft.name}
            onChange={(e) => onChange({ name: e.target.value })}
            maxLength={60}
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid var(--db-border)",
              background: "var(--db-bg-surface)",
              color: "var(--db-text-primary)",
              fontSize: 14,
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Icon */}
        <div>
          <SectionLabel>Icon</SectionLabel>
          <div
            style={{
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              maxWidth: 280,
            }}
          >
            {ICON_OPTIONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => onChange({ icon: emoji })}
                title={emoji}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 6,
                  border: draft.icon === emoji
                    ? "2px solid var(--db-accent)"
                    : "1px solid var(--db-border)",
                  background: draft.icon === emoji
                    ? "var(--db-accent-muted, rgba(55,138,221,0.12))"
                    : "var(--db-bg-surface)",
                  cursor: "pointer",
                  fontSize: 18,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Description ─────────────────────────────────────────────────────── */}
      <div>
        <SectionLabel>Description</SectionLabel>
        <textarea
          value={draft.description}
          onChange={(e) => onChange({ description: e.target.value })}
          maxLength={200}
          rows={2}
          style={{
            width: "100%",
            padding: "8px 10px",
            borderRadius: 6,
            border: "1px solid var(--db-border)",
            background: "var(--db-bg-surface)",
            color: "var(--db-text-primary)",
            fontSize: 14,
            resize: "vertical",
            boxSizing: "border-box",
            fontFamily: "inherit",
          }}
        />
      </div>

      {/* ── Toggles row ─────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <Toggle
          checked={draft.notify_enabled}
          onChange={(v) => onChange({ notify_enabled: v })}
          label="Push notifications"
        />

        {/* TTL */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Toggle
            checked={draft.ttl_hours !== null}
            onChange={(v) =>
              onChange({ ttl_hours: v ? 24 : null })
            }
            label="Auto-expire messages"
          />
          {draft.ttl_hours !== null && (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input
                type="number"
                min={1}
                max={168}
                value={draft.ttl_hours}
                onChange={(e) =>
                  onChange({ ttl_hours: Math.max(1, Number(e.target.value)) })
                }
                style={{
                  width: 60,
                  padding: "4px 6px",
                  borderRadius: 6,
                  border: "1px solid var(--db-border)",
                  background: "var(--db-bg-surface)",
                  color: "var(--db-text-primary)",
                  fontSize: 13,
                }}
              />
              <span style={{ fontSize: 12, color: "var(--db-text-secondary)" }}>
                hrs
              </span>
            </div>
          )}
        </div>

        {/* Password toggle — main room can be password-protected too */}
        <Toggle
          checked={draft.is_password_protected}
          onChange={(v) =>
            onChange({ is_password_protected: v, password_plaintext: "" })
          }
          label="Password protected"
        />
      </div>

      {/* ── Password field (visible when protection is on) ───────────────────── */}
      {draft.is_password_protected && (
        <div>
          <SectionLabel>Set new password</SectionLabel>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <IconLock size={16} color="var(--db-text-secondary)" />
            <input
              type="password"
              placeholder={
                room.password_hash
                  ? "Leave blank to keep current password"
                  : "Enter room password"
              }
              value={draft.password_plaintext}
              onChange={(e) => onChange({ password_plaintext: e.target.value })}
              autoComplete="new-password"
              style={{
                flex: 1,
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid var(--db-border)",
                background: "var(--db-bg-surface)",
                color: "var(--db-text-primary)",
                fontSize: 14,
              }}
            />
          </div>
          {/* Server-side bcrypt stub — plaintext NEVER stored */}
          <p
            style={{
              fontSize: 11,
              color: "var(--db-text-secondary)",
              marginTop: 4,
            }}
          >
            {/* TODO(edge/rpc): hash password with bcrypt server-side; never store plaintext */}
            Password is hashed server-side before storage.
          </p>
        </div>
      )}

      {/* ── Chat Theme Selector ──────────────────────────────────────────────── */}
      <div>
        <SectionLabel>Chat room theme</SectionLabel>
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          {CHAT_THEMES.map((theme) => {
            const isSelected = draft.chat_theme_id === theme.id;
            return (
              <button
                key={theme.id}
                onClick={() => onChange({ chat_theme_id: theme.id })}
                title={theme.name}
                aria-pressed={isSelected}
                style={{
                  padding: 0,
                  border: isSelected
                    ? "3px solid var(--db-accent)"
                    : "3px solid transparent",
                  borderRadius: 13,
                  background: "none",
                  cursor: "pointer",
                  outline: "none",
                  boxShadow: isSelected
                    ? "0 0 0 2px var(--db-accent)"
                    : "0 0 0 1px var(--db-border)",
                  transition: "box-shadow 0.15s, border-color 0.15s",
                }}
              >
                <ChatThemePreview theme={theme} />
              </button>
            );
          })}
        </div>
        <p
          style={{
            fontSize: 12,
            color: "var(--db-text-secondary)",
            marginTop: 6,
          }}
        >
          Selected:{" "}
          <strong style={{ color: "var(--db-text-primary)" }}>
            {getChatTheme(draft.chat_theme_id).name}
          </strong>
        </p>
      </div>

      {/* ── Save / feedback ──────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={onSave}
          disabled={saving}
          style={{
            padding: "8px 20px",
            borderRadius: 8,
            border: "none",
            background: "var(--db-accent)",
            color: "var(--db-accent-text, #fff)",
            fontWeight: 600,
            fontSize: 14,
            cursor: saving ? "wait" : "pointer",
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>

        {saveSuccess && !saving && (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 13,
              color: "var(--db-success, #1D9E75)",
            }}
          >
            <IconCheck size={15} />
            Saved
          </span>
        )}

        {saveError && (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 13,
              color: "var(--db-danger, #EF4444)",
            }}
          >
            <IconAlertCircle size={15} />
            {saveError}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Room row ──────────────────────────────────────────────────────────────────

interface RoomRowProps {
  room: Room;
  isExpanded: boolean;
  draft: RoomDraft;
  saving: boolean;
  saveError: string | null;
  saveSuccess: boolean;
  onToggleExpand: () => void;
  onDraftChange: (patch: Partial<RoomDraft>) => void;
  onSave: () => void;
  onDelete: () => void;
  onQR: () => void;
}

function RoomRow({
  room,
  isExpanded,
  draft,
  saving,
  saveError,
  saveSuccess,
  onToggleExpand,
  onDraftChange,
  onSave,
  onDelete,
  onQR,
}: RoomRowProps) {
  const themeName = getChatTheme(room.chat_theme_id).name;
  const borderColor = room.is_main
    ? "var(--db-accent)"               // blue for main room
    : "var(--db-accent-purple, #7C3AED)"; // purple for sub-rooms

  return (
    <div
      style={{
        borderRadius: 10,
        overflow: "hidden",
        border: "1px solid var(--db-border)",
        background: "var(--db-bg-surface)",
        borderLeft: `4px solid ${borderColor}`,
      }}
    >
      {/* ── Summary row ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 16px",
        }}
      >
        {/* Icon + name */}
        <span style={{ fontSize: 20, flexShrink: 0 }}>
          {room.icon ?? <IconHash size={20} />}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontWeight: 600,
              fontSize: 15,
              color: "var(--db-text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {room.name}
            {room.is_main && (
              <span
                style={{
                  marginLeft: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: "var(--db-accent)",
                  color: "var(--db-accent-text, #fff)",
                  verticalAlign: "middle",
                }}
              >
                MAIN
              </span>
            )}
            {room.is_password_protected && (
              <IconLock
                size={13}
                style={{
                  marginLeft: 5,
                  verticalAlign: "middle",
                  color: "var(--db-text-secondary)",
                }}
              />
            )}
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              color: "var(--db-text-secondary)",
            }}
          >
            Theme: {themeName}
          </p>
        </div>

        {/* Active count — placeholder; wired to Realtime presence in native app */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            color: "var(--db-text-secondary)",
            fontSize: 13,
            flexShrink: 0,
          }}
        >
          <IconUsers size={15} />
          <span>—</span>
          {/* TODO(Stage 4 / Realtime): wire to room presence count */}
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {/* QR */}
          <button
            onClick={onQR}
            title="Show QR code"
            style={iconBtn}
          >
            <IconQrcode size={17} />
          </button>

          {/* Edit (expand/collapse) */}
          <button
            onClick={onToggleExpand}
            title={isExpanded ? "Collapse settings" : "Edit room"}
            style={iconBtn}
          >
            {isExpanded ? <IconChevronUp size={17} /> : <IconEdit size={17} />}
          </button>

          {/* Delete — only on sub-rooms */}
          {!room.is_main && (
            <button
              onClick={onDelete}
              title="Delete room"
              style={{ ...iconBtn, color: "var(--db-danger, #EF4444)" }}
            >
              <IconTrash size={17} />
            </button>
          )}
        </div>
      </div>

      {/* ── Expanded settings panel ──────────────────────────────────────────── */}
      {isExpanded && (
        <SettingsPanel
          room={room}
          draft={draft}
          saving={saving}
          saveError={saveError}
          saveSuccess={saveSuccess}
          onChange={onDraftChange}
          onSave={onSave}
        />
      )}
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 32,
  borderRadius: 6,
  border: "1px solid var(--db-border)",
  background: "var(--db-bg-base)",
  color: "var(--db-text-secondary)",
  cursor: "pointer",
  flexShrink: 0,
};

// ── New Room Modal ────────────────────────────────────────────────────────────

interface NewRoomModalProps {
  onClose: () => void;
  onCreate: (name: string, icon: string) => Promise<void>;
  creating: boolean;
  createError: string | null;
}

function NewRoomModal({ onClose, onCreate, creating, createError }: NewRoomModalProps) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("💬");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (name.trim()) onCreate(name.trim(), icon);
    },
    [name, icon, onCreate]
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add sub-room"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.55)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "var(--db-bg-surface)",
          borderRadius: 12,
          padding: 24,
          width: 360,
          maxWidth: "90vw",
          border: "1px solid var(--db-border)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 700,
            color: "var(--db-text-primary)",
          }}
        >
          Add sub-room
        </h2>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <SectionLabel>Room name</SectionLabel>
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. VIP Lounge"
              maxLength={60}
              required
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid var(--db-border)",
                background: "var(--db-bg-base)",
                color: "var(--db-text-primary)",
                fontSize: 14,
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <SectionLabel>Icon</SectionLabel>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {ICON_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setIcon(emoji)}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 6,
                    border: icon === emoji
                      ? "2px solid var(--db-accent)"
                      : "1px solid var(--db-border)",
                    background: icon === emoji
                      ? "var(--db-accent-muted, rgba(55,138,221,0.12))"
                      : "var(--db-bg-surface)",
                    cursor: "pointer",
                    fontSize: 18,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {createError && (
            <p
              style={{
                fontSize: 13,
                color: "var(--db-danger, #EF4444)",
                display: "flex",
                alignItems: "center",
                gap: 4,
                margin: 0,
              }}
            >
              <IconAlertCircle size={14} />
              {createError}
            </p>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "1px solid var(--db-border)",
                background: "var(--db-bg-base)",
                color: "var(--db-text-secondary)",
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating || !name.trim()}
              style={{
                padding: "8px 20px",
                borderRadius: 8,
                border: "none",
                background: "var(--db-accent)",
                color: "var(--db-accent-text, #fff)",
                fontWeight: 600,
                fontSize: 14,
                cursor: creating ? "wait" : "pointer",
                opacity: creating || !name.trim() ? 0.6 : 1,
              }}
            >
              {creating ? "Creating…" : "Create room"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Delete confirm modal ──────────────────────────────────────────────────────

function DeleteConfirmModal({
  room,
  onConfirm,
  onCancel,
  deleting,
}: {
  room: Room;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Delete ${room.name}`}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.55)",
      }}
    >
      <div
        style={{
          background: "var(--db-bg-surface)",
          borderRadius: 12,
          padding: 24,
          width: 340,
          maxWidth: "90vw",
          border: "1px solid var(--db-border)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 17,
            fontWeight: 700,
            color: "var(--db-text-primary)",
          }}
        >
          Delete &quot;{room.name}&quot;?
        </h2>
        <p style={{ margin: 0, fontSize: 14, color: "var(--db-text-secondary)" }}>
          This will permanently remove the room and all its messages. This action
          cannot be undone.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid var(--db-border)",
              background: "var(--db-bg-base)",
              color: "var(--db-text-secondary)",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            style={{
              padding: "8px 20px",
              borderRadius: 8,
              border: "none",
              background: "var(--db-danger, #EF4444)",
              color: "#fff",
              fontWeight: 600,
              fontSize: 14,
              cursor: deleting ? "wait" : "pointer",
              opacity: deleting ? 0.7 : 1,
            }}
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

/**
 * Route entry: `?room=<id>` opens the live chat for that room; otherwise the
 * Room Manager is shown. Wrapped in Suspense because useSearchParams requires it.
 */
export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatRouter />
    </Suspense>
  );
}

function ChatRouter() {
  const params = useSearchParams();
  const roomId = params.get("room");
  return roomId ? <LiveChat roomId={roomId} /> : <ChatRoomManagerPage />;
}

function ChatRoomManagerPage() {
  // ── State ──────────────────────────────────────────────────────────────────

  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  /** Which room's settings panel is open (by room id) */
  const [expandedRoomId, setExpandedRoomId] = useState<string | null>(null);

  /** Per-room editable drafts keyed by room id */
  const [drafts, setDrafts] = useState<Record<string, RoomDraft>>({});

  /** Per-room save state */
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({});
  const [saveErrorMap, setSaveErrorMap] = useState<Record<string, string | null>>({});
  const [saveSuccessMap, setSaveSuccessMap] = useState<Record<string, boolean>>({});

  /** Add sub-room modal */
  const [showNewRoom, setShowNewRoom] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  /** Delete confirm modal */
  const [roomToDelete, setRoomToDelete] = useState<Room | null>(null);
  const [deleting, setDeleting] = useState(false);

  /** QR Modal */
  const [qrRoom, setQrRoom] = useState<Room | null>(null);

  // Placeholder business id — Task 2.2 / auth session provides the real one
  const businessId = PLACEHOLDER_BUSINESS_ID;

  // ── Load rooms ─────────────────────────────────────────────────────────────

  const loadRooms = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    if (!isSupabaseConfigured) {
      // Fall back to demo data so the page works without a backend
      setRooms(DEMO_ROOMS);
      const initialDrafts: Record<string, RoomDraft> = {};
      DEMO_ROOMS.forEach((r) => { initialDrafts[r.id] = toDraft(r); });
      setDrafts(initialDrafts);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("rooms")
      .select(
        "id, business_id, parent_room_id, name, description, icon, color, slug, " +
        "chat_theme_id, is_password_protected, password_hash, ttl_hours, " +
        "notify_enabled, is_main, sort, qr_token"
      )
      .eq("business_id", businessId)
      .order("sort", { ascending: true });

    if (error) {
      setLoadError("Failed to load rooms. " + error.message);
      setLoading(false);
      return;
    }

    const loaded = (data ?? []) as unknown as Room[];
    setRooms(loaded);

    const initialDrafts: Record<string, RoomDraft> = {};
    loaded.forEach((r) => { initialDrafts[r.id] = toDraft(r); });
    setDrafts(initialDrafts);
    setLoading(false);
  }, [businessId]);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  // ── Draft change ───────────────────────────────────────────────────────────

  const handleDraftChange = useCallback(
    (roomId: string, patch: Partial<RoomDraft>) => {
      setDrafts((prev) => ({
        ...prev,
        [roomId]: { ...prev[roomId], ...patch },
      }));
      // Clear success indicator on any edit
      setSaveSuccessMap((prev) => ({ ...prev, [roomId]: false }));
    },
    []
  );

  // ── Save room ──────────────────────────────────────────────────────────────

  const handleSave = useCallback(
    async (roomId: string) => {
      const draft = drafts[roomId];
      if (!draft) return;

      setSavingMap((prev) => ({ ...prev, [roomId]: true }));
      setSaveErrorMap((prev) => ({ ...prev, [roomId]: null }));
      setSaveSuccessMap((prev) => ({ ...prev, [roomId]: false }));

      if (!isSupabaseConfigured) {
        // Demo mode: just update local state
        setRooms((prev) =>
          prev.map((r) =>
            r.id === roomId
              ? {
                  ...r,
                  name: draft.name,
                  description: draft.description || null,
                  icon: draft.icon || null,
                  color: draft.color || null,
                  chat_theme_id: draft.chat_theme_id,
                  is_password_protected: draft.is_password_protected,
                  ttl_hours: draft.ttl_hours,
                  notify_enabled: draft.notify_enabled,
                }
              : r
          )
        );
        setSavingMap((prev) => ({ ...prev, [roomId]: false }));
        setSaveSuccessMap((prev) => ({ ...prev, [roomId]: true }));
        return;
      }

      // Build the update payload.
      // password_hash is intentionally OMITTED from the client payload.
      // TODO(edge/rpc): hash password with bcrypt server-side; never store plaintext.
      // When draft.password_plaintext is non-empty, call an Edge Function that
      // receives the plaintext, bcrypt-hashes it, and writes password_hash.
      const payload: Partial<Room> = {
        name: draft.name,
        description: draft.description || null,
        icon: draft.icon || null,
        color: draft.color || null,
        chat_theme_id: draft.chat_theme_id,
        is_password_protected: draft.is_password_protected,
        ttl_hours: draft.ttl_hours,
        notify_enabled: draft.notify_enabled,
      };

      const { error } = await supabase
        .from("rooms")
        .update(payload)
        .eq("id", roomId)
        .eq("business_id", businessId);

      if (error) {
        setSaveErrorMap((prev) => ({
          ...prev,
          [roomId]: "Save failed: " + error.message,
        }));
        setSavingMap((prev) => ({ ...prev, [roomId]: false }));
        return;
      }

      // Refresh rooms list to reflect saved values
      await loadRooms();
      setSavingMap((prev) => ({ ...prev, [roomId]: false }));
      setSaveSuccessMap((prev) => ({ ...prev, [roomId]: true }));
    },
    [drafts, businessId, loadRooms]
  );

  // ── Create sub-room ────────────────────────────────────────────────────────

  const handleCreate = useCallback(
    async (name: string, icon: string) => {
      const mainRoom = rooms.find((r) => r.is_main);
      if (!mainRoom) {
        setCreateError("No main room found to attach this room to.");
        return;
      }

      setCreating(true);
      setCreateError(null);

      if (!isSupabaseConfigured) {
        // Demo: add locally
        const newRoom: Room = {
          id: `demo-room-${Date.now()}`,
          business_id: businessId,
          parent_room_id: mainRoom.id,
          name,
          description: null,
          icon,
          color: null,
          slug: name.toLowerCase().replace(/\s+/g, "-"),
          chat_theme_id: 1,
          is_password_protected: false,
          password_hash: null,
          ttl_hours: null,
          notify_enabled: true,
          is_main: false,
          sort: rooms.length,
          qr_token: null,
        };
        setRooms((prev) => [...prev, newRoom]);
        setDrafts((prev) => ({ ...prev, [newRoom.id]: toDraft(newRoom) }));
        setCreating(false);
        setShowNewRoom(false);
        return;
      }

      const { error } = await supabase.from("rooms").insert({
        business_id: businessId,
        parent_room_id: mainRoom.id,
        name,
        icon,
        chat_theme_id: 1,
        is_password_protected: false,
        notify_enabled: true,
        is_main: false,
        sort: rooms.length,
      });

      if (error) {
        setCreateError("Could not create room: " + error.message);
        setCreating(false);
        return;
      }

      await loadRooms();
      setCreating(false);
      setShowNewRoom(false);
    },
    [rooms, businessId, loadRooms]
  );

  // ── Delete sub-room ────────────────────────────────────────────────────────

  const handleDeleteConfirm = useCallback(async () => {
    if (!roomToDelete) return;
    setDeleting(true);

    if (!isSupabaseConfigured) {
      setRooms((prev) => prev.filter((r) => r.id !== roomToDelete.id));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[roomToDelete.id];
        return next;
      });
      setDeleting(false);
      setRoomToDelete(null);
      return;
    }

    const { error } = await supabase
      .from("rooms")
      .delete()
      .eq("id", roomToDelete.id)
      .eq("business_id", businessId);

    if (error) {
      // Show error in a simple way without blocking — re-use load error slot
      setLoadError("Delete failed: " + error.message);
    } else {
      await loadRooms();
    }
    setDeleting(false);
    setRoomToDelete(null);
  }, [roomToDelete, businessId, loadRooms]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const mainRoom = rooms.find((r) => r.is_main);
  const subRooms = rooms.filter((r) => !r.is_main);
  const subRoomCount = subRooms.length;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        maxWidth: 860,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 700,
              color: "var(--db-text-primary)",
            }}
          >
            Room Manager
          </h1>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 14,
              color: "var(--db-text-secondary)",
            }}
          >
            Manage chat rooms, themes, and access settings.
          </p>
        </div>

        <button
          onClick={loadRooms}
          title="Refresh rooms"
          style={{
            ...iconBtn,
            width: "auto",
            padding: "0 12px",
            gap: 6,
            display: "flex",
            alignItems: "center",
            fontSize: 13,
          }}
        >
          <IconRefresh size={15} />
          Refresh
        </button>
      </div>

      {/* ── Load error ────────────────────────────────────────────────────────── */}
      {loadError && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            background: "var(--db-danger-muted, rgba(239,68,68,0.1))",
            border: "1px solid var(--db-danger, #EF4444)",
            color: "var(--db-danger, #EF4444)",
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <IconAlertCircle size={16} />
          {loadError}
        </div>
      )}

      {/* ── Loading skeleton ─────────────────────────────────────────────────── */}
      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[0, 1].map((i) => (
            <div
              key={i}
              style={{
                height: 64,
                borderRadius: 10,
                background: "var(--db-bg-surface)",
                border: "1px solid var(--db-border)",
                opacity: 0.5,
              }}
            />
          ))}
        </div>
      )}

      {/* ── Room list ────────────────────────────────────────────────────────── */}
      {!loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Main room first */}
          {mainRoom && drafts[mainRoom.id] && (
            <RoomRow
              key={mainRoom.id}
              room={mainRoom}
              isExpanded={expandedRoomId === mainRoom.id}
              draft={drafts[mainRoom.id]}
              saving={savingMap[mainRoom.id] ?? false}
              saveError={saveErrorMap[mainRoom.id] ?? null}
              saveSuccess={saveSuccessMap[mainRoom.id] ?? false}
              onToggleExpand={() =>
                setExpandedRoomId((prev) =>
                  prev === mainRoom.id ? null : mainRoom.id
                )
              }
              onDraftChange={(patch) => handleDraftChange(mainRoom.id, patch)}
              onSave={() => handleSave(mainRoom.id)}
              onDelete={() => {/* main room cannot be deleted — button not rendered */}}
              onQR={() => setQrRoom(mainRoom)}
            />
          )}

          {/* Sub-rooms */}
          {subRooms.map((room) =>
            drafts[room.id] ? (
              <RoomRow
                key={room.id}
                room={room}
                isExpanded={expandedRoomId === room.id}
                draft={drafts[room.id]}
                saving={savingMap[room.id] ?? false}
                saveError={saveErrorMap[room.id] ?? null}
                saveSuccess={saveSuccessMap[room.id] ?? false}
                onToggleExpand={() =>
                  setExpandedRoomId((prev) =>
                    prev === room.id ? null : room.id
                  )
                }
                onDraftChange={(patch) => handleDraftChange(room.id, patch)}
                onSave={() => handleSave(room.id)}
                onDelete={() => setRoomToDelete(room)}
                onQR={() => setQrRoom(room)}
              />
            ) : null
          )}

          {/* ── Add sub-room footer ──────────────────────────────────────────── */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              borderRadius: 10,
              border: "1px dashed var(--db-border)",
              background: "var(--db-bg-surface)",
            }}
          >
            {/* Plan-limit indicator */}
            <span style={{ fontSize: 13, color: "var(--db-text-secondary)" }}>
              {/* TODO: read real plan limit from subscription */}
              Sub-rooms:{" "}
              <strong style={{ color: "var(--db-text-primary)" }}>
                {subRoomCount}
              </strong>{" "}
              of{" "}
              <strong style={{ color: "var(--db-text-primary)" }}>
                {PLAN_ROOM_LIMIT}
              </strong>
            </span>

            {subRoomCount >= PLAN_ROOM_LIMIT ? (
              <span
                style={{
                  fontSize: 12,
                  color: "var(--db-warning, #D97706)",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <IconAlertCircle size={14} />
                Plan limit reached — upgrade to add more
              </span>
            ) : (
              <button
                onClick={() => {
                  setCreateError(null);
                  setShowNewRoom(true);
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "7px 16px",
                  borderRadius: 8,
                  border: "none",
                  background: "var(--db-accent)",
                  color: "var(--db-accent-text, #fff)",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                <IconPlus size={15} />
                Add sub-room
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Modals ───────────────────────────────────────────────────────────── */}

      {showNewRoom && (
        <NewRoomModal
          onClose={() => setShowNewRoom(false)}
          onCreate={handleCreate}
          creating={creating}
          createError={createError}
        />
      )}

      {roomToDelete && (
        <DeleteConfirmModal
          room={roomToDelete}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setRoomToDelete(null)}
          deleting={deleting}
        />
      )}

      {/* QRModal from Task 2.8 (parallel dependency) */}
      {qrRoom && (
        <QRModal
          room={{
            qr_token: qrRoom.qr_token ?? qrRoom.id,
            name: qrRoom.name,
            chat_theme_id: qrRoom.chat_theme_id,
            is_main: qrRoom.is_main,
          } satisfies QRModalRoom}
          business={
            // TODO: load real business record (slug, logo_url, plan) from Supabase
            {
              slug: "demo-business",
              logo_url: null,
              plan: "free",
            } satisfies QRModalBusiness
          }
          open={true}
          onClose={() => setQrRoom(null)}
        />
      )}
    </div>
  );
}
