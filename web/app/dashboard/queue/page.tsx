"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  IconShoppingCart,
  IconBell,
  IconCalendar,
  IconStar,
  IconAlertTriangle,
  IconChevronRight,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { resolveActiveBusiness } from "@/lib/business";
import { formatCents } from "@/lib/currency";
import { OverviewTabBar } from "@/components/dashboard/OverviewTabBar";
import { NoBusinessCTA } from "@/components/dashboard/NoBusinessCTA";

// ── Types ─────────────────────────────────────────────────────────────────────

type FeedKind = "order" | "service_call" | "reservation" | "review";
type FilterKind = "all" | FeedKind;

interface OrderPayload {
  id: string;
  status: string;
  order_type: string | null;
  total_cents: number;
  table_label: string | null;
  created_at: string;
  status_updated_at: string | null;
  paid_at: string | null;
}

interface CallPayload {
  id: string;
  status: string;
  type: string;
  table_label: string | null;
  notes: string | null;
  created_at: string;
}

interface ReservationPayload {
  id: string;
  status: string;
  party_size: number;
  reserved_at: string;
  created_at: string;
}

interface ReviewPayload {
  id: string;
  rating: number;
  body: string | null;
  status: string;
  created_at: string;
  responded_at: string | null;
}

interface LowStockItem {
  id: string;
  name: string;
  stock_count: number;
}

interface FeedEvent {
  id: string;
  kind: FeedKind;
  timestamp: string;
  payload: OrderPayload | CallPayload | ReservationPayload | ReviewPayload;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function elapsedStr(iso: string, t: ReturnType<typeof useTranslations>): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return t("floorElapsedMinutes", { count: Math.max(mins, 1) });
  return t("floorElapsedHours", { count: Math.floor(mins / 60) });
}

function orderStatusColor(status: string): { bg: string; color: string } {
  switch (status) {
    case "pending":    return { bg: "color-mix(in srgb, var(--db-warning) 15%, transparent)",  color: "var(--db-warning)" };
    case "confirmed":  return { bg: "color-mix(in srgb, var(--db-accent) 15%, transparent)",   color: "var(--db-accent)" };
    case "preparing":  return { bg: "color-mix(in srgb, var(--db-accent) 15%, transparent)",   color: "var(--db-accent)" };
    case "ready":      return { bg: "color-mix(in srgb, var(--db-success) 15%, transparent)",  color: "var(--db-success)" };
    case "delivered":  return { bg: "color-mix(in srgb, var(--db-success) 10%, transparent)",  color: "var(--db-text-secondary)" };
    case "cancelled":  return { bg: "color-mix(in srgb, var(--db-danger) 12%, transparent)",   color: "var(--db-danger)" };
    default:           return { bg: "var(--db-bg-elevated)", color: "var(--db-text-secondary)" };
  }
}

function orderStatusLabel(status: string, t: ReturnType<typeof useTranslations>): string {
  switch (status) {
    case "pending":   return t("orderStatusPending");
    case "preparing": return t("orderStatusPreparing");
    case "ready":     return t("orderStatusReady");
    case "delivered": return t("orderStatusDelivered");
    case "cancelled": return t("orderStatusCancelled");
    default:          return status;
  }
}

function callTypeLabel(type: string, t: ReturnType<typeof useTranslations>): string {
  if (type === "waiter") return t("tabKindWaiter");
  if (type === "bill")   return t("serviceTypeBill");
  return t("serviceTypeOther");
}

function dayStart(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

function fmtReservedAt(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

// ── FeedRow ───────────────────────────────────────────────────────────────────

function FeedRow({ event, tick, locale, t }: {
  event: FeedEvent;
  tick: number;
  locale: string;
  t: ReturnType<typeof useTranslations>;
}) {
  void tick;

  const linkHref: Record<FeedKind, string> = {
    order:        "/dashboard/orders",
    service_call: "/dashboard/service",
    reservation:  "/dashboard/reservations",
    review:       "/dashboard/reviews",
  };

  const icon: Record<FeedKind, React.ReactNode> = {
    order:        <IconShoppingCart size={16} />,
    service_call: <IconBell size={16} />,
    reservation:  <IconCalendar size={16} />,
    review:       <IconStar size={16} />,
  };

  function renderDesc(): React.ReactNode {
    if (event.kind === "order") {
      const p = event.payload as OrderPayload;
      const { bg, color } = orderStatusColor(p.status);
      return (
        <span style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <span>
            {p.table_label ? t("queueTableLabel", { label: p.table_label }) : "—"}
            {" · "}
            {formatCents(p.total_cents, locale)}
          </span>
          <span
            aria-label={orderStatusLabel(p.status, t)}
            style={{
              fontSize: "11px",
              fontWeight: 700,
              padding: "1px 7px",
              borderRadius: "4px",
              background: bg,
              color,
              whiteSpace: "nowrap",
            }}
          >
            {orderStatusLabel(p.status, t)}
          </span>
        </span>
      );
    }

    if (event.kind === "service_call") {
      const p = event.payload as CallPayload;
      return (
        <span>
          {p.table_label ? t("queueTableLabel", { label: p.table_label }) : "—"}
          {" · "}
          {callTypeLabel(p.type, t)}
        </span>
      );
    }

    if (event.kind === "reservation") {
      const p = event.payload as ReservationPayload;
      return (
        <span>
          {t("queueReservationFor", { count: p.party_size, when: fmtReservedAt(p.reserved_at, locale) })}
        </span>
      );
    }

    if (event.kind === "review") {
      const p = event.payload as ReviewPayload;
      return (
        <span>
          {t("queueReviewSummary", { rating: p.rating })}
          {p.body ? ` — ${p.body.slice(0, 60)}${p.body.length > 60 ? "…" : ""}` : ""}
        </span>
      );
    }

    return null;
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "12px 16px",
        borderBottom: "1px solid var(--db-border)",
        background: "var(--db-bg-surface)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          flexShrink: 0,
          color: "var(--db-text-secondary)",
          display: "flex",
          alignItems: "center",
        }}
      >
        {icon[event.kind]}
      </span>

      <span style={{ flex: 1, fontSize: "13px", color: "var(--db-text-primary)", minWidth: 0 }}>
        {renderDesc()}
      </span>

      <span
        style={{
          flexShrink: 0,
          fontSize: "11px",
          color: "var(--db-text-tertiary)",
          whiteSpace: "nowrap",
        }}
      >
        {elapsedStr(event.timestamp, t)}
      </span>

      <Link
        href={linkHref[event.kind]}
        aria-label={t("queueViewAction")}
        style={{
          flexShrink: 0,
          fontSize: "12px",
          fontWeight: 600,
          color: "var(--db-accent)",
          textDecoration: "none",
          padding: "4px 8px",
          borderRadius: "5px",
          border: "1px solid color-mix(in srgb, var(--db-accent) 30%, transparent)",
          display: "flex",
          alignItems: "center",
          gap: "2px",
          whiteSpace: "nowrap",
        }}
      >
        {t("queueViewAction")}
        <IconChevronRight size={11} />
      </Link>
    </div>
  );
}

// ── FilterChips ───────────────────────────────────────────────────────────────

function FilterChips({ active, onChange, t }: {
  active: FilterKind;
  onChange: (f: FilterKind) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const chips: { key: FilterKind; label: string }[] = [
    { key: "all",          label: t("queueFilterAll") },
    { key: "order",        label: t("queueFilterOrders") },
    { key: "service_call", label: t("queueFilterCalls") },
    { key: "reservation",  label: t("queueFilterReservations") },
    { key: "review",       label: t("queueFilterReviews") },
  ];

  return (
    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "16px" }}>
      {chips.map(({ key, label }) => {
        const isActive = key === active;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            style={{
              padding: "5px 12px",
              borderRadius: "999px",
              fontSize: "12px",
              fontWeight: isActive ? 700 : 500,
              border: isActive
                ? "1px solid var(--db-accent)"
                : "1px solid var(--db-border)",
              background: isActive
                ? "color-mix(in srgb, var(--db-accent) 12%, transparent)"
                : "var(--db-bg-elevated)",
              color: isActive ? "var(--db-accent)" : "var(--db-text-secondary)",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function QueuePage() {
  const t = useTranslations("dashboardCommon");
  const locale = useLocale();

  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(false);
  const [noBusiness, setNoBusiness] = useState(false);
  const [feed, setFeed]             = useState<FeedEvent[]>([]);
  const [lowStock, setLowStock]     = useState<LowStockItem[]>([]);
  const [filter, setFilter]         = useState<FilterKind>("all");
  const [tick, setTick]             = useState(0);

  const bizIdRef       = useRef<string | null>(null);
  const ordersChannel  = useRef<RealtimeChannel | null>(null);
  const callsChannel   = useRef<RealtimeChannel | null>(null);
  const resvChannel    = useRef<RealtimeChannel | null>(null);
  const reviewChannel  = useRef<RealtimeChannel | null>(null);
  const refreshTimer   = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickTimer      = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchData(bid: string) {
    const start = dayStart();

    const [ordersRes, callsRes, resvRes, reviewsRes, stockRes] = await Promise.all([
      supabase
        .from("orders")
        .select("id, status, order_type, total_cents, table_label, created_at, status_updated_at, paid_at")
        .eq("business_id", bid)
        .gte("created_at", start.toISOString())
        .order("status_updated_at", { ascending: false })
        .limit(100),

      supabase
        .from("service_calls")
        .select("id, status, type, table_label, notes, created_at")
        .eq("business_id", bid)
        .in("status", ["pending", "acknowledged"]),

      supabase
        .from("reservations")
        .select("id, status, party_size, reserved_at, created_at")
        .eq("business_id", bid)
        .eq("status", "pending")
        .gte("created_at", start.toISOString()),

      supabase
        .from("reviews")
        .select("id, rating, body, status, created_at, responded_at")
        .eq("business_id", bid)
        .eq("status", "visible")
        .is("responded_at", null)
        .gte("created_at", start.toISOString()),

      supabase
        .from("menu_items")
        .select("id, name, stock_count, low_stock_threshold")
        .eq("business_id", bid)
        .gt("low_stock_threshold", 0)
        .gt("stock_count", 0),
    ]);

    if (ordersRes.error || callsRes.error || resvRes.error || reviewsRes.error || stockRes.error) {
      setError(true);
      setLoading(false);
      return;
    }

    // Build unified feed
    const events: FeedEvent[] = [];

    for (const o of ordersRes.data ?? []) {
      events.push({
        id: `order::${o.id}`,
        kind: "order",
        timestamp: o.status_updated_at ?? o.created_at,
        payload: o as OrderPayload,
      });
    }

    for (const c of callsRes.data ?? []) {
      events.push({
        id: `service_call::${c.id}`,
        kind: "service_call",
        timestamp: c.created_at,
        payload: c as CallPayload,
      });
    }

    for (const r of resvRes.data ?? []) {
      events.push({
        id: `reservation::${r.id}`,
        kind: "reservation",
        timestamp: r.created_at,
        payload: r as ReservationPayload,
      });
    }

    for (const rv of reviewsRes.data ?? []) {
      events.push({
        id: `review::${rv.id}`,
        kind: "review",
        timestamp: rv.created_at,
        payload: rv as ReviewPayload,
      });
    }

    // Sort all by timestamp DESC
    events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    // Low stock: only items where stock_count <= low_stock_threshold (both non-null per query filters)
    const stock = (stockRes.data ?? [])
      .filter((item) => item.stock_count != null && item.low_stock_threshold != null && item.stock_count <= item.low_stock_threshold)
      .map((item) => ({ id: item.id, name: item.name, stock_count: item.stock_count ?? 0 }));

    setFeed(events);
    setLowStock(stock);
    setError(false);
    setLoading(false);
  }

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    let active = true;

    void (async () => {
      try {
        const res = await resolveActiveBusiness();
        if (!active) return;

        if (!res.ok) {
          setNoBusiness(true);
          setLoading(false);
          return;
        }

        const bid = res.business.id;
        bizIdRef.current = bid;

        await fetchData(bid);

        if (!active) return;

        const reload = () => { void fetchData(bid).catch(() => {}); };

        ordersChannel.current = supabase
          .channel(`queue-orders-${bid}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `business_id=eq.${bid}` }, reload)
          .subscribe();

        callsChannel.current = supabase
          .channel(`queue-calls-${bid}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "service_calls", filter: `business_id=eq.${bid}` }, reload)
          .subscribe();

        resvChannel.current = supabase
          .channel(`queue-reservations-${bid}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "reservations", filter: `business_id=eq.${bid}` }, reload)
          .subscribe();

        reviewChannel.current = supabase
          .channel(`queue-reviews-${bid}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "reviews", filter: `business_id=eq.${bid}` }, reload)
          .subscribe();

        refreshTimer.current = setInterval(reload, 30_000);
        tickTimer.current    = setInterval(() => { setTick((n) => n + 1); }, 60_000);
      } catch {
        if (active) {
          setError(true);
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
      if (ordersChannel.current)  void supabase.removeChannel(ordersChannel.current);
      if (callsChannel.current)   void supabase.removeChannel(callsChannel.current);
      if (resvChannel.current)    void supabase.removeChannel(resvChannel.current);
      if (reviewChannel.current)  void supabase.removeChannel(reviewChannel.current);
      if (refreshTimer.current)   clearInterval(refreshTimer.current);
      if (tickTimer.current)      clearInterval(tickTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derived
  const pendingCount = feed.filter((e) => {
    if (e.kind === "service_call") {
      const p = e.payload as CallPayload;
      return p.status === "pending" || p.status === "acknowledged";
    }
    if (e.kind === "reservation" || e.kind === "review") return true;
    return false;
  }).length;

  const filtered = filter === "all" ? feed : feed.filter((e) => e.kind === filter);

  // ── Render ───────────────────────────────────────────────────────────────────

  if (noBusiness) {
    return (
      <div>
        <OverviewTabBar />
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--db-text-primary)", marginBottom: "8px" }}>
          {t("queueTitle")}
        </h1>
        <NoBusinessCTA />
      </div>
    );
  }

  return (
    <div>
      <OverviewTabBar />

      <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--db-text-primary)", marginBottom: "16px" }}>
        {t("queueTitle")}
      </h1>

      {/* Low stock alerts — static block, no timestamp */}
      {lowStock.length > 0 && (
        <div
          role="alert"
          style={{
            marginBottom: "16px",
            padding: "10px 14px",
            borderRadius: "var(--db-radius-card)",
            background: "color-mix(in srgb, var(--db-warning) 10%, transparent)",
            border: "1px solid color-mix(in srgb, var(--db-warning) 35%, transparent)",
            display: "flex",
            flexWrap: "wrap",
            gap: "8px",
            alignItems: "flex-start",
          }}
        >
          <IconAlertTriangle
            size={15}
            style={{ color: "var(--db-warning)", flexShrink: 0, marginTop: "1px" }}
            aria-hidden="true"
          />
          <span style={{ display: "flex", flexWrap: "wrap", gap: "6px", flex: 1 }}>
            {lowStock.map((item) => (
              <span
                key={item.id}
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "var(--db-warning)",
                  background: "color-mix(in srgb, var(--db-warning) 12%, transparent)",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  whiteSpace: "nowrap",
                }}
              >
                {t("queueLowStockAlert", { name: item.name, count: item.stock_count })}
              </span>
            ))}
          </span>
        </div>
      )}

      {/* Pending counter */}
      {!loading && !error && (
        <div
          style={{
            marginBottom: "16px",
            fontSize: "13px",
            fontWeight: 600,
            color: pendingCount > 0 ? "var(--db-warning)" : "var(--db-success)",
          }}
        >
          {pendingCount > 0
            ? t("queuePendingAttention", { count: pendingCount })
            : t("queueAllClear")}
        </div>
      )}

      {/* Filter chips */}
      <FilterChips active={filter} onChange={setFilter} t={t} />

      {/* Feed */}
      <div
        style={{
          borderRadius: "var(--db-radius-card)",
          border: "1px solid var(--db-border)",
          overflow: "hidden",
        }}
      >
        {loading && (
          <div style={{ padding: "32px", textAlign: "center", color: "var(--db-text-secondary)", fontSize: "13px" }}>
            {t("queueLoadingFeed")}
          </div>
        )}

        {!loading && error && (
          <div style={{ padding: "32px", textAlign: "center", color: "var(--db-danger)", fontSize: "13px" }}>
            {t("queueLoadError")}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div style={{ padding: "40px 24px", textAlign: "center", color: "var(--db-text-secondary)", fontSize: "13px" }}>
            {t("queueEmpty")}
          </div>
        )}

        {!loading && !error && filtered.map((event) => (
          <FeedRow key={event.id} event={event} tick={tick} locale={locale} t={t} />
        ))}
      </div>
    </div>
  );
}
