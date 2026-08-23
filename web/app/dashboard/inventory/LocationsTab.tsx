"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useTranslations } from "next-intl";

// ── Types ──────────────────────────────────────────────────────────────────────

interface InventoryLocation {
  id: string;
  business_id: string;
  name: string;
  is_sales_location: boolean;
  is_active: boolean;
  sort: number;
}

interface LocationsTabProps {
  businessId: string;
  locations: InventoryLocation[];
  onRefresh: () => void;
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--db-text-secondary)",
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  border: "1px solid var(--db-border)",
  borderRadius: 7,
  background: "var(--db-bg)",
  color: "var(--db-text-primary)",
  fontSize: 13,
  boxSizing: "border-box",
};

const btnPrimary: React.CSSProperties = {
  background: "var(--db-accent)",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "8px 18px",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
};

const btnSecondary: React.CSSProperties = {
  background: "var(--db-surface)",
  color: "var(--db-text-primary)",
  border: "1px solid var(--db-border)",
  borderRadius: 8,
  padding: "8px 14px",
  fontWeight: 500,
  fontSize: 13,
  cursor: "pointer",
};

const btnSmall: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  fontSize: 14,
  padding: "2px 5px",
  borderRadius: 4,
  color: "var(--db-text-secondary)",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 10px",
  color: "var(--db-text-primary)",
  verticalAlign: "middle",
};

// ── Component ──────────────────────────────────────────────────────────────────

export default function LocationsTab({
  businessId,
  locations,
  onRefresh,
}: LocationsTabProps) {
  const t = useTranslations("dashboardCommon");

  const [showAdd, setShowAdd]       = useState(false);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [editName, setEditName]     = useState("");
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [saving, setSaving]         = useState(false);
  const [formError, setFormError]   = useState("");

  // Add form state
  const [newName, setNewName]           = useState("");
  const [newIsSales, setNewIsSales]     = useState(false);

  // Filter: show active/inactive/all
  const [showInactive, setShowInactive] = useState(false);

  const visibleLocations = showInactive
    ? locations
    : locations.filter((l) => l.is_active);

  // ── Create ─────────────────────────────────────────────────────────────────

  async function handleCreate() {
    if (!newName.trim()) { setFormError(t("locationsNameRequired")); return; }
    setSaving(true);
    setFormError("");
    try {
      const { error } = await supabase.rpc("inventory_create_location", {
        p_business_id: businessId,
        p_name: newName.trim(),
        p_is_sales: newIsSales,
      });
      if (error) throw error;
      setShowAdd(false);
      setNewName("");
      setNewIsSales(false);
      onRefresh();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  // ── Rename ─────────────────────────────────────────────────────────────────

  function openEdit(loc: InventoryLocation) {
    setEditingId(loc.id);
    setEditName(loc.name);
    setFormError("");
    setShowAdd(false);
  }

  async function handleRename() {
    if (!editName.trim()) { setFormError(t("locationsNameRequired")); return; }
    if (!editingId) return;
    setSaving(true);
    setFormError("");
    try {
      const { error } = await supabase.rpc("inventory_rename_location", {
        p_business_id: businessId,
        p_location_id: editingId,
        p_name: editName.trim(),
      });
      if (error) throw error;
      setEditingId(null);
      onRefresh();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  // ── Set sales location ─────────────────────────────────────────────────────

  async function handleSetSales(locationId: string) {
    setSaving(true);
    try {
      const { error } = await supabase.rpc("inventory_set_sales_location", {
        p_business_id: businessId,
        p_location_id: locationId,
      });
      if (error) throw error;
      onRefresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  // ── Archive ────────────────────────────────────────────────────────────────

  async function handleArchive(locationId: string) {
    setSaving(true);
    try {
      const { error } = await supabase.rpc("inventory_archive_location", {
        p_business_id: businessId,
        p_location_id: locationId,
      });
      if (error) throw error;
      setArchivingId(null);
      onRefresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ paddingTop: 8 }}>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, justifyContent: "space-between", marginBottom: 16, alignItems: "center" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--db-text-secondary)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            style={{ accentColor: "var(--db-accent)" }}
          />
          {t("locationsShowInactive")}
        </label>
        {!showAdd && !editingId && (
          <button
            onClick={() => { setShowAdd(true); setFormError(""); setNewName(""); setNewIsSales(false); }}
            style={btnPrimary}
          >
            + {t("locationsAddButton")}
          </button>
        )}
      </div>

      {/* Add form */}
      {showAdd && (
        <div
          style={{
            background: "var(--db-surface)",
            border: "1px solid var(--db-border)",
            borderRadius: 12,
            padding: 20,
            marginBottom: 20,
          }}
        >
          <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700, color: "var(--db-text-primary)" }}>
            {t("locationsAddTitle")}
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>{t("locationsNameLabel")} *</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("locationsNamePlaceholder")}
                style={inputStyle}
                autoFocus
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, gridColumn: "1 / -1" }}>
              <input
                type="checkbox"
                id="loc-is-sales"
                checked={newIsSales}
                onChange={(e) => setNewIsSales(e.target.checked)}
                style={{ accentColor: "var(--db-accent)" }}
              />
              <label htmlFor="loc-is-sales" style={{ fontSize: 13, color: "var(--db-text-secondary)", cursor: "pointer" }}>
                {t("locationsSalesLabel")}
              </label>
            </div>
          </div>
          {formError && <p style={{ color: "var(--color-danger)", fontSize: 13, marginTop: 8 }}>{formError}</p>}
          <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
            <button onClick={() => setShowAdd(false)} disabled={saving} style={btnSecondary}>
              {t("locationsCancelButton")}
            </button>
            <button onClick={() => void handleCreate()} disabled={saving} style={btnPrimary}>
              {saving ? t("locationsSaving") : t("locationsSaveButton")}
            </button>
          </div>
        </div>
      )}

      {/* Inline rename form */}
      {editingId && (
        <div
          style={{
            background: "var(--db-surface)",
            border: "1px solid var(--db-border)",
            borderRadius: 12,
            padding: 20,
            marginBottom: 20,
          }}
        >
          <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700, color: "var(--db-text-primary)" }}>
            {t("locationsEditTitle")}
          </h3>
          <div>
            <label style={labelStyle}>{t("locationsNameLabel")} *</label>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              style={inputStyle}
              autoFocus
            />
          </div>
          {formError && <p style={{ color: "var(--color-danger)", fontSize: 13, marginTop: 8 }}>{formError}</p>}
          <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
            <button onClick={() => setEditingId(null)} disabled={saving} style={btnSecondary}>
              {t("locationsCancelButton")}
            </button>
            <button onClick={() => void handleRename()} disabled={saving} style={btnPrimary}>
              {saving ? t("locationsSaving") : t("locationsSaveButton")}
            </button>
          </div>
        </div>
      )}

      {/* Archive confirm dialog */}
      {archivingId && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "var(--db-surface)",
              borderRadius: 12,
              padding: 24,
              maxWidth: 380,
              width: "90%",
              boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
            }}
          >
            <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700, color: "var(--db-text-primary)" }}>
              {t("locationsArchiveConfirmTitle")}
            </h3>
            <p style={{ fontSize: 13, color: "var(--db-text-secondary)", marginBottom: 20 }}>
              {t("locationsArchiveWarning")}
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setArchivingId(null)} disabled={saving} style={btnSecondary}>
                {t("locationsCancelButton")}
              </button>
              <button
                onClick={() => void handleArchive(archivingId)}
                disabled={saving}
                style={{ ...btnPrimary, background: "var(--color-warning)" }}
              >
                {saving ? t("locationsSaving") : t("locationsArchiveConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {visibleLocations.length === 0 && !showAdd ? (
        <p style={{ color: "var(--db-text-secondary)", fontSize: 14, textAlign: "center", padding: "32px 0" }}>
          {t("locationsNoLocations")}
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr
                style={{
                  borderBottom: "2px solid var(--db-border)",
                  color: "var(--db-text-secondary)",
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                {[
                  t("locationsTableName"),
                  t("locationsTableSales"),
                  t("locationsTableStatus"),
                  t("locationsTableActions"),
                ].map((col) => (
                  <th key={col} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleLocations.map((loc) => (
                <tr
                  key={loc.id}
                  style={{ borderBottom: "1px solid var(--db-border)", opacity: loc.is_active ? 1 : 0.5 }}
                >
                  {/* Name */}
                  <td style={{ ...tdStyle, fontWeight: 600 }}>
                    {loc.name}
                  </td>

                  {/* Sales badge */}
                  <td style={tdStyle}>
                    {loc.is_sales_location ? (
                      <span
                        style={{
                          background: "var(--color-brand-light)",
                          color: "var(--color-brand)",
                          borderRadius: 6,
                          padding: "2px 8px",
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        {t("locationsSalesBadge")}
                      </span>
                    ) : (
                      <span style={{ color: "var(--db-text-secondary)", fontSize: 11 }}>—</span>
                    )}
                  </td>

                  {/* Status */}
                  <td style={tdStyle}>
                    <span style={{ fontSize: 11, color: loc.is_active ? "var(--color-success)" : "var(--db-text-secondary)" }}>
                      {loc.is_active ? t("locationsStatusActive") : t("locationsStatusInactive")}
                    </span>
                  </td>

                  {/* Actions */}
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <button onClick={() => openEdit(loc)} style={btnSmall} title={t("locationsEditTitle")}>✏️</button>
                      {!loc.is_sales_location && loc.is_active && (
                        <button
                          onClick={() => void handleSetSales(loc.id)}
                          disabled={saving}
                          style={{ ...btnSmall, fontSize: 11, padding: "3px 7px", border: "1px solid var(--db-border)", borderRadius: 6 }}
                          title={t("locationsSetSalesButton")}
                        >
                          {t("locationsSetSalesButton")}
                        </button>
                      )}
                      {loc.is_active && (
                        <button
                          onClick={() => setArchivingId(loc.id)}
                          style={{ ...btnSmall, color: "var(--color-warning)" }}
                          title={t("locationsArchiveConfirm")}
                        >
                          🗄
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
