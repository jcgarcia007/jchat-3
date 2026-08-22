"use client";

import { useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useTranslations } from "next-intl";
import type { Database } from "@/lib/database.types";

type Supplier = Database["public"]["Tables"]["suppliers"]["Row"];

/** Minimal shape of menu items as loaded by the inventory page */
interface ItemWithSupplier {
  id: string;
  supplier_id: string | null;
}

interface SuppliersTabProps {
  businessId: string;
  suppliers: Supplier[];
  items: ItemWithSupplier[];
  onRefresh: () => void;
}

const EMPTY_FORM = {
  name: "",
  contact_name: "",
  email: "",
  phone: "",
  account_number: "",
  notes: "",
  is_active: true,
};

type FormState = typeof EMPTY_FORM;

export default function SuppliersTab({
  businessId,
  suppliers,
  items,
  onRefresh,
}: SuppliersTabProps) {
  const t = useTranslations("dashboardCommon");

  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  // Number of menu items per supplier
  const countBySupplier = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const item of items) {
      if (item.supplier_id) {
        map[item.supplier_id] = (map[item.supplier_id] ?? 0) + 1;
      }
    }
    return map;
  }, [items]);

  function openAdd() {
    setForm(EMPTY_FORM);
    setFormError("");
    setEditingId(null);
    setShowAdd(true);
  }

  function openEdit(s: Supplier) {
    setForm({
      name: s.name,
      contact_name: s.contact_name ?? "",
      email: s.email ?? "",
      phone: s.phone ?? "",
      account_number: s.account_number ?? "",
      notes: s.notes ?? "",
      is_active: s.is_active,
    });
    setFormError("");
    setEditingId(s.id);
    setShowAdd(false);
  }

  function cancelForm() {
    setShowAdd(false);
    setEditingId(null);
    setFormError("");
  }

  function setField(key: keyof FormState, value: string | boolean) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setFormError(t("suppliersNameRequired"));
      return;
    }
    setSaving(true);
    setFormError("");

    const payload = {
      name: form.name.trim(),
      contact_name: form.contact_name.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      account_number: form.account_number.trim() || null,
      notes: form.notes.trim() || null,
      is_active: form.is_active,
    };

    try {
      if (editingId) {
        const { error } = await supabase
          .from("suppliers")
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq("id", editingId)
          .eq("business_id", businessId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("suppliers")
          .insert({ ...payload, business_id: businessId });
        if (error) throw error;
      }
      cancelForm();
      onRefresh();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Error saving supplier");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("suppliers")
        .delete()
        .eq("id", id)
        .eq("business_id", businessId);
      if (error) throw error;
      setDeletingId(null);
      onRefresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error deleting supplier");
    } finally {
      setSaving(false);
    }
  }

  const isFormOpen = showAdd || editingId !== null;

  return (
    <div style={{ paddingTop: 8 }}>
      {/* Add button */}
      {!isFormOpen && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
          <button
            onClick={openAdd}
            style={{
              background: "var(--db-accent)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "8px 18px",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            + {t("suppliersAddButton")}
          </button>
        </div>
      )}

      {/* Add / Edit Form */}
      {isFormOpen && (
        <div
          style={{
            background: "var(--db-surface)",
            border: "1px solid var(--db-border)",
            borderRadius: 12,
            padding: 20,
            marginBottom: 20,
          }}
        >
          <h3
            style={{
              margin: "0 0 16px",
              fontSize: 15,
              fontWeight: 700,
              color: "var(--db-text-primary)",
            }}
          >
            {editingId ? t("suppliersEditTitle") : t("suppliersAddTitle")}
          </h3>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
            }}
          >
            {/* Name (required) */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>{t("suppliersTableName")} *</label>
              <input
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                placeholder={t("suppliersTableName")}
                style={inputStyle}
              />
            </div>

            {/* Contact */}
            <div>
              <label style={labelStyle}>{t("suppliersTableContact")}</label>
              <input
                value={form.contact_name}
                onChange={(e) => setField("contact_name", e.target.value)}
                placeholder={t("suppliersTableContact")}
                style={inputStyle}
              />
            </div>

            {/* Account # */}
            <div>
              <label style={labelStyle}>{t("suppliersTableAccountNumber")}</label>
              <input
                value={form.account_number}
                onChange={(e) => setField("account_number", e.target.value)}
                placeholder={t("suppliersTableAccountNumber")}
                style={inputStyle}
              />
            </div>

            {/* Email */}
            <div>
              <label style={labelStyle}>{t("suppliersTableEmail")}</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setField("email", e.target.value)}
                placeholder={t("suppliersTableEmail")}
                style={inputStyle}
              />
            </div>

            {/* Phone */}
            <div>
              <label style={labelStyle}>{t("suppliersTablePhone")}</label>
              <input
                value={form.phone}
                onChange={(e) => setField("phone", e.target.value)}
                placeholder={t("suppliersTablePhone")}
                style={inputStyle}
              />
            </div>

            {/* Notes (full width) */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>{t("suppliersTableNotes")}</label>
              <textarea
                value={form.notes}
                onChange={(e) => setField("notes", e.target.value)}
                placeholder={t("suppliersTableNotes")}
                rows={2}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </div>

            {/* Active toggle */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                id="supplier-active"
                checked={form.is_active}
                onChange={(e) => setField("is_active", e.target.checked)}
              />
              <label
                htmlFor="supplier-active"
                style={{ fontSize: 13, color: "var(--db-text-secondary)", cursor: "pointer" }}
              >
                {t("suppliersActiveLabel")}
              </label>
            </div>
          </div>

          {formError && (
            <p style={{ color: "var(--color-danger)", fontSize: 13, marginTop: 8 }}>
              {formError}
            </p>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
            <button onClick={cancelForm} disabled={saving} style={btnSecondary}>
              {t("suppliersCancelButton")}
            </button>
            <button onClick={handleSave} disabled={saving} style={btnPrimary}>
              {saving ? t("suppliersSaving") : t("suppliersSaveButton")}
            </button>
          </div>
        </div>
      )}

      {/* Delete confirm dialog */}
      {deletingId && (
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
            <h3
              style={{
                margin: "0 0 8px",
                fontSize: 16,
                fontWeight: 700,
                color: "var(--db-text-primary)",
              }}
            >
              {t("suppliersDeleteConfirmTitle")}
            </h3>
            <p style={{ fontSize: 13, color: "var(--db-text-secondary)", marginBottom: 20 }}>
              {t("suppliersDeleteWarning")}
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setDeletingId(null)}
                disabled={saving}
                style={btnSecondary}
              >
                {t("suppliersCancelButton")}
              </button>
              <button
                onClick={() => handleDelete(deletingId)}
                disabled={saving}
                style={{ ...btnPrimary, background: "var(--color-danger)" }}
              >
                {saving ? t("suppliersSaving") : t("suppliersDeleteConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {suppliers.length === 0 && !isFormOpen ? (
        <p style={{ color: "var(--db-text-secondary)", fontSize: 14, textAlign: "center", padding: "32px 0" }}>
          {t("suppliersNoSuppliers")}
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13,
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: "2px solid var(--db-border)",
                  color: "var(--db-text-secondary)",
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                {[
                  t("suppliersTableName"),
                  t("suppliersTableContact"),
                  t("suppliersTableEmail"),
                  t("suppliersTablePhone"),
                  t("suppliersTableAccountNumber"),
                  t("suppliersTableProducts"),
                  t("suppliersTableActions"),
                ].map((col) => (
                  <th
                    key={col}
                    style={{
                      padding: "8px 10px",
                      textAlign: "left",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr
                  key={s.id}
                  style={{
                    borderBottom: "1px solid var(--db-border)",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLTableRowElement).style.background =
                      "var(--db-surface-alt, rgba(0,0,0,0.03))")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLTableRowElement).style.background = "")
                  }
                >
                  <td style={tdStyle}>
                    <span style={{ fontWeight: 600, color: "var(--db-text-primary)" }}>
                      {s.name}
                    </span>
                    {!s.is_active && (
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: 10,
                          background: "var(--db-border)",
                          color: "var(--db-text-secondary)",
                          borderRadius: 4,
                          padding: "1px 5px",
                        }}
                      >
                        OFF
                      </span>
                    )}
                  </td>
                  <td style={tdStyle}>{s.contact_name ?? "—"}</td>
                  <td style={tdStyle}>{s.email ?? "—"}</td>
                  <td style={tdStyle}>{s.phone ?? "—"}</td>
                  <td style={tdStyle}>{s.account_number ?? "—"}</td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    {countBySupplier[s.id] ?? 0}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => openEdit(s)}
                        style={btnSmall}
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => setDeletingId(s.id)}
                        style={{ ...btnSmall, color: "var(--color-danger)" }}
                      >
                        🗑
                      </button>
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

// ── shared inline styles ────────────────────────────────────────────────────

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
  fontSize: 15,
  padding: "2px 4px",
  borderRadius: 4,
};

const tdStyle: React.CSSProperties = {
  padding: "10px 10px",
  color: "var(--db-text-primary)",
  verticalAlign: "middle",
};
