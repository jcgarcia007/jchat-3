// TODO(F5-empleados): Cuando los empleados accedan al dashboard, esta vista necesitará
// (1) gate de permiso sales_view y (2) probablemente una RPC SECURITY DEFINER,
// porque el RLS de empleado (migr 077) solo deja ver pedidos de sus mesas, no las
// ventas del negocio completo. Hoy solo el dueño accede (auth gate del layout) y
// tiene RLS completo, así que la vista es correcta para el caso actual.

"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  IconChevronLeft,
  IconChevronRight,
  IconChevronDown,
  IconChevronUp,
  IconDownload,
  IconUser,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { resolveActiveBusiness } from "@/lib/business";
import { formatCents } from "@/lib/currency";
import { NoBusinessCTA } from "@/components/dashboard/NoBusinessCTA";

// ── Types ─────────────────────────────────────────────────────────────────────

type RangePreset = "today" | "week" | "month" | "custom";

interface EmployeeRow {
  id: string;
  user_id: string;
  role: string;
  users: { display_name: string | null; username: string | null; avatar_url: string | null } | null;
}

interface OrderRow {
  id: string;
  taken_by: string | null;
  tip_cents: number | null;
  subtotal_cents: number | null;
  tax_cents: number | null;
  discount_cents: number | null;
  total_cents: number;
  order_type: string | null;
  status: string;
  table_label: string | null;
  paid_at: string | null;
}

interface ItemRow {
  order_id: string;
  qty: number;
  price_cents: number;
  menu_items: { name: string } | null;
}

interface WaiterRow {
  employee_id: string;
  table_id: string;
  tables: { label: string; floor: string | null } | null;
}

interface TableAssignment {
  label: string;
  floor: string | null;
}

interface ProductStat {
  name: string;
  qty: number;
}

interface OrderDetail {
  id: string;
  paid_at: string;
  table_label: string | null;
  order_type: string | null;
  total_cents: number;
  tip_cents: number | null;
  subtotal_cents: number | null;
  tax_cents: number | null;
  discount_cents: number | null;
  status: string;
  items: { name: string; qty: number; price_cents: number }[];
}

interface SellerStats {
  employeeId: string | null;         // null → "Sin asignar"
  userId: string | null;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  orderCount: number;
  cancelCount: number;
  // ventas = sum(total_cents) de no-cancelados — total_cents es lo que entró de caja
  totalCents: number;
  // tip sobre subtotal_cents como denominador del %
  tipCents: number;
  subtotalCents: number;
  taxCents: number;
  discountCents: number;
  byOrderType: Record<string, number>;   // order_type → sum(total_cents)
  topProducts: ProductStat[];
  tables: TableAssignment[];
  servedAtBar: boolean;
  orders: OrderDetail[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function localDayStart(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

function getRange(preset: RangePreset, customStart: string, customEnd: string): { start: Date; end: Date } {
  const now = new Date();
  if (preset === "today") return { start: localDayStart(), end: now };
  if (preset === "week") {
    const d = new Date(now);
    const day = d.getDay() === 0 ? 6 : d.getDay() - 1; // Monday = 0
    d.setDate(d.getDate() - day);
    return { start: new Date(d.getFullYear(), d.getMonth(), d.getDate()), end: now };
  }
  if (preset === "month") return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now };
  // custom — fallback to today if inputs blank
  const s = customStart ? new Date(`${customStart}T00:00:00`) : localDayStart();
  const e = customEnd   ? new Date(`${customEnd}T23:59:59`)   : now;
  return { start: s, end: e };
}

function orderTypeLabel(type: string | null, t: ReturnType<typeof useTranslations>): string {
  if (type === "table")   return t("orderTypeTable");
  if (type === "counter") return t("orderTypeCounter");
  return type ?? "—";
}

function fmtTime(iso: string, locale: string): string {
  // NOTE: locale comes from next-intl useLocale(); may be 'en' or 'es'.
  // The Intl.DateTimeFormat fallback to system locale when locale is a short tag
  // (e.g. 'en' instead of 'en-US') is fine for time display.
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function fmtPct(num: number, den: number): string {
  if (den <= 0) return "—";
  return `${((num / den) * 100).toFixed(1)}%`;
}

function initSeller(id: string | null, display: string, username: string | null, avatar: string | null, empId: string | null): SellerStats {
  return {
    employeeId: empId,
    userId: id,
    displayName: display,
    username,
    avatarUrl: avatar,
    orderCount: 0,
    cancelCount: 0,
    totalCents: 0,
    tipCents: 0,
    subtotalCents: 0,
    taxCents: 0,
    discountCents: 0,
    byOrderType: {},
    topProducts: [],
    tables: [],
    servedAtBar: false,
    orders: [],
  };
}

// Chunk array into sub-arrays of size n
function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(`${s}T00:00:00`).getTime());
}

// ── LetterAvatar ──────────────────────────────────────────────────────────────

function LetterAvatar({ name, size = 32 }: { name: string; size?: number }) {
  const letter = name.trim()[0]?.toUpperCase() ?? "?";
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "color-mix(in srgb, var(--db-accent) 20%, transparent)",
        color: "var(--db-accent)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.4,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {letter}
    </div>
  );
}

// ── DateRangePicker ───────────────────────────────────────────────────────────

function DateRangePicker({
  preset,
  customStart,
  customEnd,
  onPreset,
  onCustomStart,
  onCustomEnd,
  t,
  rightSlot,
}: {
  preset: RangePreset;
  customStart: string;
  customEnd: string;
  onPreset: (p: RangePreset) => void;
  onCustomStart: (v: string) => void;
  onCustomEnd: (v: string) => void;
  t: ReturnType<typeof useTranslations>;
  rightSlot?: React.ReactNode;
}) {
  const presets: { key: RangePreset; label: string }[] = [
    { key: "today", label: t("salesRangeToday") },
    { key: "week",  label: t("salesRangeWeek")  },
    { key: "month", label: t("salesRangeMonth") },
    { key: "custom",label: t("salesRangeCustom") },
  ];

  const btnBase: React.CSSProperties = {
    padding: "5px 12px",
    borderRadius: "999px",
    fontSize: "12px",
    border: "1px solid var(--db-border)",
    cursor: "pointer",
    transition: "all 0.15s",
  };

  const inputStyle: React.CSSProperties = {
    padding: "4px 8px",
    borderRadius: "6px",
    border: "1px solid var(--db-border)",
    background: "var(--db-bg-elevated)",
    color: "var(--db-text-primary)",
    fontSize: "12px",
  };

  return (
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px", marginBottom: "20px" }}>
      {presets.map(({ key, label }) => {
        const active = preset === key;
        return (
          <button
            key={key}
            onClick={() => onPreset(key)}
            style={{
              ...btnBase,
              fontWeight: active ? 700 : 500,
              background: active
                ? "color-mix(in srgb, var(--db-accent) 12%, transparent)"
                : "var(--db-bg-elevated)",
              borderColor: active ? "var(--db-accent)" : "var(--db-border)",
              color: active ? "var(--db-accent)" : "var(--db-text-secondary)",
            }}
          >
            {label}
          </button>
        );
      })}
      {preset === "custom" && (
        <>
          <label style={{ fontSize: "12px", color: "var(--db-text-secondary)" }}>{t("salesRangeFrom")}</label>
          <input type="date" value={customStart} onChange={(e) => onCustomStart(e.target.value)} style={inputStyle} />
          <label style={{ fontSize: "12px", color: "var(--db-text-secondary)" }}>{t("salesRangeTo")}</label>
          <input type="date" value={customEnd} onChange={(e) => onCustomEnd(e.target.value)} style={inputStyle} />
        </>
      )}
      {rightSlot && <div style={{ marginLeft: "auto" }}>{rightSlot}</div>}
    </div>
  );
}

// ── SellerRow ─────────────────────────────────────────────────────────────────

function SellerRow({
  seller,
  isSelected,
  isUnassigned,
  locale,
  onClick,
  t,
}: {
  seller: SellerStats;
  isSelected: boolean;
  isUnassigned: boolean;
  locale: string;
  onClick: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const avgTicket = seller.orderCount > 0
    ? formatCents(Math.round(seller.totalCents / seller.orderCount), locale)
    : "—";
  const tipPct = fmtPct(seller.tipCents, seller.subtotalCents);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      aria-pressed={isSelected}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "12px 16px",
        borderBottom: "1px solid var(--db-border)",
        background: isSelected ? "color-mix(in srgb, var(--db-accent) 6%, transparent)" : "var(--db-bg-surface)",
        cursor: "pointer",
        opacity: isUnassigned ? 0.65 : 1,
        transition: "background 0.12s",
        flexWrap: "wrap",
      }}
    >
      {/* Avatar */}
      {isUnassigned
        ? <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--db-bg-elevated)", border: "1px dashed var(--db-border)", display: "flex", alignItems: "center", justifyContent: "center" }}><IconUser size={14} color="var(--db-text-tertiary)" /></div>
        : <LetterAvatar name={seller.displayName} />
      }

      {/* Name + tables */}
      <div style={{ flex: "1 1 120px", minWidth: 0 }}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--db-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {seller.displayName}
        </div>
        {seller.tables.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "4px" }}>
            {seller.tables.slice(0, 4).map((tbl) => (
              <span
                key={tbl.label}
                style={{
                  fontSize: "10px",
                  fontWeight: 600,
                  padding: "1px 5px",
                  borderRadius: "4px",
                  background: "var(--db-bg-elevated)",
                  color: "var(--db-text-secondary)",
                }}
              >
                {tbl.label}
              </span>
            ))}
            {seller.servedAtBar && (
              <span style={{ fontSize: "10px", fontWeight: 700, padding: "1px 5px", borderRadius: "4px", background: "color-mix(in srgb, var(--db-accent) 15%, transparent)", color: "var(--db-accent)" }}>
                {t("salesBarChip")}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Stats */}
      <StatCell label={t("salesColOrders")} value={String(seller.orderCount)} />
      <StatCell label={t("salesColSales")} value={formatCents(seller.totalCents, locale)} />
      <StatCell label={t("salesColTips")} value={formatCents(seller.tipCents, locale)} />
      <StatCell label={t("salesColTipPct")} value={tipPct} />
      <StatCell label={t("salesColAvgTicket")} value={avgTicket} />

      <IconChevronDown
        size={16}
        color="var(--db-text-tertiary)"
        style={{ transform: isSelected ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", flexShrink: 0 }}
      />
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: "right", flex: "0 0 auto" }}>
      <div style={{ fontSize: "10px", color: "var(--db-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px" }}>{label}</div>
      <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--db-text-primary)", fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

// ── OrderDetailRow ────────────────────────────────────────────────────────────

function OrderDetailRow({ order, locale, t }: {
  order: OrderDetail;
  locale: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ borderBottom: "1px solid var(--db-border)" }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => e.key === "Enter" && setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "8px 12px",
          cursor: "pointer",
          flexWrap: "wrap",
          background: "var(--db-bg-elevated)",
        }}
      >
        <span style={{ fontSize: "11px", color: "var(--db-text-tertiary)", flexShrink: 0 }}>
          {fmtTime(order.paid_at, locale)}
        </span>
        <span style={{ fontSize: "12px", color: "var(--db-text-secondary)", flex: 1 }}>
          {order.table_label ?? "—"}
          {order.order_type ? ` · ${orderTypeLabel(order.order_type, t)}` : ""}
        </span>
        <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--db-text-primary)", fontVariantNumeric: "tabular-nums" }}>
          {formatCents(order.total_cents, locale)}
        </span>
        {(order.tip_cents ?? 0) > 0 && (
          <span style={{ fontSize: "11px", color: "var(--db-success)" }}>
            +{formatCents(order.tip_cents ?? 0, locale)} {t("salesDetailTip")}
          </span>
        )}
        {open ? <IconChevronUp size={13} color="var(--db-text-tertiary)" /> : <IconChevronDown size={13} color="var(--db-text-tertiary)" />}
      </div>

      {open && order.items.length > 0 && (
        <div style={{ padding: "8px 12px 8px 32px", display: "flex", flexDirection: "column", gap: "4px", background: "var(--db-bg-surface)" }}>
          {order.items.map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
              <span style={{ color: "var(--db-text-secondary)" }}>{item.qty}× {item.name}</span>
              <span style={{ color: "var(--db-text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{formatCents(item.price_cents * item.qty, locale)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── SellerDetail ──────────────────────────────────────────────────────────────

function SellerDetail({ seller, locale, t }: {
  seller: SellerStats;
  locale: string;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div
      style={{
        background: "var(--db-bg-surface)",
        border: "1px solid var(--db-border)",
        borderTop: "none",
        borderRadius: "0 0 var(--db-radius-card) var(--db-radius-card)",
        overflow: "hidden",
      }}
    >
      {/* Desglose financiero */}
      <Section title={t("salesDetailBreakdown")}>
        <BreakdownRow label={t("salesDetailSubtotal")}  value={formatCents(seller.subtotalCents, locale)} />
        <BreakdownRow label={t("salesDetailTax")}       value={formatCents(seller.taxCents, locale)} />
        <BreakdownRow label={t("salesDetailDiscount")}  value={seller.discountCents > 0 ? `−${formatCents(seller.discountCents, locale)}` : formatCents(0, locale)} />
        <BreakdownRow label={t("salesDetailTip")}       value={formatCents(seller.tipCents, locale)} accent />
        <BreakdownRow label={t("salesDetailTotal")}     value={formatCents(seller.totalCents, locale)} bold />
      </Section>

      {/* Ventas por tipo de pedido */}
      {Object.keys(seller.byOrderType).length > 0 && (
        <Section title={t("salesDetailByType")}>
          {Object.entries(seller.byOrderType).map(([type, cents]) => (
            <BreakdownRow key={type} label={orderTypeLabel(type, t)} value={formatCents(cents, locale)} />
          ))}
        </Section>
      )}

      {/* Top productos */}
      {seller.topProducts.length > 0 && (
        <Section title={t("salesDetailTopProducts")}>
          {seller.topProducts.map((p, i) => (
            <BreakdownRow key={i} label={`${i + 1}. ${p.name}`} value={`×${p.qty}`} />
          ))}
        </Section>
      )}

      {/* Cancelaciones y descuentos */}
      {(seller.cancelCount > 0 || seller.discountCents > 0) && (
        <Section title={t("salesDetailCancellations", { count: seller.cancelCount })}>
          {seller.cancelCount > 0 && (
            <BreakdownRow label={t("salesDetailCancellations", { count: seller.cancelCount })} value={String(seller.cancelCount)} />
          )}
          {seller.discountCents > 0 && (
            <BreakdownRow label={t("salesDetailDiscount")} value={formatCents(seller.discountCents, locale)} />
          )}
        </Section>
      )}

      {/* Lista de pedidos individuales */}
      {seller.orders.length > 0 && (
        <div style={{ padding: "12px 16px 4px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--db-text-tertiary)", marginBottom: "8px" }}>
            {t("salesDetailOrdersList")}
          </div>
          <div style={{ border: "1px solid var(--db-border)", borderRadius: "var(--db-radius-card)", overflow: "hidden", marginBottom: "12px" }}>
            {seller.orders.map((order) => (
              <OrderDetailRow key={order.id} order={order} locale={locale} t={t} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--db-border)" }}>
      <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--db-text-tertiary)", marginBottom: "8px" }}>
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>{children}</div>
    </div>
  );
}

function BreakdownRow({ label, value, bold, accent }: { label: string; value: string; bold?: boolean; accent?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px" }}>
      <span style={{ color: "var(--db-text-secondary)" }}>{label}</span>
      <span style={{
        fontWeight: bold ? 800 : 600,
        fontVariantNumeric: "tabular-nums",
        color: accent ? "var(--db-success)" : bold ? "var(--db-text-primary)" : "var(--db-text-secondary)",
      }}>
        {value}
      </span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function SalesPageInner() {
  const t = useTranslations("dashboardCommon");
  const locale = useLocale();

  const searchParams = useSearchParams();
  const fromParam    = searchParams.get("from") ?? "";
  const toParam      = searchParams.get("to")   ?? "";
  const hasCustom    = isValidDate(fromParam) && isValidDate(toParam);

  const [preset, setPreset]           = useState<RangePreset>(hasCustom ? "custom" : "today");
  const [customStart, setCustomStart] = useState(hasCustom ? fromParam : "");
  const [customEnd, setCustomEnd]     = useState(hasCustom ? toParam   : "");

  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(false);
  const [noBusiness, setNoBusiness] = useState(false);
  const [sellers, setSellers]       = useState<SellerStats[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const bizIdRef = useRef<string | null>(null);

  async function fetchData(bid: string, start: Date, end: Date) {
    const [empRes, ordersRes, waitersRes] = await Promise.all([
      supabase
        .from("employees")
        .select("id, user_id, role, users(display_name, username, avatar_url)")
        .eq("business_id", bid)
        .eq("status", "accepted"),

      supabase
        .from("orders")
        .select("id, taken_by, tip_cents, subtotal_cents, tax_cents, discount_cents, total_cents, order_type, status, table_label, paid_at")
        .eq("business_id", bid)
        .not("paid_at", "is", null)
        .gte("paid_at", start.toISOString())
        .lte("paid_at", end.toISOString()),

      supabase
        .from("table_waiters")
        .select("employee_id, table_id, tables(label, floor)")
        .eq("business_id", bid),
    ]);

    if (empRes.error || ordersRes.error || waitersRes.error) {
      setError(true);
      setLoading(false);
      return;
    }

    const employees = (empRes.data ?? []) as EmployeeRow[];
    const orders    = (ordersRes.data ?? []) as OrderRow[];
    const waiters   = (waitersRes.data ?? []) as WaiterRow[];

    // Fetch order_items (chunked by 100 to avoid large IN clauses)
    let items: ItemRow[] = [];
    if (orders.length > 0) {
      const orderIds = orders.map((o) => o.id);
      const chunks = chunk(orderIds, 100);
      const itemResults = await Promise.all(
        chunks.map((ids) =>
          supabase
            .from("order_items")
            .select("order_id, qty, price_cents, menu_items(name)")
            .in("order_id", ids)
        )
      );
      for (const res of itemResults) {
        if (res.error) {
          setError(true);
          setLoading(false);
          return;
        }
        items = items.concat((res.data ?? []) as ItemRow[]);
      }
    }

    // ── Aggregate ─────────────────────────────────────────────────────────────

    // Map: user_id → SellerStats
    const byUserId = new Map<string, SellerStats>();
    for (const emp of employees) {
      const profile = emp.users;
      const displayName = profile?.display_name ?? (profile?.username ? `@${profile.username}` : t("employeeName"));
      byUserId.set(emp.user_id, initSeller(emp.user_id, displayName, profile?.username ?? null, profile?.avatar_url ?? null, emp.id));
    }

    // Unassigned bucket
    const unassigned = initSeller(null, t("salesUnassigned"), null, null, null);

    // Map: order_id → items
    const itemsByOrder = new Map<string, typeof items>();
    for (const item of items) {
      const list = itemsByOrder.get(item.order_id) ?? [];
      list.push(item);
      itemsByOrder.set(item.order_id, list);
    }

    // Process orders
    for (const order of orders) {
      const seller = (order.taken_by && byUserId.has(order.taken_by))
        ? byUserId.get(order.taken_by)!
        : unassigned;

      const isCancelled = order.status === "cancelled";
      // NOTE: cancelled orders with paid_at are excluded from sales totals and
      // counted separately. Non-cancelled paid orders contribute to all metrics.
      // total_cents used for "Ventas totales" (cash received); subtotal_cents as
      // denominator for % propina (tip is a percentage of pretax subtotal).

      if (isCancelled) {
        seller.cancelCount++;
      } else {
        seller.orderCount++;
        seller.totalCents    += order.total_cents ?? 0;
        seller.tipCents      += order.tip_cents ?? 0;
        seller.subtotalCents += order.subtotal_cents ?? 0;
        seller.taxCents      += order.tax_cents ?? 0;
        seller.discountCents += order.discount_cents ?? 0;
        if (order.order_type) {
          seller.byOrderType[order.order_type] = (seller.byOrderType[order.order_type] ?? 0) + (order.total_cents ?? 0);
        }
      }

      // Build order detail for this seller's list (ALL orders, incl. cancelled)
      const orderItems = (itemsByOrder.get(order.id) ?? []).map((it) => ({
        name: it.menu_items?.name ?? "—",
        qty: it.qty,
        price_cents: it.price_cents,
      }));
      seller.orders.push({
        id: order.id,
        paid_at: order.paid_at!,
        table_label: order.table_label,
        order_type: order.order_type,
        total_cents: order.total_cents,
        tip_cents: order.tip_cents,
        subtotal_cents: order.subtotal_cents,
        tax_cents: order.tax_cents,
        discount_cents: order.discount_cents,
        status: order.status,
        items: orderItems,
      });
    }

    // Top products per seller (top 5 by qty)
    // Build product qty map from items of each seller's orders
    const productQtyByEmp = new Map<string | null, Map<string, number>>();

    for (const order of orders) {
      if (order.status === "cancelled") continue;
      const empUserId = order.taken_by ?? null;
      const mapKey    = (empUserId && byUserId.has(empUserId)) ? empUserId : null; // null → unassigned

      let pMap = productQtyByEmp.get(mapKey);
      if (!pMap) { pMap = new Map(); productQtyByEmp.set(mapKey, pMap); }

      for (const item of (itemsByOrder.get(order.id) ?? [])) {
        const name = item.menu_items?.name ?? "—";
        pMap.set(name, (pMap.get(name) ?? 0) + item.qty);
      }
    }

    function applyTopProducts(seller: SellerStats, mapKey: string | null) {
      const pMap = productQtyByEmp.get(mapKey);
      if (!pMap) return;
      seller.topProducts = [...pMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, qty]) => ({ name, qty }));
    }

    for (const [userId, seller] of byUserId.entries()) {
      applyTopProducts(seller, userId);
    }
    applyTopProducts(unassigned, null);

    // Table assignments from table_waiters
    for (const w of waiters) {
      const seller = [...byUserId.values()].find((s) => s.employeeId === w.employee_id);
      if (!seller || !w.tables) continue;
      seller.tables.push({ label: w.tables.label, floor: w.tables.floor });
      if (w.tables.floor === "Barra") seller.servedAtBar = true;
    }

    // Sort orders by paid_at desc within each seller
    for (const seller of byUserId.values()) {
      seller.orders.sort((a, b) => b.paid_at.localeCompare(a.paid_at));
    }
    unassigned.orders.sort((a, b) => b.paid_at.localeCompare(a.paid_at));

    // Build final list: registered employees sorted by totalCents desc, then unassigned
    const sellerList = [...byUserId.values()].sort((a, b) => b.totalCents - a.totalCents);
    if (unassigned.orderCount > 0 || unassigned.cancelCount > 0) sellerList.push(unassigned);

    setSellers(sellerList);
    setError(false);
    setLoading(false);
    // Reset selection if data changed
    setSelectedIdx(null);
  }

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    let active = true;

    void (async () => {
      try {
        const res = await resolveActiveBusiness();
        if (!active) return;
        if (!res.ok) { setNoBusiness(true); setLoading(false); return; }

        const bid = res.business.id;
        bizIdRef.current = bid;

        const { start, end } = getRange(preset, customStart, customEnd);
        setLoading(true);
        await fetchData(bid, start, end);
      } catch {
        if (active) { setError(true); setLoading(false); }
      }
    })();

    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, customStart, customEnd]);

  // ── CSV export ─────────────────────────────────────────────────────────────

  function downloadCsv() {
    const { start, end } = getRange(preset, customStart, customEnd);
    function fmtLocal(d: Date): string {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    const fromStr = fmtLocal(start);
    const toStr   = fmtLocal(end);

    const headers = [
      t("csvColDate"), t("csvColTime"), t("csvColSeller"), t("csvColTable"),
      t("csvColType"), t("csvColStatus"), t("csvColSubtotal"), t("csvColTax"),
      t("csvColDiscount"), t("csvColTip"), t("csvColTotal"),
    ];

    const rows: string[][] = [];
    for (const seller of sellers) {
      for (const o of seller.orders) {
        const dt = new Date(o.paid_at);
        const datePart = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
        const timePart = `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
        rows.push([
          datePart,
          timePart,
          seller.displayName,
          o.table_label ?? "",
          o.order_type ?? "",
          o.status,
          ((o.subtotal_cents ?? 0) / 100).toFixed(2),
          ((o.tax_cents ?? 0) / 100).toFixed(2),
          ((o.discount_cents ?? 0) / 100).toFixed(2),
          ((o.tip_cents ?? 0) / 100).toFixed(2),
          (o.total_cents / 100).toFixed(2),
        ]);
      }
    }

    function csvEsc(v: string): string {
      return `"${v.replace(/"/g, '""')}"`;
    }

    const lines = [
      headers.map(csvEsc).join(","),
      ...rows.map((r) => r.map(csvEsc).join(",")),
    ];

    const content = "﻿" + lines.join("\r\n");
    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ventas_${fromStr}_${toStr}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  function navigate(dir: -1 | 1) {
    const maxIdx = sellers.length - 1;
    if (selectedIdx === null) { setSelectedIdx(dir === 1 ? 0 : maxIdx); return; }
    const next = selectedIdx + dir;
    if (next < 0 || next > maxIdx) return;
    setSelectedIdx(next);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (noBusiness) {
    return <div><NoBusinessCTA /></div>;
  }

  // Summary totals for strip + CSV filename range
  const totalSalesCents = sellers.reduce((s, sl) => s + sl.totalCents, 0);
  const totalOrders     = sellers.reduce((s, sl) => s + sl.orderCount, 0);
  const totalTipCents   = sellers.reduce((s, sl) => s + sl.tipCents, 0);
  const avgTicketCents  = totalOrders > 0 ? Math.round(totalSalesCents / totalOrders) : null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--db-text-primary)", margin: 0 }}>
          {t("salesTitle")}
        </h1>

        {/* Seller navigation arrows */}
        {sellers.length > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <button
              onClick={() => navigate(-1)}
              disabled={selectedIdx === 0}
              aria-label={t("salesNavPrev")}
              style={{ padding: "6px", borderRadius: "6px", border: "1px solid var(--db-border)", background: "var(--db-bg-elevated)", cursor: "pointer", opacity: selectedIdx === 0 ? 0.4 : 1 }}
            >
              <IconChevronLeft size={16} color="var(--db-text-secondary)" />
            </button>
            <span style={{ fontSize: "12px", color: "var(--db-text-tertiary)", minWidth: "60px", textAlign: "center" }}>
              {selectedIdx !== null ? `${selectedIdx + 1} / ${sellers.length}` : `— / ${sellers.length}`}
            </span>
            <button
              onClick={() => navigate(1)}
              disabled={selectedIdx === sellers.length - 1}
              aria-label={t("salesNavNext")}
              style={{ padding: "6px", borderRadius: "6px", border: "1px solid var(--db-border)", background: "var(--db-bg-elevated)", cursor: "pointer", opacity: selectedIdx === sellers.length - 1 ? 0.4 : 1 }}
            >
              <IconChevronRight size={16} color="var(--db-text-secondary)" />
            </button>
          </div>
        )}
      </div>

      <DateRangePicker
        preset={preset}
        customStart={customStart}
        customEnd={customEnd}
        onPreset={(p) => { setPreset(p); setLoading(true); }}
        onCustomStart={setCustomStart}
        onCustomEnd={setCustomEnd}
        t={t}
        rightSlot={!loading && !error && sellers.length > 0 ? (
          <button
            type="button"
            onClick={downloadCsv}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "5px 12px",
              borderRadius: "999px",
              fontSize: "12px",
              fontWeight: 600,
              border: "1px solid var(--db-border)",
              background: "var(--db-bg-elevated)",
              color: "var(--db-text-secondary)",
              cursor: "pointer",
            }}
          >
            <IconDownload size={14} />
            {t("salesDownloadCsv")}
          </button>
        ) : undefined}
      />

      {loading && (
        <div style={{ padding: "40px", textAlign: "center", color: "var(--db-text-secondary)", fontSize: "13px" }}>
          {t("salesLoadingData")}
        </div>
      )}

      {!loading && error && (
        <div style={{ padding: "24px", textAlign: "center", color: "var(--db-danger)", fontSize: "13px" }}>
          {t("salesLoadError")}
        </div>
      )}

      {!loading && !error && sellers.length === 0 && (
        <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--db-text-secondary)", fontSize: "13px" }}>
          {t("salesEmpty")}
        </div>
      )}

      {!loading && !error && sellers.length > 0 && (
        <div>
          {/* Business summary strip */}
          <div
            style={{
              display: "flex",
              gap: "20px",
              flexWrap: "wrap",
              padding: "12px 20px",
              marginBottom: "16px",
              background: "var(--db-bg-surface)",
              border: "1px solid var(--db-border)",
              borderRadius: "var(--db-radius-card)",
            }}
          >
            <StatCell label={t("salesSummaryTotal")} value={formatCents(totalSalesCents, locale)} />
            <StatCell label={t("salesSummaryOrders")} value={String(totalOrders)} />
            <StatCell label={t("salesSummaryTips")} value={formatCents(totalTipCents, locale)} />
            <StatCell
              label={t("salesSummaryAvgTicket")}
              value={avgTicketCents !== null ? formatCents(avgTicketCents, locale) : "—"}
            />
          </div>

          {sellers.map((seller, idx) => {
            const isUnassigned = seller.userId === null;
            const isSelected   = selectedIdx === idx;
            return (
              <div key={seller.employeeId ?? "__unassigned__"}>
                <div
                  style={{
                    borderRadius: isSelected ? "var(--db-radius-card) var(--db-radius-card) 0 0" : "var(--db-radius-card)",
                    border: "1px solid var(--db-border)",
                    overflow: "hidden",
                    marginBottom: isSelected ? 0 : "8px",
                  }}
                >
                  <SellerRow
                    seller={seller}
                    isSelected={isSelected}
                    isUnassigned={isUnassigned}
                    locale={locale}
                    onClick={() => setSelectedIdx(isSelected ? null : idx)}
                    t={t}
                  />
                </div>
                {isSelected && (
                  <div style={{ marginBottom: "8px" }}>
                    <SellerDetail seller={seller} locale={locale} t={t} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function SalesPage() {
  return (
    <Suspense fallback={null}>
      <SalesPageInner />
    </Suspense>
  );
}
