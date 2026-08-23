"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useTranslations } from "next-intl";

// ── Types ──────────────────────────────────────────────────────────────────────

interface InventoryLocation {
  id: string;
  name: string;
  is_active: boolean;
  is_sales_location: boolean;
}

interface MenuItem {
  id: string;
  name: string;
}

interface SblRow {
  id: string;
  menu_item_id: string;
  location_id: string;
  qty: number;
  low_stock_threshold: number | null;
  par_level: number | null;
}

interface StockByLocationPanelProps {
  businessId: string;
  item: MenuItem;
  locations: InventoryLocation[];
  sblMap: Record<string, Record<string, SblRow>>;
  onRefresh: () => void;
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "70px",
  padding: "4px 7px",
  border: "1px solid var(--db-border)",
  borderRadius: 6,
  background: "var(--db-bg)",
  color: "var(--db-text-primary)",
  fontSize: 13,
  textAlign: "right",
  boxSizing: "border-box",
};

const btnSmall: React.CSSProperties = {
  background: "var(--db-accent)",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  padding: "4px 10px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const btnGhost: React.CSSProperties = {
  background: "none",
  color: "var(--db-text-secondary)",
  border: "1px solid var(--db-border)",
  borderRadius: 6,
  padding: "4px 10px",
  fontSize: 12,
  cursor: "pointer",
};

// ── Component ──────────────────────────────────────────────────────────────────

export default function StockByLocationPanel({
  businessId,
  item,
  locations,
  sblMap,
  onRefresh,
}: StockByLocationPanelProps) {
  const t = useTranslations("dashboardCommon");

  // Inline qty editing: locationId → pending qty string
  const [editQty, setEditQty] = useState<Record<string, string>>({});
  const [savingLoc, setSavingLoc] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  // MOVE modal state
  const [moveFromLoc, setMoveFromLoc] = useState<string | null>(null);
  const [moveToLoc, setMoveToLoc] = useState("");
  const [moveQty, setMoveQty] = useState("");
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState("");

  const itemSblMap = sblMap[item.id] ?? {};
  const activeLocations = locations.filter((l) => l.is_active);

  // ── Set qty ──────────────────────────────────────────────────────────────────

  async function handleSetQty(locationId: string) {
    const rawQty = editQty[locationId];
    const qty = parseInt(rawQty ?? "0", 10);
    if (isNaN(qty) || qty < 0) {
      setRowError(t("sblQtyInvalid"));
      return;
    }
    setSavingLoc(locationId);
    setRowError(null);
    try {
      const { error } = await supabase.rpc("inventory_set_location_qty", {
        p_business_id: businessId,
        p_menu_item_id: item.id,
        p_location_id: locationId,
        p_qty: qty,
        p_reason: "count",
      });
      if (error) throw error;
      setEditQty((prev) => { const n = { ...prev }; delete n[locationId]; return n; });
      onRefresh();
    } catch (err: unknown) {
      setRowError(err instanceof Error ? err.message : "Error");
    } finally {
      setSavingLoc(null);
    }
  }

  // ── Move ────────────────────────────────────────────────────────────────────

  function openMove(locationId: string) {
    setMoveFromLoc(locationId);
    setMoveToLoc("");
    setMoveQty("");
    setMoveError("");
  }

  async function handleMove() {
    const qty = parseInt(moveQty, 10);
    if (!moveFromLoc || !moveToLoc) { setMoveError(t("sblMovSelectBoth")); return; }
    if (isNaN(qty) || qty <= 0) { setMoveError(t("sblMovQtyPositive")); return; }
    setMoving(true);
    setMoveError("");
    try {
      const { error } = await supabase.rpc("inventory_transfer", {
        p_business_id: businessId,
        p_menu_item_id: item.id,
        p_from_location: moveFromLoc,
        p_to_location: moveToLoc,
        p_qty: qty,
      });
      if (error) throw error;
      setMoveFromLoc(null);
      onRefresh();
    } catch (err: unknown) {
      setMoveError(err instanceof Error ? err.message : "Error");
    } finally {
      setMoving(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (activeLocations.length === 0) {
    return (
      <td colSpan={11} style={{ padding: "12px 16px", background: "var(--db-surface-alt, rgba(0,0,0,0.02))" }}>
        <p style={{ fontSize: 12, color: "var(--db-text-secondary)", margin: 0 }}>
          {t("sblNoLocations")}
        </p>
      </td>
    );
  }

  return (
    <td
      colSpan={11}
      style={{
        padding: "12px 16px",
        background: "var(--db-surface-alt, rgba(0,0,0,0.02))",
        borderBottom: "2px solid var(--db-border)",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--db-text-secondary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {t("sblPanelTitle")} — {item.name}
      </div>

      {rowError && (
        <p style={{ fontSize: 12, color: "var(--color-danger)", marginBottom: 8 }}>{rowError}</p>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 13, minWidth: 480 }}>
          <thead>
            <tr style={{ fontSize: 11, color: "var(--db-text-secondary)", borderBottom: "1px solid var(--db-border)" }}>
              <th style={{ padding: "4px 10px", textAlign: "left", fontWeight: 600 }}>{t("sblLocationCol")}</th>
              <th style={{ padding: "4px 10px", textAlign: "right", fontWeight: 600 }}>{t("sblQtyCol")}</th>
              <th style={{ padding: "4px 10px", textAlign: "right", fontWeight: 600 }}>{t("sblLowStockCol")}</th>
              <th style={{ padding: "4px 10px", textAlign: "right", fontWeight: 600 }}>{t("sblParCol")}</th>
              <th style={{ padding: "4px 10px", textAlign: "center", fontWeight: 600 }}>{t("locationsTableActions")}</th>
            </tr>
          </thead>
          <tbody>
            {activeLocations.map((loc) => {
              const sblRow = itemSblMap[loc.id];
              const currentQty = sblRow?.qty ?? null;
              const pendingQty = editQty[loc.id];
              const isEditing = pendingQty !== undefined;
              const isSaving = savingLoc === loc.id;

              return (
                <tr key={loc.id} style={{ borderBottom: "1px solid var(--db-border)" }}>
                  {/* Location name */}
                  <td style={{ padding: "6px 10px", color: "var(--db-text-primary)", fontWeight: loc.is_sales_location ? 600 : 400 }}>
                    {loc.name}
                    {loc.is_sales_location && (
                      <span style={{ marginLeft: 6, fontSize: 10, color: "var(--color-brand)", fontWeight: 700 }}>
                        📍
                      </span>
                    )}
                  </td>

                  {/* Qty — editable */}
                  <td style={{ padding: "6px 10px", textAlign: "right" }}>
                    {currentQty === null ? (
                      <span style={{ color: "var(--db-text-secondary)", fontSize: 12 }}>—</span>
                    ) : isEditing ? (
                      <input
                        type="number"
                        min={0}
                        value={pendingQty}
                        onChange={(e) => setEditQty((prev) => ({ ...prev, [loc.id]: e.target.value }))}
                        style={inputStyle}
                        autoFocus
                      />
                    ) : (
                      <span
                        style={{ cursor: "pointer", borderBottom: "1px dashed var(--db-border)", paddingBottom: 1 }}
                        onClick={() => setEditQty((prev) => ({ ...prev, [loc.id]: String(currentQty) }))}
                        title={t("sblClickToEdit")}
                      >
                        {currentQty}
                      </span>
                    )}
                  </td>

                  {/* Low stock threshold */}
                  <td style={{ padding: "6px 10px", textAlign: "right", color: "var(--db-text-secondary)", fontSize: 12 }}>
                    {sblRow?.low_stock_threshold ?? "—"}
                  </td>

                  {/* Par level */}
                  <td style={{ padding: "6px 10px", textAlign: "right", color: "var(--db-text-secondary)", fontSize: 12 }}>
                    {sblRow?.par_level ?? "—"}
                  </td>

                  {/* Actions */}
                  <td style={{ padding: "6px 10px", textAlign: "center", whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => void handleSetQty(loc.id)}
                            disabled={isSaving}
                            style={btnSmall}
                          >
                            {isSaving ? "…" : t("sblSaveButton")}
                          </button>
                          <button
                            onClick={() => setEditQty((prev) => { const n = { ...prev }; delete n[loc.id]; return n; })}
                            disabled={isSaving}
                            style={btnGhost}
                          >
                            {t("sblCancelButton")}
                          </button>
                        </>
                      ) : currentQty !== null ? (
                        <>
                          <button
                            onClick={() => setEditQty((prev) => ({ ...prev, [loc.id]: String(currentQty) }))}
                            style={btnGhost}
                            title={t("sblClickToEdit")}
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => openMove(loc.id)}
                            style={btnGhost}
                            title={t("sblMoveButton")}
                          >
                            {t("sblMoveButton")}
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setEditQty((prev) => ({ ...prev, [loc.id]: "0" }))}
                          style={btnGhost}
                          title={t("sblInitQty")}
                        >
                          + {t("sblInitQty")}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* MOVE modal */}
      {moveFromLoc && (
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
            <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "var(--db-text-primary)" }}>
              {t("sblMovTitle")} — {item.name}
            </h3>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--db-text-secondary)", marginBottom: 4 }}>
                {t("sblMovFrom")}
              </label>
              <div style={{ fontSize: 13, color: "var(--db-text-primary)", padding: "7px 10px", background: "var(--db-bg)", border: "1px solid var(--db-border)", borderRadius: 7 }}>
                {locations.find((l) => l.id === moveFromLoc)?.name ?? moveFromLoc}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--db-text-secondary)", marginBottom: 4 }}>
                {t("sblMovTo")}
              </label>
              <select
                value={moveToLoc}
                onChange={(e) => setMoveToLoc(e.target.value)}
                style={{ width: "100%", padding: "7px 10px", border: "1px solid var(--db-border)", borderRadius: 7, background: "var(--db-bg)", color: "var(--db-text-primary)", fontSize: 13 }}
              >
                <option value="">— {t("sblMovSelectDest")} —</option>
                {activeLocations.filter((l) => l.id !== moveFromLoc).map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--db-text-secondary)", marginBottom: 4 }}>
                {t("sblMovQty")}
              </label>
              <input
                type="number"
                min={1}
                value={moveQty}
                onChange={(e) => setMoveQty(e.target.value)}
                style={{ width: "100%", padding: "7px 10px", border: "1px solid var(--db-border)", borderRadius: 7, background: "var(--db-bg)", color: "var(--db-text-primary)", fontSize: 13, boxSizing: "border-box" }}
                placeholder="1"
              />
            </div>

            {moveError && <p style={{ fontSize: 12, color: "var(--color-danger)", marginBottom: 12 }}>{moveError}</p>}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setMoveFromLoc(null)} disabled={moving} style={{ ...btnGhost, padding: "8px 14px", fontSize: 13 }}>
                {t("sblMovCancel")}
              </button>
              <button onClick={() => void handleMove()} disabled={moving} style={{ ...btnSmall, padding: "8px 18px", fontSize: 13 }}>
                {moving ? t("sblMovMoving") : t("sblMovConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </td>
  );
}
