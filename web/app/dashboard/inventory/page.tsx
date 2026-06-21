/**
 * JChat 3.0 — Dashboard Inventory Management (Task 3.10)
 *
 * Features:
 *  1. Product list — current stock count from `menu_items.stock_count`.
 *  2. Inline stock edit — updates `menu_items.stock_count` and logs a
 *     `stock_movements` row (delta + reason).
 *  3. Low-stock threshold — editable per product (`low_stock_threshold`,
 *     default 5); rows at/below threshold are highlighted.
 *  4. "Hidden" badge when stock_count === 0 (getMenu already filters these out).
 *  5. Stock movement history log — reads `stock_movements`, newest first.
 *  6. Bulk CSV import — client-side parse of name/sku/stock columns;
 *     updates counts for matching products and logs movements.
 *
 * TODO(server/Edge Function): email owner on low stock — stub is at the bottom.
 *
 * Design: var(--db-*) tokens only. No hardcoded hex.
 * Icons: @tabler/icons-react only.
 * Guard: isSupabaseConfigured before any live Supabase call.
 */

"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
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
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// ── Types ────────────────────────────────────────────────────────────────────

interface MenuItem {
  id: string;
  business_id: string;
  name: string;
  stock_count: number;
  low_stock_threshold: number;
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

const DEMO_ITEMS: MenuItem[] = [
  { id: "demo-1", business_id: "demo-biz", name: "Classic Burger",   stock_count: 24, low_stock_threshold: 5,  is_published: true  },
  { id: "demo-2", business_id: "demo-biz", name: "Caesar Salad",     stock_count: 3,  low_stock_threshold: 5,  is_published: true  },
  { id: "demo-3", business_id: "demo-biz", name: "Margherita Pizza", stock_count: 0,  low_stock_threshold: 5,  is_published: false },
  { id: "demo-4", business_id: "demo-biz", name: "Chocolate Cake",   stock_count: 8,  low_stock_threshold: 10, is_published: true  },
  { id: "demo-5", business_id: "demo-biz", name: "Sparkling Water",  stock_count: 50, low_stock_threshold: 10, is_published: true  },
];

const DEMO_MOVEMENTS: StockMovement[] = [
  { id: "mv-1", menu_item_id: "demo-2", business_id: "demo-biz", delta: -2,  reason: "Sold",           created_at: new Date(Date.now() - 3_600_000).toISOString(),  item_name: "Caesar Salad"     },
  { id: "mv-2", menu_item_id: "demo-3", business_id: "demo-biz", delta: -5,  reason: "Sold",           created_at: new Date(Date.now() - 7_200_000).toISOString(),  item_name: "Margherita Pizza" },
  { id: "mv-3", menu_item_id: "demo-1", business_id: "demo-biz", delta: +20, reason: "Restock",        created_at: new Date(Date.now() - 86_400_000).toISOString(), item_name: "Classic Burger"   },
  { id: "mv-4", menu_item_id: "demo-4", business_id: "demo-biz", delta: +15, reason: "CSV import",     created_at: new Date(Date.now() - 172_800_000).toISOString(), item_name: "Chocolate Cake"  },
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

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--db-bg-surface)",
        border: "1px solid var(--db-border)",
        borderRadius: "12px",
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
        borderRadius: "8px",
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
        gridTemplateColumns: "1fr 110px 130px 130px 120px",
        alignItems: "center",
        gap: "12px",
        padding: "12px 16px",
        borderRadius: "8px",
        background: rowBg,
        borderBottom: "1px solid var(--db-border)",
      }}
    >
      {/* Name + badges */}
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
            Hidden
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
            Low Stock
          </span>
        )}
      </div>

      {/* Stock count / input */}
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

      {/* Threshold / input */}
      {editing ? (
        <input
          type="number"
          min="0"
          value={editState.thresholdInput}
          onChange={(e) => onChangeEdit({ thresholdInput: e.target.value })}
          style={inputStyle}
          placeholder="threshold"
        />
      ) : (
        <span style={{ fontSize: "13px", color: "var(--db-text-secondary)", textAlign: "right" }}>
          {item.low_stock_threshold}
        </span>
      )}

      {/* Reason (edit only) */}
      {editing ? (
        <input
          type="text"
          value={editState.reasonInput}
          onChange={(e) => onChangeEdit({ reasonInput: e.target.value })}
          style={inputStyle}
          placeholder="reason (optional)"
        />
      ) : (
        <span />
      )}

      {/* Actions */}
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
            title="Edit stock"
          >
            <IconEdit size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 10px",
  borderRadius: "6px",
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
    borderRadius: "6px",
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

// ── CSV import helpers ────────────────────────────────────────────────────────

interface CsvRow {
  name: string;
  stock: number;
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  // Detect header indices (case-insensitive)
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
//   // Call a Supabase Edge Function like:
//   //   await supabase.functions.invoke('notify-low-stock', {
//   //     body: { business_id: _businessId, items: _items.map(i => ({ id: i.id, name: i.name, stock_count: i.stock_count })) },
//   //   });
// }

// ── Main page ─────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [loadingBiz, setLoadingBiz] = useState(true);

  const [items, setItems] = useState<MenuItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Inline edit: map of item.id → EditState
  const [editMap, setEditMap] = useState<Record<string, EditState>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  // Manual "Add Product" form
  const [newName, setNewName] = useState("");
  const [newStock, setNewStock] = useState("");
  const [newThreshold, setNewThreshold] = useState("");
  const [adding, setAdding] = useState(false);

  // CSV import
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [csvReport, setCsvReport] = useState<string | null>(null);

  // Feedback
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // ── Resolve business id ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoadingBiz(false);
      // Use demo data
      setItems(DEMO_ITEMS);
      setMovements(DEMO_MOVEMENTS);
      return;
    }
    void (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoadingBiz(false); return; }
        // An owner may have more than one business — pick the most recent.
        // (.single() errors when >1 row, breaking inventory for multi-business owners.)
        const { data: biz } = await supabase
          .from("businesses")
          .select("id")
          .eq("owner_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (biz) setBusinessId(biz.id as string);
      } catch {
        // silently fall through — live data won't load but demo is fine
      } finally {
        setLoadingBiz(false);
      }
    })();
  }, []);

  // ── Load menu items ──────────────────────────────────────────────────────────
  const loadItems = useCallback(async (bizId: string) => {
    setLoadingItems(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("menu_items")
        .select("id, business_id, name, stock_count, low_stock_threshold, is_published")
        .eq("business_id", bizId)
        .order("name", { ascending: true });
      if (err) throw err;
      setItems((data as MenuItem[]) ?? []);
    } catch (e: unknown) {
      setError(`Failed to load products: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoadingItems(false);
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
      setError(`Failed to load history: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoadingMovements(false);
    }
  }, [items]);

  useEffect(() => {
    if (businessId) {
      void loadItems(businessId);
    }
  }, [businessId, loadItems]);

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

    const newStock     = parseInt(state.stockInput, 10);
    const newThreshold = parseInt(state.thresholdInput, 10);

    if (isNaN(newStock) || newStock < 0) {
      setError("Stock count must be a non-negative number.");
      return;
    }
    if (isNaN(newThreshold) || newThreshold < 0) {
      setError("Low-stock threshold must be a non-negative number.");
      return;
    }

    const delta  = newStock - item.stock_count;
    const reason = state.reasonInput.trim() || (delta >= 0 ? "Manual adjustment" : "Manual deduction");

    if (!isSupabaseConfigured) {
      // Demo mode: update local state only
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? { ...i, stock_count: newStock, low_stock_threshold: newThreshold }
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
      setSuccess(`Stock updated for "${item.name}" (demo mode).`);
      return;
    }

    setSavingId(item.id);
    setError(null);
    setSuccess(null);
    try {
      // 1. Update menu_items
      const { error: upErr } = await supabase
        .from("menu_items")
        .update({ stock_count: newStock, low_stock_threshold: newThreshold })
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
      // if (newStock <= newThreshold && newThreshold > 0 && newStock > 0 && businessId) {
      //   await notifyOwnerLowStock(businessId, [{ ...item, stock_count: newStock }]);
      // }

      // 3. Refresh local state
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? { ...i, stock_count: newStock, low_stock_threshold: newThreshold }
            : i
        )
      );
      cancelEdit(item.id);
      setSuccess(`Stock updated for "${item.name}".`);
      // Refresh movements if history panel is open
      if (showHistory && businessId) void loadMovements(businessId);
    } catch (e: unknown) {
      setError(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
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
        setError("CSV parse failed. Expected columns: name, stock (or stock_count).");
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
          // Demo: update local state
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
                reason:       "CSV import",
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
            reason:       "CSV import",
          });
        }

        // TODO(server/Edge Function): email owner on low stock after CSV import
        // if (row.stock <= match.low_stock_threshold && match.low_stock_threshold > 0 && row.stock > 0 && businessId) {
        //   await notifyOwnerLowStock(businessId, [{ ...match, stock_count: row.stock }]);
        // }

        setItems((prev) =>
          prev.map((i) => (i.id === match.id ? { ...i, stock_count: row.stock } : i))
        );
        updated++;
      }

      setImporting(false);
      setCsvReport(`CSV import complete: ${updated} updated, ${skipped} skipped (not found in product list).`);
      // Reset file input so the same file can be re-imported
      if (fileInputRef.current) fileInputRef.current.value = "";
      // Refresh movements if history is open
      if (showHistory && businessId) void loadMovements(businessId);
    };
    reader.readAsText(file);
  }

  // ── Manual add product ───────────────────────────────────────────────────────
  async function addProduct() {
    const name = newName.trim();
    const stockNum = parseInt(newStock, 10);
    const thresholdNum = newThreshold.trim() === "" ? 5 : parseInt(newThreshold, 10);

    if (!name) {
      setError("Product name is required.");
      return;
    }
    if (isNaN(stockNum) || stockNum < 0) {
      setError("Initial stock must be a non-negative number.");
      return;
    }
    if (isNaN(thresholdNum) || thresholdNum < 0) {
      setError("Alert threshold must be a non-negative number.");
      return;
    }

    setError(null);
    setSuccess(null);

    // Demo mode: append locally only.
    if (!isSupabaseConfigured) {
      setItems((prev) =>
        [
          ...prev,
          {
            id: `demo-new-${Date.now()}`,
            business_id: "demo-biz",
            name,
            stock_count: stockNum,
            low_stock_threshold: thresholdNum,
            is_published: true,
          },
        ].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setNewName("");
      setNewStock("");
      setNewThreshold("");
      setSuccess(`Added "${name}" (demo mode).`);
      return;
    }

    if (!businessId) {
      setError("No business found for this account. Register a business first.");
      return;
    }

    setAdding(true);
    try {
      // menu_items.category_id is NOT NULL → find or create a default category.
      let categoryId: string;
      const { data: cats, error: catSelErr } = await supabase
        .from("menu_categories")
        .select("id")
        .eq("business_id", businessId)
        .order("sort", { ascending: true })
        .limit(1);
      if (catSelErr) throw catSelErr;

      if (cats && cats.length > 0) {
        categoryId = cats[0].id as string;
      } else {
        const { data: newCat, error: catInsErr } = await supabase
          .from("menu_categories")
          .insert({ business_id: businessId, name: "Uncategorized" })
          .select("id")
          .single();
        if (catInsErr || !newCat) throw new Error(catInsErr?.message ?? "Failed to create category.");
        categoryId = newCat.id as string;
      }

      const { data: inserted, error: insErr } = await supabase
        .from("menu_items")
        .insert({
          business_id: businessId,
          category_id: categoryId,
          name,
          stock_count: stockNum,
          low_stock_threshold: thresholdNum,
          price_cents: 0,
        })
        .select("id, business_id, name, stock_count, low_stock_threshold, is_published")
        .single();
      if (insErr || !inserted) throw new Error(insErr?.message ?? "Failed to add product.");

      // Log the initial stock as a movement.
      if (stockNum > 0) {
        await supabase.from("stock_movements").insert({
          menu_item_id: (inserted as MenuItem).id,
          business_id: businessId,
          delta: stockNum,
          reason: "Initial stock",
        });
      }

      setItems((prev) =>
        [...prev, inserted as MenuItem].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setNewName("");
      setNewStock("");
      setNewThreshold("");
      setSuccess(`Added "${name}".`);
      if (showHistory) void loadMovements(businessId);
    } catch (e: unknown) {
      setError(`Add product failed: ${e instanceof Error ? e.message : String(e)}`);
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

  // ── Render ───────────────────────────────────────────────────────────────────
  if (loadingBiz) {
    return (
      <div style={{ padding: "40px", color: "var(--db-text-secondary)", fontSize: "14px" }}>
        Loading…
      </div>
    );
  }

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
          Inventory
        </h1>
        <p style={{ fontSize: "14px", color: "var(--db-text-secondary)" }}>
          Manage stock counts, low-stock thresholds, and view movement history.
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
            Demo mode — Supabase not configured
          </span>
        )}
      </div>

      {/* Summary stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        {[
          { label: "Total Products",  value: items.length, color: "var(--db-text-primary)" },
          { label: "Low Stock",       value: lowCount,     color: lowCount > 0 ? "var(--db-warning)" : "var(--db-success)" },
          { label: "Out of Stock",    value: outCount,     color: outCount > 0 ? "var(--db-danger)"  : "var(--db-success)" },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            style={{
              background: "var(--db-bg-surface)",
              border: "1px solid var(--db-border)",
              borderRadius: "10px",
              padding: "16px 20px",
            }}
          >
            <div style={{ fontSize: "12px", color: "var(--db-text-secondary)", marginBottom: "4px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {label}
            </div>
            <div style={{ fontSize: "28px", fontWeight: 700, color }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Feedback banners */}
      {error   && <AlertBanner type="error"   message={error}   />}
      {success && <AlertBanner type="success" message={success} />}
      {csvReport && <AlertBanner type="info"  message={csvReport} />}

      {/* Manual add product */}
      <SectionCard>
        <SectionTitle>
          <IconPlus size={16} color="var(--db-accent)" />
          Add a Product
        </SectionTitle>
        <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", marginBottom: "14px" }}>
          Add a product manually without a CSV. It will be created in your menu so
          you can set a price later from the Menu page.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 130px 150px auto",
            gap: "12px",
            alignItems: "end",
          }}
        >
          <div>
            <label style={addLabelStyle}>Product name *</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Hamburger"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={addLabelStyle}>Initial stock *</label>
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
            <label style={addLabelStyle}>Alert threshold</label>
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
            {adding ? "Adding…" : "Add Product"}
          </button>
        </div>
      </SectionCard>

      {/* CSV import */}
      <SectionCard>
        <SectionTitle>
          <IconUpload size={16} color="var(--db-accent)" />
          Bulk Stock Import via CSV
        </SectionTitle>
        <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", marginBottom: "14px" }}>
          Upload a CSV with columns <code style={{ background: "var(--db-bg-elevated)", padding: "1px 5px", borderRadius: "4px" }}>name</code> and{" "}
          <code style={{ background: "var(--db-bg-elevated)", padding: "1px 5px", borderRadius: "4px" }}>stock</code>.
          Stock counts are matched by product name (case-insensitive) and a movement is logged for every change.
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
            {importing ? "Importing…" : "Choose CSV"}
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
            Parses client-side — no file is uploaded to a server.
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
            Example
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
            Download template
          </button>
        </div>

        <p style={{ fontSize: "11px", color: "var(--db-text-tertiary)", marginTop: "10px", fontStyle: "italic" }}>
          {/* TODO(server/Edge Function): email owner on low stock */}
          Email alerts when stock hits threshold — Edge Function integration pending.
        </p>
      </SectionCard>

      {/* Product table */}
      <SectionCard>
        <SectionTitle>
          <IconBox size={16} color="var(--db-accent)" />
          Products &amp; Stock Levels
        </SectionTitle>

        {/* Table header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 110px 130px 130px 120px",
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
          <span>Product</span>
          <span style={{ textAlign: "right" }}>Stock</span>
          <span style={{ textAlign: "right" }}>Alert at ≤</span>
          <span>Reason</span>
          <span style={{ textAlign: "right" }}>Action</span>
        </div>

        {loadingItems ? (
          <div style={{ padding: "32px", textAlign: "center", color: "var(--db-text-secondary)", fontSize: "14px" }}>
            Loading products…
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: "32px", textAlign: "center", color: "var(--db-text-secondary)", fontSize: "14px" }}>
            No products found. Add products from the Menu page first.
          </div>
        ) : (
          items.map((item) => (
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
          ))
        )}
      </SectionCard>

      {/* Movement history */}
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
            Stock Movement History
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
                Loading history…
              </div>
            ) : movements.length === 0 ? (
              <div style={{ padding: "24px", textAlign: "center", color: "var(--db-text-secondary)", fontSize: "14px" }}>
                No movements recorded yet.
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
                  <span>Product</span>
                  <span style={{ textAlign: "right" }}>Delta</span>
                  <span>Reason</span>
                  <span style={{ textAlign: "right" }}>Date</span>
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
