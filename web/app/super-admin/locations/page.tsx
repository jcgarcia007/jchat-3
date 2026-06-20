"use client";

/**
 * JChat 3.0 — Task 2.17: Public Locations Manager (Super Admin)
 *
 * Manages public locations (parks, events, public squares) that appear on
 * the map WITHOUT a business account. These locations render with a different
 * pin style than businesses, and users can enter their associated chat room
 * without placing an order.
 *
 * Map pin rendering and chat-room wiring are handled in Stage 4:
 *   - TODO(Stage 4): wire up BusinessPin + HeatmapLayer for public location pins
 *   - TODO(Stage 4): wire up room_id → chat entry without order flow
 *
 * TODO(roles): gate this page to Super Admin / Communications Admin only once
 *   the roles system exists. Currently renders for any authenticated user.
 */

import { useState, useEffect, useCallback } from "react";
import {
  IconMapPin,
  IconPlus,
  IconPencil,
  IconTrash,
  IconToggleLeft,
  IconToggleRight,
  IconX,
  IconCheck,
  IconAlertCircle,
  IconLoader2,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// ─── Types ───────────────────────────────────────────────────────────────────

type LocationType = "park" | "event" | "square" | "other";

interface PublicLocation {
  id: string;
  name: string;
  type: LocationType;
  lat: number | null;
  lng: number | null;
  radius_m: number;
  description: string | null;
  active_from: string | null; // ISO date string yyyy-mm-dd
  active_to: string | null;
  is_active: boolean;
  room_id: string | null;
  created_by: string | null;
  created_at: string;
}

type LocationFormData = Omit<PublicLocation, "id" | "created_by" | "created_at">;

// ─── Constants ───────────────────────────────────────────────────────────────

const LOCATION_TYPES: { value: LocationType; label: string }[] = [
  { value: "park", label: "Park" },
  { value: "event", label: "Event" },
  { value: "square", label: "Square / Plaza" },
  { value: "other", label: "Other" },
];

const EMPTY_FORM: LocationFormData = {
  name: "",
  type: "park",
  lat: null,
  lng: null,
  radius_m: 100,
  description: null,
  active_from: null,
  active_to: null,
  is_active: true,
  room_id: null,
};

// ─── Page component ───────────────────────────────────────────────────────────

export default function PublicLocationsPage() {
  const [locations, setLocations] = useState<PublicLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form / modal state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<LocationFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Confirm-delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchLocations = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from("public_locations")
      .select("*")
      .order("created_at", { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setLocations((data as PublicLocation[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchLocations();
  }, [fetchLocations]);

  // ── Form helpers ───────────────────────────────────────────────────────────

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(loc: PublicLocation) {
    setEditingId(loc.id);
    setForm({
      name: loc.name,
      type: loc.type,
      lat: loc.lat,
      lng: loc.lng,
      radius_m: loc.radius_m,
      description: loc.description,
      active_from: loc.active_from,
      active_to: loc.active_to,
      is_active: loc.is_active,
      room_id: loc.room_id,
    });
    setFormError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setFormError(null);
  }

  function setField<K extends keyof LocationFormData>(
    key: K,
    value: LocationFormData[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // ── CRUD ───────────────────────────────────────────────────────────────────

  async function handleSave() {
    setFormError(null);

    // Basic validation
    if (!form.name.trim()) {
      setFormError("Name is required.");
      return;
    }

    const payload = {
      name: form.name.trim(),
      type: form.type,
      lat: form.lat,
      lng: form.lng,
      radius_m: form.radius_m,
      description: form.description?.trim() || null,
      active_from: form.active_from || null,
      active_to: form.active_to || null,
      is_active: form.is_active,
      room_id: form.room_id || null,
    };

    setSaving(true);

    if (editingId) {
      // UPDATE
      const { error: updateError } = await supabase
        .from("public_locations")
        .update(payload)
        .eq("id", editingId);

      if (updateError) {
        setFormError(updateError.message);
        setSaving(false);
        return;
      }
    } else {
      // INSERT
      const { error: insertError } = await supabase
        .from("public_locations")
        .insert(payload);

      if (insertError) {
        setFormError(insertError.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    closeForm();
    void fetchLocations();
  }

  async function handleToggleActive(loc: PublicLocation) {
    const { error: toggleError } = await supabase
      .from("public_locations")
      .update({ is_active: !loc.is_active })
      .eq("id", loc.id);

    if (toggleError) {
      setError(toggleError.message);
    } else {
      void fetchLocations();
    }
  }

  async function handleDelete(id: string) {
    const { error: deleteError } = await supabase
      .from("public_locations")
      .delete()
      .eq("id", id);

    if (deleteError) {
      setError(deleteError.message);
    } else {
      setDeletingId(null);
      void fetchLocations();
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: "900px" }}>
      {/* Page header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: "24px",
          gap: "16px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              marginBottom: "6px",
            }}
          >
            <IconMapPin
              size={22}
              stroke={1.6}
              style={{ color: "var(--color-brand)" }}
            />
            <h1
              style={{
                fontSize: "22px",
                fontWeight: 700,
                color: "var(--text-primary)",
                margin: 0,
              }}
            >
              Public Locations
            </h1>
          </div>
          <p
            style={{
              fontSize: "13px",
              color: "var(--text-secondary)",
              margin: 0,
              maxWidth: "540px",
            }}
          >
            Parks, public squares, and temporary events that appear on the map
            without a business account. Users can join their chat room without
            ordering.
            {/* TODO(Stage 4): pin style and map wiring implemented in Stage 4 */}
          </p>
        </div>

        <button onClick={openCreate} style={styles.btnPrimary}>
          <IconPlus size={16} stroke={2} />
          Add location
        </button>
      </div>

      {/* Supabase not configured — friendly empty state */}
      {!isSupabaseConfigured && (
        <EmptyState
          icon={<IconAlertCircle size={32} stroke={1.4} />}
          title="Supabase not configured"
          message="Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to manage public locations."
          color="var(--color-warning)"
        />
      )}

      {/* Fetch error */}
      {isSupabaseConfigured && error && (
        <div style={styles.errorBanner}>
          <IconAlertCircle size={16} stroke={1.6} />
          {error}
          <button
            onClick={() => void fetchLocations()}
            style={styles.btnGhost}
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading */}
      {isSupabaseConfigured && loading && (
        <div style={styles.centered}>
          <IconLoader2
            size={24}
            stroke={1.6}
            style={{
              color: "var(--color-brand)",
              animation: "spin 1s linear infinite",
            }}
          />
        </div>
      )}

      {/* Empty state — configured but no records */}
      {isSupabaseConfigured && !loading && !error && locations.length === 0 && (
        <EmptyState
          icon={<IconMapPin size={32} stroke={1.4} />}
          title="No public locations yet"
          message='Add parks, squares, or event spaces that should appear on the map. Click "Add location" to get started.'
          color="var(--color-brand)"
        />
      )}

      {/* Locations table */}
      {isSupabaseConfigured && !loading && locations.length > 0 && (
        <div
          style={{
            border: "1px solid var(--border-subtle)",
            borderRadius: "10px",
            overflow: "hidden",
          }}
        >
          {/* Table header */}
          <div style={styles.tableHeader}>
            <span style={{ flex: "2 1 160px" }}>Name</span>
            <span style={{ flex: "1 1 80px" }}>Type</span>
            <span style={{ flex: "1 1 100px" }}>Coordinates</span>
            <span style={{ flex: "0 0 80px", textAlign: "center" }}>
              Radius
            </span>
            <span style={{ flex: "1 1 120px" }}>Active dates</span>
            <span style={{ flex: "0 0 72px", textAlign: "center" }}>
              Status
            </span>
            <span style={{ flex: "0 0 80px", textAlign: "right" }}>
              Actions
            </span>
          </div>

          {/* Rows */}
          {locations.map((loc, idx) => (
            <LocationRow
              key={loc.id}
              loc={loc}
              isLast={idx === locations.length - 1}
              onEdit={() => openEdit(loc)}
              onToggle={() => void handleToggleActive(loc)}
              onDelete={() => setDeletingId(loc.id)}
            />
          ))}
        </div>
      )}

      {/* ── Create / Edit form modal ────────────────────────────────────── */}
      {showForm && (
        <Modal
          title={editingId ? "Edit public location" : "New public location"}
          onClose={closeForm}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSave();
            }}
            style={{ display: "flex", flexDirection: "column", gap: "16px" }}
          >
            {/* Name */}
            <FormField label="Name *">
              <input
                type="text"
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                placeholder="e.g. Riverside Park"
                style={styles.input}
                required
                autoFocus
              />
            </FormField>

            {/* Type */}
            <FormField label="Type *">
              <select
                value={form.type}
                onChange={(e) =>
                  setField("type", e.target.value as LocationType)
                }
                style={styles.input}
              >
                {LOCATION_TYPES.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </FormField>

            {/* Coordinates */}
            <div style={{ display: "flex", gap: "12px" }}>
              <FormField label="Latitude" style={{ flex: 1 }}>
                <input
                  type="number"
                  step="any"
                  value={form.lat ?? ""}
                  onChange={(e) =>
                    setField(
                      "lat",
                      e.target.value === "" ? null : Number(e.target.value)
                    )
                  }
                  placeholder="e.g. 40.7128"
                  style={styles.input}
                />
              </FormField>
              <FormField label="Longitude" style={{ flex: 1 }}>
                <input
                  type="number"
                  step="any"
                  value={form.lng ?? ""}
                  onChange={(e) =>
                    setField(
                      "lng",
                      e.target.value === "" ? null : Number(e.target.value)
                    )
                  }
                  placeholder="e.g. -74.0060"
                  style={styles.input}
                />
              </FormField>
            </div>
            {/* TODO(Stage 4): map picker — replace lat/lng text inputs with a click-on-map selector */}

            {/* Radius */}
            <FormField label="Radius (meters)">
              <input
                type="number"
                min={1}
                value={form.radius_m}
                onChange={(e) => setField("radius_m", Number(e.target.value))}
                style={styles.input}
              />
            </FormField>

            {/* Description */}
            <FormField label="Description">
              <textarea
                value={form.description ?? ""}
                onChange={(e) =>
                  setField("description", e.target.value || null)
                }
                placeholder="Brief description shown to users…"
                rows={3}
                style={{ ...styles.input, resize: "vertical" }}
              />
            </FormField>

            {/* Active dates */}
            <div style={{ display: "flex", gap: "12px" }}>
              <FormField label="Active from" style={{ flex: 1 }}>
                <input
                  type="date"
                  value={form.active_from ?? ""}
                  onChange={(e) =>
                    setField("active_from", e.target.value || null)
                  }
                  style={styles.input}
                />
              </FormField>
              <FormField label="Active to" style={{ flex: 1 }}>
                <input
                  type="date"
                  value={form.active_to ?? ""}
                  onChange={(e) =>
                    setField("active_to", e.target.value || null)
                  }
                  style={styles.input}
                />
              </FormField>
            </div>

            {/* is_active toggle */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <button
                type="button"
                onClick={() => setField("is_active", !form.is_active)}
                aria-label="Toggle active"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  color: form.is_active
                    ? "var(--color-success)"
                    : "var(--text-tertiary)",
                  display: "flex",
                }}
              >
                {form.is_active ? (
                  <IconToggleRight size={28} stroke={1.6} />
                ) : (
                  <IconToggleLeft size={28} stroke={1.6} />
                )}
              </button>
              <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                {form.is_active ? "Active (visible on map)" : "Inactive (hidden)"}
              </span>
            </div>

            {/* Form error */}
            {formError && (
              <div style={styles.errorBanner}>
                <IconAlertCircle size={14} stroke={1.6} />
                {formError}
              </div>
            )}

            {/* Actions */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
                paddingTop: "4px",
              }}
            >
              <button type="button" onClick={closeForm} style={styles.btnGhost}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                style={{
                  ...styles.btnPrimary,
                  opacity: saving ? 0.6 : 1,
                  cursor: saving ? "not-allowed" : "pointer",
                }}
              >
                {saving ? (
                  <IconLoader2
                    size={14}
                    stroke={2}
                    style={{ animation: "spin 1s linear infinite" }}
                  />
                ) : (
                  <IconCheck size={14} stroke={2} />
                )}
                {editingId ? "Save changes" : "Create location"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Delete confirmation modal ───────────────────────────────────── */}
      {deletingId && (
        <Modal title="Delete location?" onClose={() => setDeletingId(null)}>
          <p
            style={{
              fontSize: "14px",
              color: "var(--text-secondary)",
              margin: "0 0 20px",
            }}
          >
            This will permanently remove the public location and its map pin.
            The linked chat room (if any) will not be deleted.
          </p>
          <div
            style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}
          >
            <button
              onClick={() => setDeletingId(null)}
              style={styles.btnGhost}
            >
              Cancel
            </button>
            <button
              onClick={() => void handleDelete(deletingId)}
              style={styles.btnDanger}
            >
              <IconTrash size={14} stroke={2} />
              Delete
            </button>
          </div>
        </Modal>
      )}

      {/* CSS for spin animation */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LocationRow({
  loc,
  isLast,
  onEdit,
  onToggle,
  onDelete,
}: {
  loc: PublicLocation;
  isLast: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const typeLabelMap: Record<LocationType, string> = {
    park: "Park",
    event: "Event",
    square: "Square",
    other: "Other",
  };

  const dateRange =
    loc.active_from || loc.active_to
      ? [loc.active_from ?? "—", loc.active_to ?? "—"].join(" → ")
      : "Always";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "12px 16px",
        borderBottom: isLast ? "none" : "1px solid var(--border-subtle)",
        background: "var(--bg-surface)",
        flexWrap: "wrap",
        rowGap: "6px",
      }}
    >
      {/* Name + description */}
      <div style={{ flex: "2 1 160px", minWidth: 0 }}>
        <div
          style={{
            fontSize: "14px",
            fontWeight: 600,
            color: "var(--text-primary)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {loc.name}
        </div>
        {loc.description && (
          <div
            style={{
              fontSize: "12px",
              color: "var(--text-tertiary)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              marginTop: "2px",
            }}
          >
            {loc.description}
          </div>
        )}
      </div>

      {/* Type badge */}
      <div style={{ flex: "1 1 80px" }}>
        <TypeBadge type={loc.type} label={typeLabelMap[loc.type]} />
      </div>

      {/* Coordinates */}
      <div
        style={{
          flex: "1 1 100px",
          fontSize: "12px",
          color: "var(--text-tertiary)",
          fontFamily: "var(--font-geist-mono, monospace)",
        }}
      >
        {loc.lat != null && loc.lng != null
          ? `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`
          : "No coords"}
      </div>

      {/* Radius */}
      <div
        style={{
          flex: "0 0 80px",
          textAlign: "center",
          fontSize: "13px",
          color: "var(--text-secondary)",
        }}
      >
        {loc.radius_m} m
      </div>

      {/* Active dates */}
      <div
        style={{
          flex: "1 1 120px",
          fontSize: "12px",
          color: "var(--text-tertiary)",
        }}
      >
        {dateRange}
      </div>

      {/* Status toggle */}
      <div
        style={{
          flex: "0 0 72px",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <button
          onClick={onToggle}
          title={loc.is_active ? "Deactivate" : "Activate"}
          aria-label={loc.is_active ? "Deactivate location" : "Activate location"}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            color: loc.is_active
              ? "var(--color-success)"
              : "var(--text-tertiary)",
            display: "flex",
            alignItems: "center",
          }}
        >
          {loc.is_active ? (
            <IconToggleRight size={22} stroke={1.6} />
          ) : (
            <IconToggleLeft size={22} stroke={1.6} />
          )}
        </button>
      </div>

      {/* Actions */}
      <div
        style={{
          flex: "0 0 80px",
          display: "flex",
          justifyContent: "flex-end",
          gap: "4px",
        }}
      >
        <IconButton
          icon={<IconPencil size={15} stroke={1.6} />}
          label="Edit"
          onClick={onEdit}
        />
        <IconButton
          icon={<IconTrash size={15} stroke={1.6} />}
          label="Delete"
          onClick={onDelete}
          danger
        />
      </div>
    </div>
  );
}

function TypeBadge({
  type,
  label,
}: {
  type: LocationType;
  label: string;
}) {
  const colorMap: Record<LocationType, string> = {
    park: "var(--color-success)",
    event: "var(--color-brand)",
    square: "var(--color-gold)",
    other: "var(--text-tertiary)",
  };
  const color = colorMap[type];

  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: "20px",
        fontSize: "11px",
        fontWeight: 600,
        color,
        border: `1px solid ${color}`,
        background: "transparent",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
      }}
    >
      {label}
    </span>
  );
}

function IconButton({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "28px",
        height: "28px",
        borderRadius: "6px",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        color: danger ? "var(--color-danger)" : "var(--text-secondary)",
        transition: "background 0.12s, color 0.12s",
      }}
    >
      {icon}
    </button>
  );
}

function FormField({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", ...style }}>
      <label
        style={{
          fontSize: "12px",
          fontWeight: 600,
          color: "var(--text-secondary)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  message,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  message: string;
  color: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "64px 24px",
        gap: "12px",
        border: "1px dashed var(--border-subtle)",
        borderRadius: "12px",
        textAlign: "center",
      }}
    >
      <div style={{ color }}>{icon}</div>
      <div
        style={{
          fontSize: "15px",
          fontWeight: 600,
          color: "var(--text-primary)",
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: "13px",
          color: "var(--text-secondary)",
          maxWidth: "420px",
        }}
      >
        {message}
      </div>
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          zIndex: 40,
        }}
      />
      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 50,
          width: "min(560px, calc(100vw - 32px))",
          maxHeight: "calc(100vh - 64px)",
          overflowY: "auto",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "14px",
          padding: "24px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
        }}
      >
        {/* Modal header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "20px",
          }}
        >
          <h2
            style={{
              fontSize: "16px",
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: 0,
            }}
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px",
              borderRadius: "6px",
              color: "var(--text-tertiary)",
              display: "flex",
            }}
          >
            <IconX size={18} stroke={1.6} />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

// ─── Shared inline styles ─────────────────────────────────────────────────────

const styles = {
  btnPrimary: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "8px 16px",
    borderRadius: "8px",
    border: "none",
    background: "var(--color-brand)",
    color: "#ffffff",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  },
  btnGhost: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "8px 14px",
    borderRadius: "8px",
    border: "1px solid var(--border-subtle)",
    background: "transparent",
    color: "var(--text-secondary)",
    fontSize: "13px",
    fontWeight: 500,
    cursor: "pointer",
  },
  btnDanger: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "8px 14px",
    borderRadius: "8px",
    border: "none",
    background: "var(--color-danger)",
    color: "#ffffff",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
  },
  input: {
    width: "100%",
    padding: "9px 12px",
    borderRadius: "8px",
    border: "1px solid var(--border-subtle)",
    background: "var(--bg-overlay)",
    color: "var(--text-primary)",
    fontSize: "13px",
    outline: "none",
    boxSizing: "border-box" as const,
  },
  tableHeader: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "10px 16px",
    background: "var(--bg-elevated)",
    borderBottom: "1px solid var(--border-subtle)",
    fontSize: "11px",
    fontWeight: 700,
    color: "var(--text-tertiary)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
  },
  errorBanner: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "10px 14px",
    borderRadius: "8px",
    background: "rgba(239,68,68,0.1)",
    border: "1px solid var(--color-danger)",
    color: "var(--color-danger)",
    fontSize: "13px",
  },
  centered: {
    display: "flex",
    justifyContent: "center",
    padding: "48px",
  },
} satisfies Record<string, React.CSSProperties>;
