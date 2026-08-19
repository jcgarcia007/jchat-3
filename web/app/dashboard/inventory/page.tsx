/**
 * JChat 3.0 — Dashboard Inventory Management (Task 3.10)
 * Updated: Ladrillo 1 — category grouping, search, filters, Par column.
 *
 * Features:
 *  1. Product list grouped by category, with Par column (read-only).
 *  2. Inline stock edit — updates menu_items + logs stock_movements.
 *  3. Low-stock threshold — editable per product.
 *  4. "Hidden" badge when stock_count === 0 (getMenu filters these out).
 *  5. Stock movement history log.
 *  6. Bulk CSV import.
 *  7. Search (client-side) + category chips + status tiles (combinable).
 *  8. "Add Product" form with required category selector + optional par level.
 *
 * Design: var(--db-*) tokens only. No hardcoded hex.
 * Icons: @tabler/icons-react only.
 */

"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  IconAlertTriangle,
  IconCheck,
  IconAlertCircle,
  IconBox,
  IconEdit,
  IconX,
  IconHistory,
  IconUpload,
  IconChevronDown,
  IconChevronUp,
  IconEyeOff,
  IconPlus,
  IconDownload,
  IconSearch,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { resolveActiveBusiness } from "@/lib/business";

// ── Types ────────────────────────────────────────────────────────────────────

interface MenuCategory {
  id: string;
  name: string;
  name_alt: string | null;
  sort: number;
}

interface MenuItem {
  id: string;
  business_id: string;
  category_id: string;
  name: string;
  stock_count: number;
  low_stock_threshold: number;
  par_level: number | null;
  is_published: boolean;
}

interface StockMovement {
  id: string;
  menu_item_id: string;
  business_id: string;
  delta: number;
  reason: string;
  created_at: string;
  /** Joined field — set client-side when we merge lists */
  item_name?: string;
}

// ── Demo data ─────────────────────────────────────────────────────────────────

const DEMO_CATEGORIES: MenuCategory[] = [
  { id: "demo-cat-1", name: "General", name_alt: null, sort: 0 },
];

const DEMO_ITEMS: MenuItem[] = [
  { id: "demo-1", business_id: "demo-biz", category_id: "demo-cat-1", name: "Classic Burger",   stock_count: 24, low_stock_threshold: 5,  par_level: null, is_published: true  },
  { id: "demo-2", business_id: "demo-biz", category_id: "demo-cat-1", name: "Caesar Salad",     stock_count: 3,  low_stock_threshold: 5,  par_level: null, is_published: true  },
  { id: "demo-3", business_id: "demo-biz", category_id: "demo-cat-1", name: "Margherita Pizza", stock_count: 0,  low_stock_threshold: 5,  par_level: null, is_published: false },
  { id: "demo-4", business_id: "demo-biz", category_id: "demo-cat-1", name: "Chocolate Cake",   stock_count: 8,  low_stock_threshold: 10, par_level: null, is_published: true  },
  { id: "demo-5", business_id: "demo-biz", category_id: "demo-cat-1", name: "Sparkling Water",  stock_count: 50, low_stock_threshold: 10, par_level: null, is_published: true  },
];

const DEMO_MOVEMENTS: StockMovement[] = [
  { id: "mv-1", menu_item_id: "demo-2", business_id: "demo-biz", delta: -2,  reason: "Sold",       created_at: new Date(Date.now() - 3_600_000).toISOString(),   item_name: "Caesar Salad"     },
  { id: "mv-2", menu_item_id: "demo-3", business_id: "demo-biz", delta: -5,  reason: "Sold",       created_at: new Date(Date.now() - 7_200_000).toISOString(),   item_name: "Margherita Pizza" },
  { id: "mv-3", menu_item_id: "demo-1", business_id: "demo-biz", delta: +20, reason: "Restock",    created_at: new Date(Date.now() - 86_400_000).toISOString(),  item_name: "Classic Burger"   },
  { id: "mv-4", menu_item_id: "demo-4", business_id: "demo-biz", delta: +15, reason: "CSV import", created_at: new Date(Date.now() - 172_800_000).toISOString(), item_name: "Chocolate Cake"   },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDatetime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Returns true when stock_count is at or below threshold (and threshold > 0). */
function isLowStock(item: MenuItem): boolean {
  return item.low_stock_threshold > 0 && item.stock_count <= item.low_stock_threshold && item.stock_count > 0;
}

/** True when item is out of stock → hidden from menu. */
function isOutOfStock(item: MenuItem): boolean {
  return item.stock_count <= 0;
}

/** Locale-aware category display name. */
function catDisplayName(cat: MenuCategory, locale: string): string {
  return locale === "es" && cat.name_alt ? cat.name_alt : cat.name;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--db-bg-surface)",
        border: "1px solid var(--db-border)",
        borderRadius: "var(--db-radius-card)",
        padding: "24px",
        marginBottom: "24px",
      }}
    >
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: "15px",
        fontWeight: 700,
        color: "var(--db-text-primary)",
        marginBottom: "16px",
        display: "flex",
        alignItems: "center",
        gap: "8px",
      }}
    >
      {children}
    </h2>
  );
}

function AlertBanner({
  type,
  message,
}: {
  type: "error" | "success" | "warning" | "info";
  message: string;
}) {
  const styles: Record<string, { bg: string; color: string }> = {
    error:   { bg: "rgba(239,68,68,0.12)",    color: "var(--db-danger)"  },
    success: { bg: "rgba(34,197,94,0.12)",     color: "var(--db-success)" },
    warning: { bg: "rgba(245,158,11,0.12)",    color: "var(--db-warning)" },
    info:    { bg: "var(--db-accent-bg)",      color: "var(--db-accent)"  },
  };
  const Icon =
    type === "success" ? IconCheck :
    type === "warning" ? IconAlertTriangle :
    IconAlertCircle;
  const s = styles[type] ?? styles.info;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "10px 14px",
        borderRadius: "var(--db-radius)",
        background: s.bg,
        color: s.color,
        fontSize: "13px",
        marginBottom: "16px",
      }}
    >
      <Icon size={15} />
      {message}
    </div>
  );
}

// ── Inline edit row state ─────────────────────────────────────────────────────

interface EditState {
  stockInput: string;
  thresholdInput: string;
  reasonInput: string;
}

// ── Stock row ─────────────────────────────────────────────────────────────────
//
// Grid (6 columns — identical for header, view mode, and edit mode):
//   "1fr   110px  80px  130px      130px   120px"
//    Name  Stock  Par   Threshold  Reason  Actions
//
// Par is always read-only (edit it in the menu editor).

const ROW_GRID = "1fr 110px 80px 130px 130px 120px";

function StockRow({
  item,
  editing,
  editState,
  saving,
  onStartEdit,
  onCancelEdit,
  onChangeEdit,
  onSave,
}: {
  item: MenuItem;
  editing: boolean;
  editState: EditState;
  saving: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onChangeEdit: (patch: Partial<EditState>) => void;
  onSave: () => void;
}) {
  const t = useTranslations("dashboardCommon");
  const low = isLowStock(item);
  const out = isOutOfStock(item);

  const rowBg = out
    ? "rgba(239,68,68,0.07)"
    : low
    ? "rgba(245,158,11,0.07)"
    : "transparent";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: ROW_GRID,
        alignItems: "center",
        gap: "12px",
        padding: "12px 16px",
        borderRadius: "var(--db-radius)",
        background: rowBg,
        borderBottom: "1px solid var(--db-border)",
      }}
    >
      {/* Col 1: Name + status badges */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
        <span
          style={{
            fontSize: "14px",
            fontWeight: 500,
            color: "var(--db-text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.name}
        </span>
        {out && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "2px 8px",
              borderRadius: "999px",
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              background: "rgba(239,68,68,0.15)",
              color: "var(--db-danger)",
              whiteSpace: "nowrap",
            }}
          >
            <IconEyeOff size={10} />
            {t("hiddenBadge")}
          </span>
        )}
        {low && !out && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "2px 8px",
              borderRadius: "999px",
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              background: "rgba(245,158,11,0.15)",
              color: "var(--db-warning)",
              whiteSpace: "nowrap",
            }}
          >
            <IconAlertTriangle size={10} />
            {t("inventoryLowStockBadge")}
          </span>
        )}
      </div>

      {/* Col 2: Stock count / edit input */}
      {editing ? (
        <input
          type="number"
          min="0"
          value={editState.stockInput}
          onChange={(e) => onChangeEdit({ stockInput: e.target.value })}
          style={inputStyle}
          autoFocus
        />
      ) : (
        <span
          style={{
            fontSize: "14px",
            fontWeight: 600,
            color: out
              ? "var(--db-danger)"
              : low
              ? "var(--db-warning)"
              : "var(--db-text-primary)",
            textAlign: "right",
          }}
        >
          {item.stock_count}
        </span>
      )}

      {/* Col 3: Par level — always read-only in both view and edit mode */}
      <span style={{ fontSize: "13px", color: "var(--db-text-secondary)", textAlign: "right" }}>
        {item.par_level != null ? item.par_level : "—"}
      </span>

      {/* Col 4: Low-stock threshold / edit input */}
      {editing ? (
        <input
          type="number"
          min="0"
          value={editState.thresholdInput}
          onChange={(e) => onChangeEdit({ thresholdInput: e.target.value })}
          style={inputStyle}
          placeholder={t("inventoryThresholdPlaceholder")}
        />
      ) : (
        <span style={{ fontSize: "13px", color: "var(--db-text-secondary)", textAlign: "right" }}>
          {item.low_stock_threshold}
        </span>
      )}

      {/* Col 5: Reason (edit mode only; empty span in view mode) */}
      {editing ? (
        <input
          type="text"
          value={editState.reasonInput}
          onChange={(e) => onChangeEdit({ reasonInput: e.target.value })}
          style={inputStyle}
          placeholder={t("inventoryReasonOptionalPlaceholder")}
        />
      ) : (
        <span />
      )}

      {/* Col 6: Actions */}
      {editing ? (
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button
            onClick={onSave}
            disabled={saving}
            style={btnStyle("var(--db-accent)", "var(--db-accent-text)")}
          >
            {saving ? "…" : <IconCheck size={14} />}
          </button>
          <button
            onClick={onCancelEdit}
            disabled={saving}
            style={btnStyle("var(--db-bg-elevated)", "var(--db-text-secondary)")}
          >
            <IconX size={14} />
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={onStartEdit}
            style={btnStyle("var(--db-bg-elevated)", "var(--db-text-secondary)")}
            title={t("inventoryEditStockTitle")}
          >
            <IconEdit size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Shared style constants ────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 10px",
  borderRadius: "var(--db-radius)",
  border: "1px solid var(--db-border)",
  background: "var(--db-bg-elevated)",
  color: "var(--db-text-primary)",
  fontSize: "13px",
  outline: "none",
  boxSizing: "border-box",
};

const addLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "11px",
  fontWeight: 600,
  color: "var(--db-text-secondary)",
  marginBottom: "5px",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

function btnStyle(bg: string, color: string): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px 10px",
    borderRadius: "var(--db-radius)",
    border: "none",
    background: bg,
    color: color,
    fontSize: "13px",
    cursor: "pointer",
    gap: "4px",
    fontWeight: 600,
    whiteSpace: "nowrap",
  };
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: "5px 12px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: active ? 700 : 500,
    border: active ? "1px solid var(--db-accent)" : "1px solid var(--db-border)",
    background: active
      ? "color-mix(in srgb, var(--db-accent) 12%, transparent)"
      : "var(--db-bg-elevated)",
    color: active ? "var(--db-accent)" : "var(--db-text-secondary)",
    cursor: "pointer",
    transition: "all 0.15s",
    whiteSpace: "nowrap",
  };
}

// ── CSV import helpers ────────────────────────────────────────────────────────

interface CsvRow {
  name: string;
  stock: number;
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const nameIdx  = headers.findIndex((h) => h === "name");
  const stockIdx = headers.findIndex((h) => h === "stock" || h === "stock_count");

  if (nameIdx === -1 || stockIdx === -1) return [];

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const name  = cols[nameIdx]?.trim() ?? "";
    const stock = parseInt(cols[stockIdx]?.trim() ?? "0", 10);
    if (name && !isNaN(stock)) rows.push({ name, stock });
  }
  return rows;
}

// ── TODO(server/Edge Function) stub ──────────────────────────────────────────
// async function notifyOwnerLowStock(_businessId: string, _items: MenuItem[]) {
//   // TODO(server/Edge Function): email owner on low stock
//   //   await supabase.functions.invoke('notify-low-stock', { body: { ... } });
// }

// ── Main page ─────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const t       = useTranslations("dashboardCommon");
  const tCommon = useTranslations("common");
  const locale  = useLocale();

  const [businessId, setBusinessId] = useState<string | null>(null);
  const [loadingBiz, setLoadingBiz] = useState(true);

  const [categories, setCategories]     = useState<MenuCategory[]>([]);
  const [items, setItems]               = useState<MenuItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  const [movements, setMovements]               = useState<StockMovement[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [showHistory, setShowHistory]           = useState(false);

  // Inline edit: map of item.id → EditState
  const [editMap, setEditMap]   = useState<Record<string, EditState>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  // "Add Product" form fields
  const [newName, setNewName]                     = useState("");
  const [newStock, setNewStock]                   = useState("");
  const [newThreshold, setNewThreshold]           = useState("");
  const [newCategoryId, setNewCategoryId]         = useState("");
  const [newCategoryName, setNewCategoryName]     = useState("");
  const [creatingCategory, setCreatingCategory]   = useState(false);
  const [newParLevel, setNewParLevel]             = useState("");
  const [adding, setAdding]                       = useState(false);

  // CSV import
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting]   = useState(false);
  const [csvReport, setCsvReport]   = useState<string | null>(null);

  // Feedback
  const [error, setError]     = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Filters (combinable)
  const [filterCategory, setFilterCategory]                 = useState<string>("all");
  const [filterStatus, setFilterStatus]                     = useState<"all" | "low" | "out">("all");
  const [search, setSearch]                                 = useState("");

  // ── Resolve business id ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoadingBiz(false);
      setCategories(DEMO_CATEGORIES);
      setItems(DEMO_ITEMS);
      setMovements(DEMO_MOVEMENTS);
      return;
    }
    void (async () => {
      try {
        const res = await resolveActiveBusiness();
        if (res.ok) {
          setBusinessId(res.business.id);
        } else if (res.reason === "no_business" || res.reason === "unauthenticated") {
          setError(res.message);
        }
      } catch {
        // silently fall through — live data won't load but demo is fine
      } finally {
        setLoadingBiz(false);
      }
    })();
  }, []);

  // ── Load categories ──────────────────────────────────────────────────────────
  const loadCategories = useCallback(async (bizId: string) => {
    try {
      const { data } = await supabase
        .from("menu_categories")
        .select("id, name, name_alt, sort")
        .eq("business_id", bizId)
        .order("sort", { ascending: true });
      setCategories((data as MenuCategory[]) ?? []);
    } catch {
      // non-fatal — chips simply won't appear
    }
  }, []);

  // ── Load menu items ──────────────────────────────────────────────────────────
  const loadItems = useCallback(async (bizId: string) => {
    setLoadingItems(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("menu_items")
        .select("id, business_id, category_id, name, stock_count, low_stock_threshold, par_level, is_published")
        .eq("business_id", bizId)
        .order("name", { ascending: true });
      if (err) throw err;
      setItems((data as MenuItem[]) ?? []);
    } catch (e: unknown) {
      setError(t("inventoryLoadProductsError", { msg: e instanceof Error ? e.message : String(e) }));
    } finally {
      setLoadingItems(false);
    }
  }, [t]);

  // ── Load movements ───────────────────────────────────────────────────────────
  const loadMovements = useCallback(async (bizId: string) => {
    setLoadingMovements(true);
    try {
      const { data, error: err } = await supabase
        .from("stock_movements")
        .select("id, menu_item_id, business_id, delta, reason, created_at")
        .eq("business_id", bizId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (err) throw err;
      // Annotate with item names from already-loaded items list
      const byId: Record<string, string> = {};
      items.forEach((i) => { byId[i.id] = i.name; });
      const annotated = ((data as StockMovement[]) ?? []).map((m) => ({
        ...m,
        item_name: byId[m.menu_item_id] ?? m.menu_item_id,
      }));
      setMovements(annotated);
    } catch (e: unknown) {
      setError(t("inventoryLoadHistoryError", { msg: e instanceof Error ? e.message : String(e) }));
    } finally {
      setLoadingMovements(false);
    }
  }, [items, t]);

  useEffect(() => {
    if (businessId) {
      void loadItems(businessId);
      void loadCategories(businessId);
    }
  }, [businessId, loadItems, loadCategories]);

  // ── Inline edit handlers ─────────────────────────────────────────────────────
  function startEdit(item: MenuItem) {
    setEditMap((prev) => ({
      ...prev,
      [item.id]: {
        stockInput:     String(item.stock_count),
        thresholdInput: String(item.low_stock_threshold),
        reasonInput:    "",
      },
    }));
    setError(null);
    setSuccess(null);
  }

  function cancelEdit(id: string) {
    setEditMap((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function patchEdit(id: string, patch: Partial<EditState>) {
    setEditMap((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
  }

  async function saveEdit(item: MenuItem) {
    const state = editMap[item.id];
    if (!state) return;

    const newStockVal     = parseInt(state.stockInput, 10);
    const newThresholdVal = parseInt(state.thresholdInput, 10);

    if (isNaN(newStockVal) || newStockVal < 0) {
      setError(t("inventoryStockCountNonNegativeError"));
      return;
    }
    if (isNaN(newThresholdVal) || newThresholdVal < 0) {
      setError(t("inventoryLowStockThresholdError"));
      return;
    }

    const delta  = newStockVal - item.stock_count;
    const reason = state.reasonInput.trim() || (delta >= 0 ? t("inventoryManualAdjustmentReason") : t("inventoryManualDeductionReason"));

    if (!isSupabaseConfigured) {
      // Demo mode: update local state only
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? { ...i, stock_count: newStockVal, low_stock_threshold: newThresholdVal }
            : i
        )
      );
      if (delta !== 0) {
        setMovements((prev) => [
          {
            id:           `mv-demo-${Date.now()}`,
            menu_item_id: item.id,
            business_id:  item.business_id,
            delta,
            reason,
            created_at:   new Date().toISOString(),
            item_name:    item.name,
          },
          ...prev,
        ]);
      }
      cancelEdit(item.id);
      setSuccess(t("inventoryStockUpdatedDemoSuccess", { name: item.name }));
      return;
    }

    setSavingId(item.id);
    setError(null);
    setSuccess(null);
    try {
      // 1. Update menu_items
      const { error: upErr } = await supabase
        .from("menu_items")
        .update({ stock_count: newStockVal, low_stock_threshold: newThresholdVal })
        .eq("id", item.id);
      if (upErr) throw upErr;

      // 2. Log movement if stock changed
      if (delta !== 0 && businessId) {
        const { error: mvErr } = await supabase
          .from("stock_movements")
          .insert({
            menu_item_id: item.id,
            business_id:  businessId,
            delta,
            reason,
          });
        if (mvErr) throw mvErr;
      }

      // TODO(server/Edge Function): email owner on low stock
      // if (newStockVal <= newThresholdVal && newThresholdVal > 0 && newStockVal > 0 && businessId) {
      //   await notifyOwnerLowStock(businessId, [{ ...item, stock_count: newStockVal }]);
      // }

      // 3. Refresh local state
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? { ...i, stock_count: newStockVal, low_stock_threshold: newThresholdVal }
            : i
        )
      );
      cancelEdit(item.id);
      setSuccess(t("inventoryStockUpdatedSuccess", { name: item.name }));
      // Refresh movements if history panel is open
      if (showHistory && businessId) void loadMovements(businessId);
    } catch (e: unknown) {
      setError(t("inventorySaveFailedError", { msg: e instanceof Error ? e.message : String(e) }));
    } finally {
      setSavingId(null);
    }
  }

  // ── Toggle history panel ─────────────────────────────────────────────────────
  async function toggleHistory() {
    if (!showHistory && movements.length === 0 && businessId) {
      await loadMovements(businessId);
    }
    setShowHistory((v) => !v);
  }

  // ── CSV import ───────────────────────────────────────────────────────────────
  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result;
      if (typeof text !== "string") return;

      const rows = parseCsv(text);
      if (rows.length === 0) {
        setError(t("inventoryCsvParseError"));
        return;
      }

      setImporting(true);
      setError(null);
      setCsvReport(null);

      let updated = 0;
      let skipped = 0;

      for (const row of rows) {
        // Match by name (case-insensitive)
        const match = items.find(
          (i) => i.name.toLowerCase() === row.name.toLowerCase()
        );
        if (!match) { skipped++; continue; }

        const delta = row.stock - match.stock_count;

        if (!isSupabaseConfigured) {
          setItems((prev) =>
            prev.map((i) =>
              i.id === match.id ? { ...i, stock_count: row.stock } : i
            )
          );
          if (delta !== 0) {
            setMovements((prev) => [
              {
                id:           `mv-csv-${Date.now()}-${match.id}`,
                menu_item_id: match.id,
                business_id:  match.business_id,
                delta,
                reason:       t("inventoryCsvImportReason"),
                created_at:   new Date().toISOString(),
                item_name:    match.name,
              },
              ...prev,
            ]);
          }
          updated++;
          continue;
        }

        // Live update
        const { error: upErr } = await supabase
          .from("menu_items")
          .update({ stock_count: row.stock })
          .eq("id", match.id);
        if (upErr) { skipped++; continue; }

        if (delta !== 0 && businessId) {
          await supabase.from("stock_movements").insert({
            menu_item_id: match.id,
            business_id:  businessId,
            delta,
            reason:       t("inventoryCsvImportReason"),
          });
        }

        // TODO(server/Edge Function): email owner on low stock after CSV import

        setItems((prev) =>
          prev.map((i) => (i.id === match.id ? { ...i, stock_count: row.stock } : i))
        );
        updated++;
      }

      setImporting(false);
      setCsvReport(t("inventoryCsvImportReport", { updated, skipped }));
      // Reset file input so the same file can be re-imported
      if (fileInputRef.current) fileInputRef.current.value = "";
      // Refresh movements if history is open
      if (showHistory && businessId) void loadMovements(businessId);
    };
    reader.readAsText(file);
  }

  // ── Manual add product ───────────────────────────────────────────────────────
  async function addProduct() {
    const name         = newName.trim();
    const stockNum     = parseInt(newStock, 10);
    const thresholdNum = newThreshold.trim() === "" ? 5 : parseInt(newThreshold, 10);
    const parNum: number | null = newParLevel.trim() !== "" ? parseInt(newParLevel, 10) : null;

    if (!name) {
      setError(t("inventoryProductNameRequiredError"));
      return;
    }
    if (isNaN(stockNum) || stockNum < 0) {
      setError(t("inventoryInitialStockNonNegativeError"));
      return;
    }
    if (isNaN(thresholdNum) || thresholdNum < 0) {
      setError(t("inventoryAlertThresholdNonNegativeError"));
      return;
    }
    // Category is required
    if (!creatingCategory && newCategoryId === "") {
      setError(t("inventoryCategoryRequiredError"));
      return;
    }
    if (creatingCategory && newCategoryName.trim() === "") {
      setError(t("inventoryCategoryRequiredError"));
      return;
    }

    setError(null);
    setSuccess(null);

    // Demo mode: append locally only.
    if (!isSupabaseConfigured) {
      let catId = newCategoryId;
      if (creatingCategory) {
        catId = `demo-cat-${Date.now()}`;
        const newCat: MenuCategory = {
          id: catId,
          name: newCategoryName.trim(),
          name_alt: null,
          sort: categories.length,
        };
        setCategories((prev) => [...prev, newCat]);
      }
      setItems((prev) =>
        [
          ...prev,
          {
            id:                  `demo-new-${Date.now()}`,
            business_id:         "demo-biz",
            category_id:         catId,
            name,
            stock_count:         stockNum,
            low_stock_threshold: thresholdNum,
            par_level:           parNum,
            is_published:        true,
          },
        ].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setNewName(""); setNewStock(""); setNewThreshold("");
      setNewCategoryId(""); setNewCategoryName(""); setCreatingCategory(false);
      setNewParLevel("");
      setSuccess(t("inventoryAddedDemoSuccess", { name }));
      return;
    }

    if (!businessId) {
      setError(t("inventoryNoBusinessError"));
      return;
    }

    setAdding(true);
    try {
      let categoryId = newCategoryId;

      // Create new category if the user typed a new one
      if (creatingCategory) {
        const { data: newCat, error: catInsErr } = await supabase
          .from("menu_categories")
          .insert({ business_id: businessId, name: newCategoryName.trim() })
          .select("id, name, name_alt, sort")
          .single();
        if (catInsErr || !newCat) throw new Error(catInsErr?.message ?? t("inventoryCreateCategoryError"));
        categoryId = (newCat as MenuCategory).id;
        setCategories((prev) => [...prev, newCat as MenuCategory]);
      }

      const { data: inserted, error: insErr } = await supabase
        .from("menu_items")
        .insert({
          business_id:         businessId,
          category_id:         categoryId,
          name,
          stock_count:         stockNum,
          low_stock_threshold: thresholdNum,
          par_level:           parNum,
          price_cents:         0,
        })
        .select("id, business_id, category_id, name, stock_count, low_stock_threshold, par_level, is_published")
        .single();
      if (insErr || !inserted) throw new Error(insErr?.message ?? t("inventoryAddProductGenericError"));

      // Log the initial stock as a movement.
      if (stockNum > 0) {
        await supabase.from("stock_movements").insert({
          menu_item_id: (inserted as MenuItem).id,
          business_id:  businessId,
          delta:        stockNum,
          reason:       t("inventoryInitialStockReason"),
        });
      }

      setItems((prev) =>
        [...prev, inserted as MenuItem].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setNewName(""); setNewStock(""); setNewThreshold("");
      setNewCategoryId(""); setNewCategoryName(""); setCreatingCategory(false);
      setNewParLevel("");
      setSuccess(t("inventoryAddedSuccess", { name }));
      if (showHistory) void loadMovements(businessId);
    } catch (e: unknown) {
      setError(t("inventoryAddProductFailedError", { msg: e instanceof Error ? e.message : String(e) }));
    } finally {
      setAdding(false);
    }
  }

  // ── Download a CSV template ──────────────────────────────────────────────────
  function downloadCsvTemplate() {
    const csv = "name,stock\nHamburger,50\nFrench Fries,30\nCoca Cola,100\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inventory_template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Derived stats ────────────────────────────────────────────────────────────
  const lowCount = items.filter((i) => isLowStock(i)).length;
  const outCount = items.filter((i) => isOutOfStock(i)).length;

  // Items matching search + status, WITHOUT category filter.
  // Used for chip counts so each chip always shows "how many I'd see if I clicked it."
  const itemsMatchingSearchAndStatus = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesSearch = q === "" || item.name.toLowerCase().includes(q);
      const matchesStatus =
        filterStatus === "all"  ? true :
        filterStatus === "low"  ? isLowStock(item) :
        /* "out" */               isOutOfStock(item);
      return matchesSearch && matchesStatus;
    });
  }, [items, search, filterStatus]);

  // Count per category (reflects search + status; used in chip badges).
  const countByCat = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of itemsMatchingSearchAndStatus) {
      counts[item.category_id] = (counts[item.category_id] ?? 0) + 1;
    }
    return counts;
  }, [itemsMatchingSearchAndStatus]);

  // Full filtered list (apply category filter on top of search + status).
  const filteredItems = useMemo(() => {
    if (filterCategory === "all") return itemsMatchingSearchAndStatus;
    return itemsMatchingSearchAndStatus.filter((i) => i.category_id === filterCategory);
  }, [itemsMatchingSearchAndStatus, filterCategory]);

  // Grouped by category, sorted: categories by sort→name, items by name.
  const groupedItems = useMemo(() => {
    const catMap: Record<string, { category: MenuCategory; items: MenuItem[] }> = {};
    for (const item of filteredItems) {
      if (!catMap[item.category_id]) {
        const cat =
          categories.find((c) => c.id === item.category_id) ??
          { id: item.category_id, name: item.category_id, name_alt: null, sort: 999 };
        catMap[item.category_id] = { category: cat, items: [] };
      }
      catMap[item.category_id].items.push(item);
    }
    return Object.values(catMap).sort((a, b) => {
      if (a.category.sort !== b.category.sort) return a.category.sort - b.category.sort;
      return a.category.name.localeCompare(b.category.name);
    });
  }, [filteredItems, categories]);

  // ── Render ───────────────────────────────────────────────────────────────────
  if (loadingBiz) {
    return (
      <div style={{ padding: "40px", color: "var(--db-text-secondary)", fontSize: "14px" }}>
        {tCommon("loading")}
      </div>
    );
  }

  // Tiles config
  const tiles: { key: "all" | "low" | "out"; label: string; value: number; color: string }[] = [
    { key: "all", label: t("inventoryTotalProductsLabel"), value: items.length,  color: "var(--db-text-primary)" },
    { key: "low", label: t("inventoryLowStockBadge"),      value: lowCount,      color: lowCount > 0 ? "var(--db-warning)" : "var(--db-success)" },
    { key: "out", label: t("inventoryOutOfStockLabel"),    value: outCount,      color: outCount > 0 ? "var(--db-danger)"  : "var(--db-success)" },
  ];

  return (
    <div style={{ maxWidth: "960px" }}>
      {/* Page header */}
      <div style={{ marginBottom: "24px" }}>
        <h1
          style={{
            fontSize: "22px",
            fontWeight: 700,
            color: "var(--db-text-primary)",
            marginBottom: "6px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <IconBox size={22} color="var(--db-accent)" />
          {t("railInventario")}
        </h1>
        <p style={{ fontSize: "14px", color: "var(--db-text-secondary)" }}>
          {t("inventorySubtitle")}
        </p>
        {!isSupabaseConfigured && (
          <span
            style={{
              display: "inline-block",
              marginTop: "6px",
              padding: "2px 10px",
              borderRadius: "999px",
              fontSize: "11px",
              fontWeight: 600,
              background: "var(--db-accent-bg)",
              color: "var(--db-accent)",
            }}
          >
            {t("inventoryDemoModeBadge")}
          </span>
        )}
      </div>

      {/* Summary tiles — clickable status filters */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        {tiles.map(({ key, label, value, color }) => {
          const active = filterStatus === key;
          return (
            <button
              key={key}
              onClick={() => setFilterStatus(active ? "all" : key)}
              style={{
                background: "var(--db-bg-surface)",
                border: active ? "2px solid var(--db-accent)" : "1px solid var(--db-border)",
                borderRadius: "var(--db-radius-card)",
                padding: active ? "15px 19px" : "16px 20px",
                cursor: "pointer",
                textAlign: "left",
                width: "100%",
              }}
            >
              <div style={{ fontSize: "12px", color: "var(--db-text-secondary)", marginBottom: "4px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {label}
              </div>
              <div style={{ fontSize: "28px", fontWeight: 700, color }}>
                {value}
              </div>
            </button>
          );
        })}
      </div>

      {/* Feedback banners */}
      {error     && <AlertBanner type="error"   message={error}     />}
      {success   && <AlertBanner type="success" message={success}   />}
      {csvReport && <AlertBanner type="info"    message={csvReport} />}

      {/* ── Manual add product ───────────────────────────────────────────── */}
      <SectionCard>
        <SectionTitle>
          <IconPlus size={16} color="var(--db-accent)" />
          {t("inventoryAddProductSectionTitle")}
        </SectionTitle>
        <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", marginBottom: "14px" }}>
          {t("inventoryAddProductDescription")}
        </p>

        {/* Row 1: Category (required) + Par level (optional) */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr",
            gap: "12px",
            marginBottom: "12px",
          }}
        >
          <div>
            <label style={addLabelStyle}>{t("inventoryCategoryLabel")}</label>
            {creatingCategory ? (
              <div style={{ display: "flex", gap: "6px" }}>
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder={t("inventoryNewCategoryNameLabel")}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button
                  type="button"
                  onClick={() => { setCreatingCategory(false); setNewCategoryName(""); }}
                  style={btnStyle("var(--db-bg-elevated)", "var(--db-text-secondary)")}
                >
                  <IconX size={14} />
                </button>
              </div>
            ) : (
              <select
                value={newCategoryId}
                onChange={(e) => {
                  if (e.target.value === "__new__") {
                    setCreatingCategory(true);
                    setNewCategoryId("");
                  } else {
                    setNewCategoryId(e.target.value);
                  }
                }}
                style={{ ...inputStyle }}
              >
                <option value="">— {t("inventoryCategoryLabel")} —</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {catDisplayName(cat, locale)}
                  </option>
                ))}
                <option value="__new__">{t("inventoryNewCategoryOption")}</option>
              </select>
            )}
          </div>

          <div>
            <label style={addLabelStyle}>{t("inventoryParLevelLabel")}</label>
            <input
              type="number"
              min="0"
              value={newParLevel}
              onChange={(e) => setNewParLevel(e.target.value)}
              placeholder="—"
              style={inputStyle}
            />
          </div>
        </div>

        {/* Row 2: Name + Stock + Threshold + Add button */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 130px 150px auto",
            gap: "12px",
            alignItems: "end",
          }}
        >
          <div>
            <label style={addLabelStyle}>{t("inventoryProductNameLabel")}</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("inventoryProductNamePlaceholderExample")}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={addLabelStyle}>{t("inventoryInitialStockLabel")}</label>
            <input
              type="number"
              min="0"
              value={newStock}
              onChange={(e) => setNewStock(e.target.value)}
              placeholder="0"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={addLabelStyle}>{t("inventoryAlertThresholdLabel")}</label>
            <input
              type="number"
              min="0"
              value={newThreshold}
              onChange={(e) => setNewThreshold(e.target.value)}
              placeholder="5"
              style={inputStyle}
            />
          </div>
          <button
            type="button"
            onClick={() => void addProduct()}
            disabled={adding}
            style={{
              ...btnStyle("var(--db-accent)", "var(--db-accent-text)"),
              padding: "9px 16px",
              opacity: adding ? 0.7 : 1,
              cursor: adding ? "not-allowed" : "pointer",
            }}
          >
            <IconPlus size={14} />
            {adding ? t("employeesAddingState") : t("inventoryAddProductButton")}
          </button>
        </div>
      </SectionCard>

      {/* ── CSV import ───────────────────────────────────────────────────── */}
      <SectionCard>
        <SectionTitle>
          <IconUpload size={16} color="var(--db-accent)" />
          {t("inventoryCsvImportSectionTitle")}
        </SectionTitle>
        <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", marginBottom: "14px" }}>
          {t.rich("inventoryCsvUploadDescription", {
            code: (chunks) => (
              <code style={{ background: "var(--db-bg-elevated)", padding: "1px 5px", borderRadius: "var(--db-radius)" }}>{chunks}</code>
            ),
          })}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <label
            style={{
              ...btnStyle("var(--db-accent)", "var(--db-accent-text)"),
              cursor: importing ? "not-allowed" : "pointer",
              opacity: importing ? 0.7 : 1,
            }}
          >
            <IconUpload size={14} />
            {importing ? t("inventoryImportingState") : t("inventoryChooseCsvButton")}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: "none" }}
              disabled={importing}
              onChange={handleCsvFile}
            />
          </label>
          <span style={{ fontSize: "12px", color: "var(--db-text-tertiary)" }}>
            {t("inventoryCsvClientSideNote")}
          </span>
        </div>

        {/* CSV format example + downloadable template */}
        <div style={{ marginTop: "16px" }}>
          <div
            style={{
              fontSize: "11px",
              fontWeight: 700,
              color: "var(--db-text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: "8px",
            }}
          >
            {t("inventoryExampleLabel")}
          </div>
          <table
            style={{
              borderCollapse: "collapse",
              fontSize: "13px",
              color: "var(--db-text-primary)",
              marginBottom: "12px",
              minWidth: "280px",
            }}
          >
            <thead>
              <tr>
                {["name", "stock"].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: "6px 16px",
                      border: "1px solid var(--db-border)",
                      background: "var(--db-bg-elevated)",
                      fontFamily: "var(--font-mono, monospace)",
                      fontSize: "12px",
                      color: "var(--db-text-secondary)",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["Hamburger", "50"],
                ["French Fries", "30"],
                ["Coca Cola", "100"],
              ].map(([n, s]) => (
                <tr key={n}>
                  <td style={{ padding: "6px 16px", border: "1px solid var(--db-border)" }}>{n}</td>
                  <td style={{ padding: "6px 16px", border: "1px solid var(--db-border)" }}>{s}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            type="button"
            onClick={downloadCsvTemplate}
            style={btnStyle("var(--db-bg-elevated)", "var(--db-text-secondary)")}
          >
            <IconDownload size={14} />
            {t("inventoryDownloadTemplateButton")}
          </button>
        </div>

        <p style={{ fontSize: "11px", color: "var(--db-text-tertiary)", marginTop: "10px", fontStyle: "italic" }}>
          {/* TODO(server/Edge Function): email owner on low stock */}
          {t("inventoryEmailAlertsNote")}
        </p>
      </SectionCard>

      {/* ── Product table ────────────────────────────────────────────────── */}
      <SectionCard>
        <SectionTitle>
          <IconBox size={16} color="var(--db-accent)" />
          {t("inventoryProductsSectionTitle")}
        </SectionTitle>

        {/* Search */}
        <div style={{ position: "relative", marginBottom: "12px" }}>
          <span
            style={{
              position: "absolute",
              left: "10px",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--db-text-tertiary)",
              display: "flex",
              alignItems: "center",
              pointerEvents: "none",
            }}
          >
            <IconSearch size={14} />
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("inventorySearchPlaceholder")}
            style={{ ...inputStyle, paddingLeft: "30px" }}
          />
        </div>

        {/* Category chips (visible once categories are loaded) */}
        {categories.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "16px" }}>
            {/* "All" chip — count reflects current search + status filter */}
            <button
              onClick={() => setFilterCategory("all")}
              style={chipStyle(filterCategory === "all")}
            >
              {t("inventoryFilterAll")} ({itemsMatchingSearchAndStatus.length})
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() =>
                  setFilterCategory(filterCategory === cat.id ? "all" : cat.id)
                }
                style={chipStyle(filterCategory === cat.id)}
              >
                {catDisplayName(cat, locale)} ({countByCat[cat.id] ?? 0})
              </button>
            ))}
          </div>
        )}

        {/* Table header — same 6-column grid as StockRow */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: ROW_GRID,
            gap: "12px",
            padding: "8px 16px",
            fontSize: "11px",
            fontWeight: 700,
            color: "var(--db-text-tertiary)",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            borderBottom: "1px solid var(--db-border)",
            marginBottom: "4px",
          }}
        >
          <span>{t("analyticsProductColumnLabel")}</span>
          <span style={{ textAlign: "right" }}>{t("inventoryStockColumnLabel")}</span>
          <span style={{ textAlign: "right" }}>{t("inventoryParColumnLabel")}</span>
          <span style={{ textAlign: "right" }}>{t("inventoryAlertAtColumnLabel")}</span>
          <span>{t("inventoryReasonColumnLabel")}</span>
          <span style={{ textAlign: "right" }}>{t("chatRoomsColAction")}</span>
        </div>

        {loadingItems ? (
          <div style={{ padding: "32px", textAlign: "center", color: "var(--db-text-secondary)", fontSize: "14px" }}>
            {t("inventoryLoadingProductsState")}
          </div>
        ) : items.length === 0 ? (
          // Truly empty — no products at all
          <div style={{ padding: "32px", textAlign: "center", color: "var(--db-text-secondary)", fontSize: "14px" }}>
            {t("inventoryNoProductsMessage")}
          </div>
        ) : filteredItems.length === 0 ? (
          // Products exist, but none match the active filters
          <div style={{ padding: "32px", textAlign: "center", color: "var(--db-text-secondary)", fontSize: "14px" }}>
            {t("inventoryNoResultsMessage")}
          </div>
        ) : (
          // Grouped list
          groupedItems.map(({ category, items: catItems }) => (
            <div key={category.id}>
              {/* Category section header */}
              <div
                style={{
                  padding: "6px 16px 4px",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "var(--db-text-tertiary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  borderBottom: "1px solid var(--db-border)",
                  marginTop: "8px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                {catDisplayName(category, locale)}
                <span
                  style={{
                    padding: "1px 7px",
                    borderRadius: "999px",
                    background: "var(--db-accent-bg)",
                    color: "var(--db-accent)",
                    fontSize: "10px",
                    fontWeight: 700,
                  }}
                >
                  {catItems.length}
                </span>
              </div>
              {/* Items in this category */}
              {catItems.map((item) => (
                <StockRow
                  key={item.id}
                  item={item}
                  editing={!!editMap[item.id]}
                  editState={
                    editMap[item.id] ?? {
                      stockInput:     String(item.stock_count),
                      thresholdInput: String(item.low_stock_threshold),
                      reasonInput:    "",
                    }
                  }
                  saving={savingId === item.id}
                  onStartEdit={() => startEdit(item)}
                  onCancelEdit={() => cancelEdit(item.id)}
                  onChangeEdit={(patch) => patchEdit(item.id, patch)}
                  onSave={() => void saveEdit(item)}
                />
              ))}
            </div>
          ))
        )}
      </SectionCard>

      {/* ── Movement history ─────────────────────────────────────────────── */}
      <SectionCard>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            userSelect: "none",
          }}
          onClick={() => void toggleHistory()}
        >
          <SectionTitle>
            <IconHistory size={16} color="var(--db-accent)" />
            {t("inventoryMovementHistorySectionTitle")}
            {movements.length > 0 && (
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: "999px",
                  background: "var(--db-accent-bg)",
                  color: "var(--db-accent)",
                }}
              >
                {movements.length}
              </span>
            )}
          </SectionTitle>
          {showHistory ? (
            <IconChevronUp size={18} color="var(--db-text-secondary)" />
          ) : (
            <IconChevronDown size={18} color="var(--db-text-secondary)" />
          )}
        </div>

        {showHistory && (
          <>
            {loadingMovements ? (
              <div style={{ padding: "24px", textAlign: "center", color: "var(--db-text-secondary)", fontSize: "14px" }}>
                {t("inventoryLoadingHistoryState")}
              </div>
            ) : movements.length === 0 ? (
              <div style={{ padding: "24px", textAlign: "center", color: "var(--db-text-secondary)", fontSize: "14px" }}>
                {t("inventoryNoMovementsMessage")}
              </div>
            ) : (
              <>
                {/* History header */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 80px 1fr 130px",
                    gap: "12px",
                    padding: "8px 16px",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "var(--db-text-tertiary)",
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    borderBottom: "1px solid var(--db-border)",
                    marginBottom: "4px",
                  }}
                >
                  <span>{t("analyticsProductColumnLabel")}</span>
                  <span style={{ textAlign: "right" }}>{t("inventoryDeltaColumnLabel")}</span>
                  <span>{t("inventoryReasonColumnLabel")}</span>
                  <span style={{ textAlign: "right" }}>{t("inventoryDateColumnLabel")}</span>
                </div>

                {movements.map((mv) => (
                  <div
                    key={mv.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 80px 1fr 130px",
                      gap: "12px",
                      padding: "10px 16px",
                      fontSize: "13px",
                      borderBottom: "1px solid var(--db-border)",
                      alignItems: "center",
                    }}
                  >
                    <span
                      style={{
                        color: "var(--db-text-primary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {mv.item_name ?? mv.menu_item_id}
                    </span>
                    <span
                      style={{
                        fontWeight: 700,
                        textAlign: "right",
                        color: mv.delta >= 0 ? "var(--db-success)" : "var(--db-danger)",
                      }}
                    >
                      {mv.delta >= 0 ? `+${mv.delta}` : String(mv.delta)}
                    </span>
                    <span style={{ color: "var(--db-text-secondary)" }}>{mv.reason}</span>
                    <span style={{ color: "var(--db-text-tertiary)", textAlign: "right" }}>
                      {formatDatetime(mv.created_at)}
                    </span>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </SectionCard>
    </div>
  );
}
