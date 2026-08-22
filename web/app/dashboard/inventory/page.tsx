/**
 * JChat 3.0 — Dashboard Inventory Management (Task 3.10) — v2
 * Redesigned: flat sortable table, cost/value columns, checkboxes, CSV export.
 *
 * Features:
 *  1. Flat table sortable by ALL columns (click header → asc/desc toggle).
 *  2. Inline stock edit per row — updates menu_items + logs stock_movements.
 *  3. Low-stock threshold editable inline per row.
 *  4. "Hidden" badge when stock_count === 0 (getMenu filters these out).
 *  5. Stock movement history log (collapsible, lazy-loaded).
 *  6. Bulk CSV import.
 *  7. Search + category chips + status tiles (combinable filters).
 *  8. "Add Product" with required category + optional barcode/par (catalog_lookup).
 *  9. Row checkboxes → "Export CSV" panel (column selector + scope, BOM UTF-8).
 * 10. KPIs: total tracked, low stock, out of stock, shelf value.
 * 11. Cost/Value columns from menu_item_costs (owner-only, dashboard-only).
 * 12. Demo mode (isSupabaseConfigured=false) fully supported.
 *
 * Design: var(--db-*) tokens only. No hardcoded hex.
 * Icons: @tabler/icons-react only.
 * Scope: NO location, NO supplier (future phases).
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
  IconBarcode,
  IconSelector,
  IconFileExport,
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

type SortCol = "name" | "category" | "stock" | "threshold" | "par" | "cost" | "value" | "status";
type SortDir = "asc" | "desc";

type ExportCol = "name" | "category" | "stock" | "threshold" | "par" | "cost" | "value" | "status";

// ── Demo data ─────────────────────────────────────────────────────────────────

const DEMO_CATEGORIES: MenuCategory[] = [
  { id: "demo-cat-1", name: "Burgers",  name_alt: "Hamburguesas", sort: 0 },
  { id: "demo-cat-2", name: "Salads",   name_alt: "Ensaladas",    sort: 1 },
  { id: "demo-cat-3", name: "Desserts", name_alt: "Postres",      sort: 2 },
  { id: "demo-cat-4", name: "Drinks",   name_alt: "Bebidas",      sort: 3 },
];

const DEMO_ITEMS: MenuItem[] = [
  { id: "demo-1", business_id: "demo-biz", category_id: "demo-cat-1", name: "Classic Burger",   stock_count: 24, low_stock_threshold: 5,  par_level: 30, is_published: true  },
  { id: "demo-2", business_id: "demo-biz", category_id: "demo-cat-2", name: "Caesar Salad",     stock_count: 3,  low_stock_threshold: 5,  par_level: 10, is_published: true  },
  { id: "demo-3", business_id: "demo-biz", category_id: "demo-cat-3", name: "Margherita Pizza", stock_count: 0,  low_stock_threshold: 5,  par_level: null, is_published: false },
  { id: "demo-4", business_id: "demo-biz", category_id: "demo-cat-3", name: "Chocolate Cake",   stock_count: 8,  low_stock_threshold: 10, par_level: 20, is_published: true  },
  { id: "demo-5", business_id: "demo-biz", category_id: "demo-cat-4", name: "Sparkling Water",  stock_count: 50, low_stock_threshold: 10, par_level: 60, is_published: true  },
];

const DEMO_COSTS: Record<string, number | null> = {
  "demo-1": 350,  // $3.50
  "demo-2": 200,
  "demo-3": null,
  "demo-4": 450,
  "demo-5": 80,
};

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

function formatCents(cents: number | null | undefined, locale: string): string {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

function statusKey(item: MenuItem): "out" | "low" | "ok" {
  if (isOutOfStock(item)) return "out";
  if (isLowStock(item))   return "low";
  return "ok";
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

// ── Export CSV helper ─────────────────────────────────────────────────────────

interface ExportRow {
  name: string;
  category: string;
  stock: number;
  threshold: number;
  par: string;
  cost: string;
  value: string;
  status: string;
}

function buildExportCsv(
  rows: ExportRow[],
  cols: ExportCol[],
  colLabels: Record<ExportCol, string>,
): string {
  const header = cols.map((c) => `"${colLabels[c].replace(/"/g, '""')}"`).join(",");
  const body = rows.map((r) =>
    cols.map((c) => `"${String(r[c]).replace(/"/g, '""')}"`).join(","),
  );
  return "﻿" + [header, ...body].join("\r\n");
}

function downloadBlob(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── SortHeader cell ───────────────────────────────────────────────────────────

function SortTh({
  col,
  active,
  dir,
  onClick,
  children,
  align = "left",
}: {
  col: SortCol;
  active: boolean;
  dir: SortDir;
  onClick: (col: SortCol) => void;
  children: React.ReactNode;
  align?: "left" | "right" | "center";
}) {
  return (
    <th
      onClick={() => onClick(col)}
      style={{
        padding: "9px 12px",
        fontSize: "11px",
        fontWeight: 700,
        color: active ? "var(--db-accent)" : "var(--db-text-tertiary)",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        borderBottom: "1px solid var(--db-border)",
        cursor: "pointer",
        whiteSpace: "nowrap",
        userSelect: "none",
        textAlign: align,
        background: "var(--db-bg-elevated)",
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
        {children}
        {active ? (
          dir === "asc"
            ? <IconChevronUp size={12} />
            : <IconChevronDown size={12} />
        ) : (
          <IconSelector size={11} style={{ opacity: 0.4 }} />
        )}
      </span>
    </th>
  );
}

// ── Export panel ──────────────────────────────────────────────────────────────

const ALL_EXPORT_COLS: ExportCol[] = ["name", "category", "stock", "threshold", "par", "cost", "value", "status"];

function ExportPanel({
  filteredCount,
  selectedCount,
  colLabels,
  onExport,
  onClose,
}: {
  filteredCount: number;
  selectedCount: number;
  colLabels: Record<ExportCol, string>;
  onExport: (cols: ExportCol[], scope: "filtered" | "selected") => void;
  onClose: () => void;
}) {
  const t = useTranslations("dashboardCommon");
  const [cols, setCols]   = useState<Set<ExportCol>>(new Set(ALL_EXPORT_COLS));
  const [scope, setScope] = useState<"filtered" | "selected">(
    selectedCount > 0 ? "selected" : "filtered",
  );

  function toggleCol(c: ExportCol) {
    setCols((prev) => {
      const next = new Set(prev);
      if (next.has(c)) { if (next.size > 1) next.delete(c); }
      else next.add(c);
      return next;
    });
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.35)",
          zIndex: 9998,
        }}
      />
      {/* Panel */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 9999,
          background: "var(--db-bg-surface)",
          border: "1px solid var(--db-border)",
          borderRadius: "var(--db-radius-card)",
          padding: "24px",
          width: "360px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
          <span style={{ fontSize: "15px", fontWeight: 700, color: "var(--db-text-primary)" }}>
            {t("inventoryExportPanelTitle")}
          </span>
          <button onClick={onClose} style={{ ...btnStyle("transparent", "var(--db-text-secondary)"), padding: "4px" }}>
            <IconX size={16} />
          </button>
        </div>

        {/* Column checkboxes */}
        <div style={{ marginBottom: "18px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--db-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>
            {t("inventoryExportColumnsLabel")}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            {ALL_EXPORT_COLS.map((c) => (
              <label
                key={c}
                style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--db-text-primary)", cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  checked={cols.has(c)}
                  onChange={() => toggleCol(c)}
                  style={{ accentColor: "var(--db-accent)" }}
                />
                {colLabels[c]}
              </label>
            ))}
          </div>
        </div>

        {/* Scope */}
        <div style={{ marginBottom: "20px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--db-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>
            {t("inventoryExportScopeLabel")}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--db-text-primary)", cursor: "pointer" }}>
              <input type="radio" name="scope" value="filtered" checked={scope === "filtered"} onChange={() => setScope("filtered")} style={{ accentColor: "var(--db-accent)" }} />
              {t("inventoryScopeAllFiltered", { count: filteredCount })}
            </label>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "13px",
                color: selectedCount === 0 ? "var(--db-text-tertiary)" : "var(--db-text-primary)",
                cursor: selectedCount === 0 ? "not-allowed" : "pointer",
                opacity: selectedCount === 0 ? 0.5 : 1,
              }}
            >
              <input type="radio" name="scope" value="selected" checked={scope === "selected"} onChange={() => setScope("selected")} disabled={selectedCount === 0} style={{ accentColor: "var(--db-accent)" }} />
              {t("inventoryScopeSelected", { count: selectedCount })}
            </label>
          </div>
        </div>

        <button
          onClick={() => onExport(ALL_EXPORT_COLS.filter((c) => cols.has(c)), scope)}
          style={{ ...btnStyle("var(--db-accent)", "var(--db-accent-text)"), width: "100%", justifyContent: "center", padding: "10px" }}
        >
          <IconDownload size={14} />
          {t("inventoryExportButton")}
        </button>
      </div>
    </>
  );
}

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

  // Cost map: menu_item_id → cost_cents | null
  const [costMap, setCostMap] = useState<Record<string, number | null>>({});

  const [movements, setMovements]               = useState<StockMovement[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [showHistory, setShowHistory]           = useState(false);

  // Inline edit: map of item.id → EditState
  const [editMap, setEditMap]   = useState<Record<string, EditState>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  // "Add Product" form fields
  const [newBarcode, setNewBarcode]             = useState("");
  const [lookingUp, setLookingUp]               = useState(false);
  const [catalogHint, setCatalogHint]           = useState<{ found: boolean; text: string } | null>(null);
  const [newName, setNewName]                   = useState("");
  const [newStock, setNewStock]                 = useState("");
  const [newThreshold, setNewThreshold]         = useState("");
  const [newCategoryId, setNewCategoryId]       = useState("");
  const [newCategoryName, setNewCategoryName]   = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newParLevel, setNewParLevel]           = useState("");
  const [adding, setAdding]                     = useState(false);

  // CSV import
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [csvReport, setCsvReport] = useState<string | null>(null);

  // Feedback
  const [error, setError]     = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Filters (combinable)
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus]     = useState<"all" | "low" | "out">("all");
  const [search, setSearch]                 = useState("");

  // Sortable table
  const [sortCol, setSortCol] = useState<SortCol>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Checkboxes
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Export panel
  const [showExport, setShowExport] = useState(false);

  // ── Resolve business id ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoadingBiz(false);
      setCategories(DEMO_CATEGORIES);
      setItems(DEMO_ITEMS);
      setCostMap(DEMO_COSTS);
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

  // ── Load costs (menu_item_costs — owner-only, dashboard-only) ────────────────
  const loadCosts = useCallback(async (bizId: string) => {
    try {
      const { data } = await supabase
        .from("menu_item_costs")
        .select("menu_item_id, cost_cents")
        .eq("business_id", bizId);
      const map: Record<string, number | null> = {};
      for (const row of (data ?? []) as { menu_item_id: string; cost_cents: number | null }[]) {
        map[row.menu_item_id] = row.cost_cents;
      }
      setCostMap(map);
    } catch {
      // non-fatal — cost/value columns show "—"
    }
  }, []);

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
      void loadCosts(businessId);
    }
  }, [businessId, loadItems, loadCategories, loadCosts]);

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

  // ── Barcode catalog lookup ───────────────────────────────────────────────────
  async function lookupBarcode() {
    const code = newBarcode.trim();
    if (!code) return;

    if (!isSupabaseConfigured) {
      setCatalogHint({ found: false, text: t("inventoryCatalogNotFoundHint") });
      return;
    }

    setLookingUp(true);
    setCatalogHint(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc("catalog_lookup", { p_barcode: code });
      if (rpcErr) throw rpcErr;

      const row = (data as {
        barcode: string | null;
        brand: string | null;
        name: string | null;
        size_value: number | null;
        size_unit: string | null;
        packaging: string | null;
        category: string | null;
        subcategory: string | null;
        image_url: string | null;
      }[] | null)?.[0];

      if (!row) {
        setCatalogHint({ found: false, text: t("inventoryCatalogNotFoundHint") });
        return;
      }

      const parts: string[] = [];
      if (row.brand)      parts.push(row.brand);
      if (row.name)       parts.push(row.name);
      if (row.size_value != null && row.size_unit) parts.push(`${row.size_value} ${row.size_unit}`);
      else if (row.packaging) parts.push(row.packaging);
      const composed = parts.join(" ").replace(/\s{2,}/g, " ").trim();
      if (composed) setNewName(composed);

      const hintParts: string[] = [];
      if (row.brand)      hintParts.push(row.brand);
      if (row.size_value != null && row.size_unit) hintParts.push(`${row.size_value} ${row.size_unit}`);
      else if (row.packaging) hintParts.push(row.packaging);
      if (row.category)   hintParts.push(row.category);
      const hintDetail = hintParts.join(" · ");
      setCatalogHint({
        found: true,
        text: `${t("inventoryCatalogFoundHint")}${hintDetail ? ": " + hintDetail : ""}`,
      });
    } catch {
      setCatalogHint({ found: false, text: t("inventoryCatalogNotFoundHint") });
    } finally {
      setLookingUp(false);
    }
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
      setNewBarcode(""); setCatalogHint(null);
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
          barcode:             newBarcode.trim() || null,
          price_cents:         0,
        })
        .select("id, business_id, category_id, name, stock_count, low_stock_threshold, par_level, is_published")
        .single();
      if (insErr || !inserted) throw new Error(insErr?.message ?? t("inventoryAddProductGenericError"));

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
      setNewBarcode(""); setCatalogHint(null);
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
    downloadBlob(csv, "inventory_template.csv");
  }

  // ── Sort handler ─────────────────────────────────────────────────────────────
  function handleSort(col: SortCol) {
    if (col === sortCol) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  // ── Checkbox handlers ────────────────────────────────────────────────────────
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll(visibleIds: string[]) {
    const allSelected = visibleIds.every((id) => selectedIds.has(id)) && visibleIds.length > 0;
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.add(id));
        return next;
      });
    }
  }

  // ── Derived stats ────────────────────────────────────────────────────────────
  const lowCount = items.filter((i) => isLowStock(i)).length;
  const outCount = items.filter((i) => isOutOfStock(i)).length;

  const shelfValueCents = useMemo(() =>
    items.reduce((acc, i) => {
      const c = costMap[i.id];
      return c != null ? acc + i.stock_count * c : acc;
    }, 0),
  [items, costMap]);

  // Items matching search + status, WITHOUT category filter.
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

  // Full filtered list (apply category filter).
  const filteredItems = useMemo(() => {
    if (filterCategory === "all") return itemsMatchingSearchAndStatus;
    return itemsMatchingSearchAndStatus.filter((i) => i.category_id === filterCategory);
  }, [itemsMatchingSearchAndStatus, filterCategory]);

  // Sorted flat list
  const sortedItems = useMemo(() => {
    const catName = (item: MenuItem) => {
      const cat = categories.find((c) => c.id === item.category_id);
      return cat ? catDisplayName(cat, locale) : "";
    };

    return [...filteredItems].sort((a, b) => {
      let valA: string | number;
      let valB: string | number;

      switch (sortCol) {
        case "name":      valA = a.name.toLowerCase();     valB = b.name.toLowerCase();     break;
        case "category":  valA = catName(a).toLowerCase(); valB = catName(b).toLowerCase(); break;
        case "stock":     valA = a.stock_count;            valB = b.stock_count;            break;
        case "threshold": valA = a.low_stock_threshold;    valB = b.low_stock_threshold;    break;
        case "par":       valA = a.par_level ?? -1;        valB = b.par_level ?? -1;        break;
        case "cost":      valA = costMap[a.id] ?? -1;      valB = costMap[b.id] ?? -1;      break;
        case "value":     valA = a.stock_count * (costMap[a.id] ?? -1); valB = b.stock_count * (costMap[b.id] ?? -1); break;
        case "status": {
          const order = { out: 0, low: 1, ok: 2 };
          valA = order[statusKey(a)]; valB = order[statusKey(b)]; break;
        }
        default: valA = a.name.toLowerCase(); valB = b.name.toLowerCase();
      }

      if (valA < valB) return sortDir === "asc" ? -1 : 1;
      if (valA > valB) return sortDir === "asc" ?  1 : -1;
      return 0;
    });
  }, [filteredItems, sortCol, sortDir, categories, locale, costMap]);

  const visibleIds = useMemo(() => sortedItems.map((i) => i.id), [sortedItems]);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someSelected = visibleIds.some((id) => selectedIds.has(id));

  // ── Column labels (used for table headers and export panel) ─────────────────
  const colLabels: Record<ExportCol, string> = {
    name:      t("analyticsProductColumnLabel"),
    category:  t("inventoryCategoryLabel"),
    stock:     t("inventoryStockColumnLabel"),
    threshold: t("inventoryAlertAtColumnLabel"),
    par:       t("inventoryParColumnLabel"),
    cost:      t("inventoryCostColumnLabel"),
    value:     t("inventoryValueColumnLabel"),
    status:    t("inventoryStatusColumnLabel"),
  };

  // ── Export handler ───────────────────────────────────────────────────────────
  function handleExport(cols: ExportCol[], scope: "filtered" | "selected") {
    const statusLabel = (item: MenuItem) => {
      const sk = statusKey(item);
      if (sk === "out") return t("inventoryOutOfStockLabel");
      if (sk === "low") return t("inventoryLowStockBadge");
      return t("inventoryStatusOk");
    };

    const sourceItems = scope === "selected"
      ? sortedItems.filter((i) => selectedIds.has(i.id))
      : sortedItems;

    const catName = (item: MenuItem) => {
      const cat = categories.find((c) => c.id === item.category_id);
      return cat ? catDisplayName(cat, locale) : "";
    };

    const rows: ExportRow[] = sourceItems.map((item) => ({
      name:      item.name,
      category:  catName(item),
      stock:     item.stock_count,
      threshold: item.low_stock_threshold,
      par:       item.par_level != null ? String(item.par_level) : "",
      cost:      formatCents(costMap[item.id], locale),
      value:     formatCents(item.stock_count * (costMap[item.id] ?? 0) || (costMap[item.id] == null ? null : 0), locale),
      status:    statusLabel(item),
    }));

    const today = new Date().toISOString().slice(0, 10);
    const csv = buildExportCsv(rows, cols, colLabels);
    downloadBlob(csv, `inventario_${today}.csv`);
    setShowExport(false);
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  if (loadingBiz) {
    return (
      <div style={{ padding: "40px", color: "var(--db-text-secondary)", fontSize: "14px" }}>
        {tCommon("loading")}
      </div>
    );
  }

  // Status badge cell
  const StatusBadge = ({ item }: { item: MenuItem }) => {
    const sk = statusKey(item);
    if (sk === "out") return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "999px", fontSize: "10px", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", background: "rgba(239,68,68,0.15)", color: "var(--db-danger)", whiteSpace: "nowrap" }}>
        <IconEyeOff size={10} />{t("hiddenBadge")}
      </span>
    );
    if (sk === "low") return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "999px", fontSize: "10px", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", background: "rgba(245,158,11,0.15)", color: "var(--db-warning)", whiteSpace: "nowrap" }}>
        <IconAlertTriangle size={10} />{t("inventoryLowStockBadge")}
      </span>
    );
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "999px", fontSize: "10px", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", background: "rgba(34,197,94,0.12)", color: "var(--db-success)", whiteSpace: "nowrap" }}>
        <IconCheck size={10} />{t("inventoryStatusOk")}
      </span>
    );
  };

  // Tiles config (4 tiles)
  const tiles: { key: "all" | "low" | "out"; label: string; value: string; color: string }[] = [
    { key: "all", label: t("inventoryTotalProductsLabel"), value: String(items.length),                color: "var(--db-text-primary)" },
    { key: "low", label: t("inventoryLowStockBadge"),      value: String(lowCount),                    color: lowCount > 0 ? "var(--db-warning)" : "var(--db-success)" },
    { key: "out", label: t("inventoryOutOfStockLabel"),    value: String(outCount),                    color: outCount > 0 ? "var(--db-danger)"  : "var(--db-success)" },
  ];

  const shelfTile = {
    label: t("inventoryShelfValueLabel"),
    value: shelfValueCents > 0 ? `$${formatCents(shelfValueCents, locale)}` : "—",
    color: "var(--db-text-primary)",
  };

  const thStyle: React.CSSProperties = {
    padding: "9px 12px",
    fontSize: "11px",
    fontWeight: 700,
    color: "var(--db-text-tertiary)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    borderBottom: "1px solid var(--db-border)",
    whiteSpace: "nowrap",
    background: "var(--db-bg-elevated)",
  };

  const tdStyle: React.CSSProperties = {
    padding: "10px 12px",
    fontSize: "13px",
    color: "var(--db-text-primary)",
    borderBottom: "1px solid var(--db-border)",
    verticalAlign: "middle",
  };

  return (
    <div style={{ maxWidth: "1100px" }}>
      {/* Export panel overlay */}
      {showExport && (
        <ExportPanel
          filteredCount={sortedItems.length}
          selectedCount={selectedIds.size}
          colLabels={colLabels}
          onExport={handleExport}
          onClose={() => setShowExport(false)}
        />
      )}

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

      {/* Summary tiles — 3 status tiles + 1 shelf-value tile */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
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
        {/* Shelf value tile — not a filter */}
        <div
          style={{
            background: "var(--db-bg-surface)",
            border: "1px solid var(--db-border)",
            borderRadius: "var(--db-radius-card)",
            padding: "16px 20px",
          }}
        >
          <div style={{ fontSize: "12px", color: "var(--db-text-secondary)", marginBottom: "4px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            {shelfTile.label}
          </div>
          <div style={{ fontSize: "28px", fontWeight: 700, color: shelfTile.color }}>
            {shelfTile.value}
          </div>
        </div>
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

        {/* Row 0: Barcode */}
        <div style={{ marginBottom: "12px" }}>
          <label style={addLabelStyle}>
            <IconBarcode size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: "4px" }} />
            {t("inventoryBarcodeLabel")}
          </label>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type="text"
              value={newBarcode}
              onChange={(e) => { setNewBarcode(e.target.value); setCatalogHint(null); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); void lookupBarcode(); }
              }}
              placeholder="0 000000 000000"
              style={{ ...inputStyle, flex: 1, fontFamily: "var(--font-mono, monospace)", letterSpacing: "0.04em" }}
            />
            <button
              type="button"
              onClick={() => void lookupBarcode()}
              disabled={lookingUp || !newBarcode.trim()}
              style={{
                ...btnStyle("var(--db-bg-elevated)", "var(--db-text-secondary)"),
                opacity: lookingUp || !newBarcode.trim() ? 0.5 : 1,
                cursor:  lookingUp || !newBarcode.trim() ? "not-allowed" : "pointer",
              }}
            >
              <IconSearch size={14} />
              {lookingUp ? "…" : t("inventoryBarcodeSearchButton")}
            </button>
          </div>
          {catalogHint && (
            <div style={{ marginTop: "6px", fontSize: "12px", color: catalogHint.found ? "var(--db-success)" : "var(--db-text-tertiary)", display: "flex", alignItems: "center", gap: "5px" }}>
              {catalogHint.found ? <IconCheck size={12} /> : <IconAlertCircle size={12} />}
              {catalogHint.text}
            </div>
          )}
        </div>

        {/* Row 1: Category + Par */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "12px", marginBottom: "12px" }}>
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

        {/* Row 2: Name + Stock + Threshold + Add */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 150px auto", gap: "12px", alignItems: "end" }}>
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

        <div style={{ marginTop: "16px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--db-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
            {t("inventoryExampleLabel")}
          </div>
          <table style={{ borderCollapse: "collapse", fontSize: "13px", color: "var(--db-text-primary)", marginBottom: "12px", minWidth: "280px" }}>
            <thead>
              <tr>
                {["name", "stock"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "6px 16px", border: "1px solid var(--db-border)", background: "var(--db-bg-elevated)", fontFamily: "var(--font-mono, monospace)", fontSize: "12px", color: "var(--db-text-secondary)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[["Hamburger", "50"], ["French Fries", "30"], ["Coca Cola", "100"]].map(([n, s]) => (
                <tr key={n}>
                  <td style={{ padding: "6px 16px", border: "1px solid var(--db-border)" }}>{n}</td>
                  <td style={{ padding: "6px 16px", border: "1px solid var(--db-border)" }}>{s}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" onClick={downloadCsvTemplate} style={btnStyle("var(--db-bg-elevated)", "var(--db-text-secondary)")}>
            <IconDownload size={14} />
            {t("inventoryDownloadTemplateButton")}
          </button>
        </div>

        <p style={{ fontSize: "11px", color: "var(--db-text-tertiary)", marginTop: "10px", fontStyle: "italic" }}>
          {t("inventoryEmailAlertsNote")}
        </p>
      </SectionCard>

      {/* ── Product table ────────────────────────────────────────────────── */}
      <SectionCard>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <SectionTitle>
            <IconBox size={16} color="var(--db-accent)" />
            {t("inventoryProductsSectionTitle")}
          </SectionTitle>
          <button
            onClick={() => setShowExport(true)}
            style={btnStyle("var(--db-bg-elevated)", "var(--db-text-secondary)")}
          >
            <IconFileExport size={14} />
            {t("inventoryExportCsvButton")}
          </button>
        </div>

        {/* Search */}
        <div style={{ position: "relative", marginBottom: "12px" }}>
          <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--db-text-tertiary)", display: "flex", alignItems: "center", pointerEvents: "none" }}>
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

        {/* Category chips */}
        {categories.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "16px" }}>
            <button onClick={() => setFilterCategory("all")} style={chipStyle(filterCategory === "all")}>
              {t("inventoryFilterAll")} ({itemsMatchingSearchAndStatus.length})
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setFilterCategory(filterCategory === cat.id ? "all" : cat.id)}
                style={chipStyle(filterCategory === cat.id)}
              >
                {catDisplayName(cat, locale)} ({countByCat[cat.id] ?? 0})
              </button>
            ))}
          </div>
        )}

        {/* Selection action bar */}
        {selectedIds.size > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 14px", borderRadius: "var(--db-radius)", background: "color-mix(in srgb, var(--db-accent) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--db-accent) 30%, transparent)", marginBottom: "12px" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--db-accent)" }}>
              {t("inventorySelectionBarLabel", { count: selectedIds.size })}
            </span>
            <button onClick={() => setShowExport(true)} style={btnStyle("var(--db-accent)", "var(--db-accent-text)")}>
              <IconFileExport size={13} />
              {t("inventoryExportCsvButton")}
            </button>
            <button onClick={() => setSelectedIds(new Set())} style={{ ...btnStyle("transparent", "var(--db-text-secondary)"), marginLeft: "auto" }}>
              <IconX size={13} />
            </button>
          </div>
        )}

        {loadingItems ? (
          <div style={{ padding: "32px", textAlign: "center", color: "var(--db-text-secondary)", fontSize: "14px" }}>
            {t("inventoryLoadingProductsState")}
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: "32px", textAlign: "center", color: "var(--db-text-secondary)", fontSize: "14px" }}>
            {t("inventoryNoProductsMessage")}
          </div>
        ) : filteredItems.length === 0 ? (
          <div style={{ padding: "32px", textAlign: "center", color: "var(--db-text-secondary)", fontSize: "14px" }}>
            {t("inventoryNoResultsMessage")}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "auto" }}>
              <thead>
                <tr>
                  {/* Checkbox master */}
                  <th style={{ ...thStyle, width: "36px", textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                      onChange={() => toggleSelectAll(visibleIds)}
                      style={{ accentColor: "var(--db-accent)", cursor: "pointer" }}
                    />
                  </th>
                  <SortTh col="name"      active={sortCol === "name"}      dir={sortDir} onClick={handleSort} align="left">
                    {colLabels.name}
                  </SortTh>
                  <SortTh col="category"  active={sortCol === "category"}  dir={sortDir} onClick={handleSort} align="left">
                    {colLabels.category}
                  </SortTh>
                  <SortTh col="stock"     active={sortCol === "stock"}     dir={sortDir} onClick={handleSort} align="right">
                    {colLabels.stock}
                  </SortTh>
                  <SortTh col="threshold" active={sortCol === "threshold"} dir={sortDir} onClick={handleSort} align="right">
                    {colLabels.threshold}
                  </SortTh>
                  <SortTh col="par"       active={sortCol === "par"}       dir={sortDir} onClick={handleSort} align="right">
                    {colLabels.par}
                  </SortTh>
                  <SortTh col="cost"      active={sortCol === "cost"}      dir={sortDir} onClick={handleSort} align="right">
                    {colLabels.cost}
                  </SortTh>
                  <SortTh col="value"     active={sortCol === "value"}     dir={sortDir} onClick={handleSort} align="right">
                    {colLabels.value}
                  </SortTh>
                  <SortTh col="status"    active={sortCol === "status"}    dir={sortDir} onClick={handleSort} align="center">
                    {colLabels.status}
                  </SortTh>
                  {/* Actions — not sortable */}
                  <th style={{ ...thStyle, textAlign: "right" }}>{t("chatRoomsColAction")}</th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((item) => {
                  const editing = !!editMap[item.id];
                  const saving  = savingId === item.id;
                  const es      = editMap[item.id] ?? { stockInput: String(item.stock_count), thresholdInput: String(item.low_stock_threshold), reasonInput: "" };
                  const sk      = statusKey(item);
                  const rowBg   = sk === "out" ? "rgba(239,68,68,0.05)" : sk === "low" ? "rgba(245,158,11,0.05)" : "transparent";
                  const catObj  = categories.find((c) => c.id === item.category_id);
                  const costVal = costMap[item.id] ?? null;
                  const valueVal = costVal != null ? item.stock_count * costVal : null;

                  return (
                    <tr key={item.id} style={{ background: rowBg }}>
                      {/* Checkbox */}
                      <td style={{ ...tdStyle, textAlign: "center", width: "36px" }}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={() => toggleSelect(item.id)}
                          style={{ accentColor: "var(--db-accent)", cursor: "pointer" }}
                        />
                      </td>

                      {/* Name */}
                      <td style={{ ...tdStyle, fontWeight: 500, minWidth: "120px" }}>
                        {item.name}
                      </td>

                      {/* Category */}
                      <td style={{ ...tdStyle, color: "var(--db-text-secondary)", minWidth: "80px" }}>
                        {catObj ? catDisplayName(catObj, locale) : "—"}
                      </td>

                      {/* Stock — editable */}
                      <td style={{ ...tdStyle, textAlign: "right", width: "100px" }}>
                        {editing ? (
                          <input
                            type="number"
                            min="0"
                            value={es.stockInput}
                            onChange={(e) => patchEdit(item.id, { stockInput: e.target.value })}
                            style={{ ...inputStyle, width: "80px", textAlign: "right" }}
                            autoFocus
                          />
                        ) : (
                          <span style={{ fontWeight: 600, color: sk === "out" ? "var(--db-danger)" : sk === "low" ? "var(--db-warning)" : "var(--db-text-primary)" }}>
                            {item.stock_count}
                          </span>
                        )}
                      </td>

                      {/* Threshold — editable */}
                      <td style={{ ...tdStyle, textAlign: "right", width: "100px" }}>
                        {editing ? (
                          <input
                            type="number"
                            min="0"
                            value={es.thresholdInput}
                            onChange={(e) => patchEdit(item.id, { thresholdInput: e.target.value })}
                            style={{ ...inputStyle, width: "80px", textAlign: "right" }}
                            placeholder={t("inventoryThresholdPlaceholder")}
                          />
                        ) : (
                          <span style={{ color: "var(--db-text-secondary)" }}>
                            {item.low_stock_threshold}
                          </span>
                        )}
                      </td>

                      {/* Par — read-only */}
                      <td style={{ ...tdStyle, textAlign: "right", color: "var(--db-text-secondary)" }}>
                        {item.par_level != null ? item.par_level : "—"}
                      </td>

                      {/* Cost — read-only */}
                      <td style={{ ...tdStyle, textAlign: "right", color: "var(--db-text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                        {formatCents(costVal, locale)}
                      </td>

                      {/* Value — derived, read-only */}
                      <td style={{ ...tdStyle, textAlign: "right", color: "var(--db-text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                        {formatCents(valueVal, locale)}
                      </td>

                      {/* Status badge */}
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <StatusBadge item={item} />
                      </td>

                      {/* Actions */}
                      <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>
                        {editing ? (
                          <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", alignItems: "center" }}>
                            {/* Reason input inline */}
                            <input
                              type="text"
                              value={es.reasonInput}
                              onChange={(e) => patchEdit(item.id, { reasonInput: e.target.value })}
                              style={{ ...inputStyle, width: "130px" }}
                              placeholder={t("inventoryReasonOptionalPlaceholder")}
                            />
                            <button
                              onClick={() => void saveEdit(item)}
                              disabled={saving}
                              style={{ ...btnStyle("var(--db-accent)", "var(--db-accent-text)"), minWidth: "32px" }}
                            >
                              {saving ? "…" : <IconCheck size={14} />}
                            </button>
                            <button
                              onClick={() => cancelEdit(item.id)}
                              disabled={saving}
                              style={btnStyle("var(--db-bg-elevated)", "var(--db-text-secondary)")}
                            >
                              <IconX size={14} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEdit(item)}
                            style={btnStyle("var(--db-bg-elevated)", "var(--db-text-secondary)")}
                            title={t("inventoryEditStockTitle")}
                          >
                            <IconEdit size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ── Movement history ─────────────────────────────────────────────── */}
      <SectionCard>
        <div
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}
          onClick={() => void toggleHistory()}
        >
          <SectionTitle>
            <IconHistory size={16} color="var(--db-accent)" />
            {t("inventoryMovementHistorySectionTitle")}
            {movements.length > 0 && (
              <span style={{ fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "999px", background: "var(--db-accent-bg)", color: "var(--db-accent)" }}>
                {movements.length}
              </span>
            )}
          </SectionTitle>
          {showHistory
            ? <IconChevronUp size={18} color="var(--db-text-secondary)" />
            : <IconChevronDown size={18} color="var(--db-text-secondary)" />}
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
                <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 1fr 130px", gap: "12px", padding: "8px 16px", fontSize: "11px", fontWeight: 700, color: "var(--db-text-tertiary)", letterSpacing: "0.05em", textTransform: "uppercase", borderBottom: "1px solid var(--db-border)", marginBottom: "4px" }}>
                  <span>{t("analyticsProductColumnLabel")}</span>
                  <span style={{ textAlign: "right" }}>{t("inventoryDeltaColumnLabel")}</span>
                  <span>{t("inventoryReasonColumnLabel")}</span>
                  <span style={{ textAlign: "right" }}>{t("inventoryDateColumnLabel")}</span>
                </div>
                {movements.map((mv) => (
                  <div
                    key={mv.id}
                    style={{ display: "grid", gridTemplateColumns: "1fr 80px 1fr 130px", gap: "12px", padding: "10px 16px", fontSize: "13px", borderBottom: "1px solid var(--db-border)", alignItems: "center" }}
                  >
                    <span style={{ color: "var(--db-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {mv.item_name ?? mv.menu_item_id}
                    </span>
                    <span style={{ fontWeight: 700, textAlign: "right", color: mv.delta >= 0 ? "var(--db-success)" : "var(--db-danger)" }}>
                      {mv.delta >= 0 ? `+${mv.delta}` : String(mv.delta)}
                    </span>
                    <span style={{ color: "var(--db-text-secondary)" }}>{mv.reason}</span>
                    <span style={{ color: "var(--db-text-tertiary)", textAlign: "right" }}>{formatDatetime(mv.created_at)}</span>
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
