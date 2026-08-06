"use client";

/**
 * JChat 3.0 — Floor live grid (Overview tab "Mesas", F3).
 *
 * READ-ONLY visualisation of table occupancy for the active business.
 * Configuration lives in /dashboard/tables (admin). This page derives every
 * state from real data — never from a manual field or fabricated value.
 *
 * State priority (highest wins):
 *   reserved > bill > waiter > occupied > free
 *   "reserved" has no data source until F8; the code path is wired but no
 *   table will ever enter that state yet.
 *
 * service_call → table mapping (client-side, no schema migration needed):
 *   1st: sc.room_id matches tables.room_id   (tables with subchat enabled)
 *   2nd: sc.table_label matches tables.label  (case-insensitive trim fallback)
 *   3rd: no match → "call without a table" counter
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { IconBell, IconCalendar, IconUsers } from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { resolveActiveBusiness } from "@/lib/business";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TableRow {
  id: string;
  label: string;
  floor: string;
  seats: number;
  sort: number;
  room_id: string | null;
  is_reserved: boolean;
  party_size: number | null;
  /** UUID of the primary table this table is annexed to, or null. */
  combined_into: string | null;
}

interface TabRow {
  id: string;
  table_id: string;
  created_at: string;
  status: string;
}

interface CallRow {
  id: string;
  status: string;   // pending | acknowledged
  type: string;     // waiter | bill | other
  room_id: string;
  table_label: string | null;
  created_at: string;
}

type TableState = "free" | "occupied" | "reserved";

interface DerivedTable {
  id: string;
  label: string;
  floor: string;
  seats: number;
  state: TableState;
  hasCall: boolean;     // true if any pending/acknowledged service call
  minOpenAt: string | null; // earliest open tab created_at for elapsed time
  isReserved: boolean;  // mirrors tables.is_reserved; drives the floor quick-toggle (F8)
  party_size: number | null; // live guest count set by the POS waiter
  combined_into: string | null; // UUID of primary table when annexed
  combinedLabel: string | null; // label of the primary table (resolved at derive time)
  combinedSecondaryCount: number; // count of secondaries this table is primary for
}

interface ReservationForFloor {
  id: string;
  reserved_at: string;
  party_size: number;
  event_type: string | null;
  status: "pending" | "arrived" | "no_show" | "cancelled";
  customer: { first_name: string | null; last_name: string | null } | null;
  reservation_tables: { table_id: string }[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function elapsed(iso: string, t: ReturnType<typeof useTranslations>): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  const mins = Math.floor(secs / 60);
  if (mins < 60) return t("floorElapsedMinutes", { count: mins === 0 ? 1 : mins });
  const hours = Math.floor(mins / 60);
  return t("floorElapsedHours", { count: hours });
}

/**
 * Three-state derivation — same precedence and colors as /dashboard/tables:
 *   🟠 occupied — combined secondary, table_tab open, open order, or service call
 *   🔵 reserved — not occupied and is_reserved flag set
 *   🟢 free     — everything else (party_size alone does NOT make a table occupied)
 *
 * `occupiedByTable` covers table_tabs; `occupiedByOrder` covers POS orders
 * (the POS creates `orders`, not `table_tabs`). Both contribute to occupancy.
 * Combined secondaries (combinedInto ≠ null) are always occupied.
 */
function deriveState(
  tableId: string,
  partySize: number | null,
  isReserved: boolean,
  combinedInto: string | null,
  occupiedByTable: Map<string, string>,
  occupiedByOrder: Set<string>,
  callsByTable: Map<string, CallRow[]>,
): { state: TableState; hasCall: boolean } {
  const calls = callsByTable.get(tableId) ?? [];
  const hasCall = calls.length > 0;

  const isOcc =
    combinedInto !== null ||        // always occupied when annexed to a primary
    occupiedByTable.has(tableId) || // table_tab open
    occupiedByOrder.has(tableId) || // open POS order
    hasCall;                        // pending service call

  const state: TableState = isOcc ? "occupied" : isReserved ? "reserved" : "free";
  return { state, hasCall };
}

function stateColor(state: TableState): {
  background: string;
  border: string;
  color: string;
} {
  switch (state) {
    case "occupied":
      return {
        background: "color-mix(in srgb, var(--db-warning) 14%, transparent)",
        border: "1px solid color-mix(in srgb, var(--db-warning) 40%, transparent)",
        color: "var(--db-warning)",
      };
    case "reserved":
      return {
        background: "color-mix(in srgb, var(--db-accent) 14%, transparent)",
        border: "1px solid color-mix(in srgb, var(--db-accent) 40%, transparent)",
        color: "var(--db-accent)",
      };
    case "free":
      return {
        background: "color-mix(in srgb, var(--db-success) 14%, transparent)",
        border: "1px solid color-mix(in srgb, var(--db-success) 40%, transparent)",
        color: "var(--db-success)",
      };
  }
}

function dayStart(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

function resFormatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

// ── Demo data ─────────────────────────────────────────────────────────────────

const DEMO_TABLES: TableRow[] = [
  { id: "t1", label: "1", floor: "Principal", seats: 4, sort: 1, room_id: null, is_reserved: false, party_size: 3,    combined_into: null },
  { id: "t2", label: "2", floor: "Principal", seats: 2, sort: 2, room_id: null, is_reserved: true,  party_size: null, combined_into: null },
  { id: "t3", label: "3", floor: "Principal", seats: 6, sort: 3, room_id: null, is_reserved: false, party_size: null, combined_into: null },
  { id: "t4", label: "4", floor: "Terraza",   seats: 4, sort: 4, room_id: null, is_reserved: false, party_size: null, combined_into: null },
];
const DEMO_TABS: TabRow[] = [
  { id: "tab1", table_id: "t1", created_at: new Date(Date.now() - 45 * 60_000).toISOString(), status: "open" },
  { id: "tab2", table_id: "t3", created_at: new Date(Date.now() - 10 * 60_000).toISOString(), status: "open" },
];
const DEMO_CALLS: CallRow[] = [
  { id: "sc1", status: "pending", type: "bill", room_id: "x", table_label: "3", created_at: new Date(Date.now() - 5 * 60_000).toISOString() },
];

function makeTodayAt(hour: number, minute = 0): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

const DEMO_RESERVATIONS_TODAY: ReservationForFloor[] = [
  {
    id: "dr1",
    reserved_at: makeTodayAt(13, 30),
    party_size: 4,
    event_type: "birthday",
    status: "arrived",
    customer: { first_name: "Alex", last_name: "Rivera" },
    reservation_tables: [{ table_id: "t1" }],
  },
  {
    id: "dr2",
    reserved_at: makeTodayAt(20, 0),
    party_size: 2,
    event_type: null,
    status: "pending",
    customer: { first_name: "Jamie", last_name: "Lee" },
    reservation_tables: [],
  },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FloorPage() {
  const t      = useTranslations("dashboardCommon");
  const tCommon = useTranslations("common");

  const [tables, setTables]     = useState<TableRow[]>([]);
  const [tabs, setTabs]         = useState<TabRow[]>([]);
  const [calls, setCalls]       = useState<CallRow[]>([]);
  const [todayReservations, setTodayReservations] = useState<ReservationForFloor[]>([]);
  /** Set of table_ids with at least one open (unpaid, uncanceled) order. */
  const [occupiedByOrder, setOccupiedByOrder] = useState<Set<string>>(new Set());
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [noBusiness, setNoBusiness] = useState(false);
  const [, setTick] = useState(0); // for elapsed-time re-render

  const bizIdRef           = useRef<string | null>(null);
  const tablesChannel      = useRef<RealtimeChannel | null>(null);
  const tabsChannel        = useRef<RealtimeChannel | null>(null);
  const callsChannel       = useRef<RealtimeChannel | null>(null);
  const reservationsChannel = useRef<RealtimeChannel | null>(null);
  const ordersChannel      = useRef<RealtimeChannel | null>(null);
  const ordersDebounce     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTimer       = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickTimer          = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Data fetchers ───────────────────────────────────────────────────────────

  const fetchData = useCallback(async (bid: string) => {
    const [tablesRes, tabsRes, callsRes] = await Promise.all([
      supabase
        .from("tables")
        .select("id, label, floor, seats, sort, room_id, is_reserved, party_size, combined_into")
        .eq("business_id", bid)
        .eq("is_active", true)
        .order("floor", { ascending: true })
        .order("sort", { ascending: true })
        .order("label", { ascending: true }),
      supabase
        .from("table_tabs")
        .select("id, table_id, created_at, status")
        .eq("business_id", bid)
        .eq("status", "open"),
      supabase
        .from("service_calls")
        .select("id, status, type, room_id, table_label, created_at")
        .eq("business_id", bid)
        .in("status", ["pending", "acknowledged"]),
    ]);

    if (tablesRes.error || tabsRes.error || callsRes.error) {
      throw tablesRes.error ?? tabsRes.error ?? callsRes.error;
    }

    setTables((tablesRes.data ?? []) as TableRow[]);
    setTabs((tabsRes.data ?? []) as TabRow[]);
    setCalls((callsRes.data ?? []) as CallRow[]);
  }, []);

  const fetchTodayReservations = useCallback(async (bid: string) => {
    const start = dayStart();
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const { data } = await supabase
      .from("reservations")
      .select("id, reserved_at, party_size, event_type, status, customer:reservation_customers(first_name, last_name), reservation_tables(table_id)")
      .eq("business_id", bid)
      .gte("reserved_at", start.toISOString())
      .lt("reserved_at", end.toISOString())
      .order("reserved_at", { ascending: true });
    setTodayReservations((data as ReservationForFloor[] | null) ?? []);
  }, []);

  /**
   * Fetch the set of table_ids that have at least one open (unpaid, uncanceled)
   * order. The POS creates `orders`, not `table_tabs`, so this is the correct
   * source for POS-driven occupancy.
   */
  const fetchOccupancy = useCallback(async (bid: string) => {
    const { data } = await supabase
      .from("orders")
      .select("table_id")
      .eq("business_id", bid)
      .is("paid_at", null)
      .is("canceled_at", null)
      .not("table_id", "is", null);
    const ids = new Set<string>();
    for (const row of (data ?? []) as { table_id: string | null }[]) {
      if (row.table_id) ids.add(row.table_id);
    }
    setOccupiedByOrder(ids);
  }, []);

  // ── Bootstrap ───────────────────────────────────────────────────────────────

  useEffect(() => {
    let active = true;

    void (async () => {
      if (!isSupabaseConfigured) {
        setTables(DEMO_TABLES);
        setTabs(DEMO_TABS);
        setCalls(DEMO_CALLS);
        setTodayReservations(DEMO_RESERVATIONS_TODAY);
        setLoading(false);
        return;
      }

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

        await Promise.all([fetchData(bid), fetchTodayReservations(bid), fetchOccupancy(bid)]);
        if (!active) return;

        // ── Realtime: reservations ────────────────────────────────────────
        reservationsChannel.current = supabase
          .channel(`floor-reservations-${bid}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "reservations", filter: `business_id=eq.${bid}` },
            () => { void fetchTodayReservations(bid).catch(() => {}); },
          )
          .subscribe();

        // ── Realtime: tables (party_size live update) ─────────────────────
        tablesChannel.current = supabase
          .channel(`floor-tables-${bid}`)
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "tables", filter: `business_id=eq.${bid}` },
            () => { void fetchData(bid).catch(() => {}); },
          )
          .subscribe();

        // ── Realtime: table_tabs ──────────────────────────────────────────
        tabsChannel.current = supabase
          .channel(`floor-tabs-${bid}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "table_tabs", filter: `business_id=eq.${bid}` },
            () => { void fetchData(bid).catch(() => {}); },
          )
          .subscribe();

        // ── Realtime: service_calls ───────────────────────────────────────
        callsChannel.current = supabase
          .channel(`floor-calls-${bid}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "service_calls", filter: `business_id=eq.${bid}` },
            () => { void fetchData(bid).catch(() => {}); },
          )
          .subscribe();

        // ── Realtime: orders (INSERT/UPDATE → refresh occupancy) ──────────
        ordersChannel.current = supabase
          .channel(`floor-orders-${bid}`)
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "orders", filter: `business_id=eq.${bid}` },
            () => {
              if (ordersDebounce.current) clearTimeout(ordersDebounce.current);
              ordersDebounce.current = setTimeout(() => { void fetchOccupancy(bid).catch(() => {}); }, 600);
            },
          )
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "orders", filter: `business_id=eq.${bid}` },
            () => {
              if (ordersDebounce.current) clearTimeout(ordersDebounce.current);
              ordersDebounce.current = setTimeout(() => { void fetchOccupancy(bid).catch(() => {}); }, 600);
            },
          )
          .subscribe();

        // ── 30s fallback refresh ─────────────────────────────────────────
        refreshTimer.current = setInterval(() => {
          if (bizIdRef.current) void fetchData(bizIdRef.current).catch(() => {});
        }, 30_000);

        // ── 60s tick for elapsed-time re-render only (no re-fetch) ───────
        tickTimer.current = setInterval(() => {
          setTick((n) => n + 1);
        }, 60_000);
      } catch {
        if (active) setLoadError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
      if (reservationsChannel.current) void supabase.removeChannel(reservationsChannel.current);
      if (tablesChannel.current) void supabase.removeChannel(tablesChannel.current);
      if (tabsChannel.current)  void supabase.removeChannel(tabsChannel.current);
      if (callsChannel.current) void supabase.removeChannel(callsChannel.current);
      if (ordersChannel.current) void supabase.removeChannel(ordersChannel.current);
      if (ordersDebounce.current) clearTimeout(ordersDebounce.current);
      if (refreshTimer.current) clearInterval(refreshTimer.current);
      if (tickTimer.current)    clearInterval(tickTimer.current);
    };
  }, [fetchData, fetchTodayReservations, fetchOccupancy]);

  // ── Derivation ──────────────────────────────────────────────────────────────

  // occupiedByTable: tableId → earliest open tab created_at (MIN)
  const occupiedByTable = new Map<string, string>();
  for (const tab of tabs) {
    const existing = occupiedByTable.get(tab.table_id);
    if (!existing || tab.created_at < existing) {
      occupiedByTable.set(tab.table_id, tab.created_at);
    }
  }

  // Indices for service_call → table mapping
  const roomToTableId  = new Map<string, string>();
  const labelToTableId = new Map<string, string>();
  for (const tbl of tables) {
    if (tbl.room_id) roomToTableId.set(tbl.room_id, tbl.id);
    labelToTableId.set(tbl.label.trim().toLowerCase(), tbl.id);
  }

  // callsByTable: tableId → CallRow[]
  const callsByTable = new Map<string, CallRow[]>();
  let callsWithoutTable = 0;
  for (const sc of calls) {
    let tid: string | undefined;
    if (sc.room_id && roomToTableId.has(sc.room_id)) {
      tid = roomToTableId.get(sc.room_id);
    } else if (sc.table_label) {
      tid = labelToTableId.get(sc.table_label.trim().toLowerCase());
    }
    if (tid) {
      const arr = callsByTable.get(tid) ?? [];
      arr.push(sc);
      callsByTable.set(tid, arr);
    } else {
      callsWithoutTable++;
    }
  }

  // Combined-table helpers: label map + secondary count per primary.
  const labelById = new Map(tables.map((tbl) => [tbl.id, tbl.label]));
  const secondaryCount = new Map<string, number>();
  for (const tbl of tables) {
    if (tbl.combined_into) secondaryCount.set(tbl.combined_into, (secondaryCount.get(tbl.combined_into) ?? 0) + 1);
  }

  // Derived table states — 3-state: occupied > reserved > free.
  const derived: DerivedTable[] = tables.map((tbl) => {
    const { state, hasCall } = deriveState(
      tbl.id, tbl.party_size, tbl.is_reserved, tbl.combined_into, occupiedByTable, occupiedByOrder, callsByTable,
    );
    return {
      id:                    tbl.id,
      label:                 tbl.label,
      floor:                 tbl.floor,
      seats:                 tbl.seats,
      state,
      hasCall,
      minOpenAt:             occupiedByTable.get(tbl.id) ?? null,
      isReserved:            tbl.is_reserved,
      party_size:            tbl.party_size,
      combined_into:         tbl.combined_into,
      combinedLabel:         tbl.combined_into ? (labelById.get(tbl.combined_into) ?? null) : null,
      combinedSecondaryCount: secondaryCount.get(tbl.id) ?? 0,
    };
  });

  // Quick reservation toggle for floor cards (F8): calls RPC then re-fetches.
  const handleToggleReserved = useCallback(async (tableId: string, currentlyReserved: boolean) => {
    const bid = bizIdRef.current;
    if (!bid || !isSupabaseConfigured) return;
    await supabase.rpc("set_table_reserved", { p_table_id: tableId, p_reserved: !currentlyReserved });
    void fetchData(bid).catch(() => {});
  }, [fetchData]);

  // Summary counters (3-state)
  const occupiedCount = derived.filter((d) => d.state === "occupied").length;
  const freeCount     = derived.filter((d) => d.state === "free").length;
  const billCount     = derived.filter((d) => d.state === "reserved").length;

  // Floors in first-seen order (already sorted by the query)
  const floors: string[] = [];
  for (const d of derived) {
    if (!floors.includes(d.floor)) floors.push(d.floor);
  }

  // ── Render states ────────────────────────────────────────────────────────────

  if (noBusiness) {
    return <Notice>{t("floorNoBusiness")}</Notice>;
  }

  if (loading) {
    return <Notice>{tCommon("loading")}</Notice>;
  }

  if (loadError) {
    return (
      <Notice style={{ color: "var(--db-danger)" }}>
        {t("tablesLoadError")}
      </Notice>
    );
  }

  if (tables.length === 0) {
    return (
      <div style={{ padding: "40px 24px", textAlign: "center" }}>
        <p style={{ color: "var(--db-text-secondary)", fontSize: "14px", margin: "0 0 6px" }}>
          {t("floorEmpty")}
        </p>
        <p style={{ color: "var(--db-text-tertiary)", fontSize: "13px", margin: 0 }}>
          {t("floorEmptyHint")}
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "20px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--db-text-primary)", margin: 0 }}>
          {t("floorTitle")}
        </h1>
        <span style={{ fontSize: "13px", color: "var(--db-text-secondary)" }}>
          {t("floorCountersSummary", { occupied: occupiedCount, free: freeCount, bill: billCount })}
        </span>
      </div>

      {/* ── Zones ── */}
      {floors.map((floor) => {
        const floorTables = derived.filter((d) => d.floor === floor);
        return (
          <div key={floor} style={{ marginBottom: "28px" }}>
            {floors.length > 1 && (
              <h2 style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--db-text-tertiary)", margin: "0 0 12px" }}>
                {floor || t("floorNoZone")}
              </h2>
            )}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                gap: "12px",
              }}
            >
              {floorTables.map((tbl) => (
                <TableCard
                  key={tbl.id}
                  table={tbl}
                  t={t}
                  onToggleReserved={() => void handleToggleReserved(tbl.id, tbl.isReserved)}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* ── Calls without a table ── */}
      {callsWithoutTable > 0 && (
        <p style={{ fontSize: "12px", color: "var(--db-text-tertiary)", marginTop: "8px" }}>
          {t("floorCallsWithoutTable", { count: callsWithoutTable })}
        </p>
      )}

      {/* ── Today's Reservations ── */}
      <div style={{ marginTop: "36px" }}>
        <h2
          style={{
            fontSize: "11px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--db-text-tertiary)",
            margin: "0 0 12px",
          }}
        >
          {t("floorTodayReservations")}
        </h2>
        {todayReservations.length === 0 ? (
          <p style={{ fontSize: "13px", color: "var(--db-text-tertiary)" }}>
            {t("floorNoReservationsToday")}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {todayReservations.map((res) => (
              <TodayResRow key={res.id} res={res} tables={tables} t={t} />
            ))}
          </div>
        )}
      </div>

      {/* ── Animation styles ── */}
      <style>{`
        @keyframes floor-pulse {
          0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--db-warning) 40%, transparent); }
          50%       { box-shadow: 0 0 0 5px transparent; }
        }
        .floor-card-pulse {
          animation: floor-pulse 1.8s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

// ── TableCard ─────────────────────────────────────────────────────────────────

function TableCard({
  table,
  t,
  onToggleReserved,
}: {
  table: DerivedTable;
  t: ReturnType<typeof useTranslations>;
  onToggleReserved?: () => void;
}) {
  const colors = stateColor(table.state);

  // Combined secondary: override label with "Combinada con {primary}"
  const stateLabel = table.combined_into && table.combinedLabel
    ? t("floorCombinedWith", { label: table.combinedLabel })
    : (() => {
        switch (table.state) {
          case "free":     return t("floorStateFree");
          case "occupied": return t("floorStateOccupied");
          case "reserved": return t("floorStateReserved");
        }
      })();

  return (
    <div
      className={table.hasCall ? "floor-card-pulse" : undefined}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "4px",
        padding: "14px 10px",
        borderRadius: "var(--db-radius-card)",
        background: colors.background,
        border: colors.border,
        minHeight: "100px",
        textAlign: "center",
      }}
    >
      {/* Reservation quick-toggle — top-left corner (F8) */}
      {onToggleReserved && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleReserved(); }}
          aria-label={t("floorToggleReservedAria", { label: table.label })}
          title={t("floorToggleReservedAria", { label: table.label })}
          style={{
            position: "absolute",
            top: "6px",
            left: "6px",
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            color: table.isReserved ? "var(--db-danger)" : "var(--db-text-tertiary)",
            display: "flex",
            opacity: table.isReserved ? 1 : 0.45,
          }}
        >
          <IconCalendar size={14} />
        </button>
      )}

      {/* Service call bell — top-right corner */}
      {table.hasCall && (
        <span
          aria-label={t("floorCallBellAria", { label: table.label })}
          title={t("floorCallBellAria", { label: table.label })}
          style={{
            position: "absolute",
            top: "6px",
            right: "6px",
            color: "var(--db-warning)",
            display: "flex",
          }}
        >
          <IconBell size={16} />
        </span>
      )}

      {/* Table label (number) */}
      <span style={{ fontSize: "22px", fontWeight: 800, color: colors.color, letterSpacing: "-0.02em", lineHeight: 1 }}>
        {table.label}
      </span>

      {/* State text label — always present for accessibility */}
      <span style={{ fontSize: "11px", fontWeight: 600, color: colors.color, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {stateLabel}
      </span>

      {/* Primary table: show count of annexed secondaries */}
      {table.combinedSecondaryCount > 0 && (
        <span
          style={{
            fontSize: "10px",
            fontWeight: 700,
            color: "var(--db-brand)",
            background: "color-mix(in srgb, var(--db-brand) 15%, transparent)",
            borderRadius: "999px",
            padding: "1px 6px",
          }}
        >
          ＋{table.combinedSecondaryCount}
        </span>
      )}

      {/* Live guest count set by the POS waiter */}
      {table.party_size != null && table.party_size > 0 && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "11px", color: "var(--db-text-tertiary)" }}>
          <IconUsers size={11} />
          {table.party_size}
        </span>
      )}

      {/* Elapsed time — only when occupied */}
      {table.minOpenAt && table.state === "occupied" && (
        <span style={{ fontSize: "11px", color: "var(--db-text-tertiary)", marginTop: "2px" }}>
          {elapsed(table.minOpenAt, t)}
        </span>
      )}
    </div>
  );
}

// ── TodayResRow ───────────────────────────────────────────────────────────────

function TodayResRow({
  res,
  tables,
  t,
}: {
  res: ReservationForFloor;
  tables: TableRow[];
  t: ReturnType<typeof useTranslations>;
}) {
  const tableMap = new Map(tables.map((tbl) => [tbl.id, tbl.label]));
  const tableLabels =
    res.reservation_tables.length > 0
      ? res.reservation_tables.map((rt) => tableMap.get(rt.table_id) ?? rt.table_id.slice(-4)).join(", ")
      : t("floorNoTableAssigned");

  const customerName =
    [res.customer?.first_name, res.customer?.last_name].filter(Boolean).join(" ") || "—";

  const statusMeta: Record<string, { bg: string; color: string; label: string }> = {
    pending:   { bg: "rgba(245,158,11,0.15)",  color: "var(--db-warning)",        label: t("orderStatusPending") },
    arrived:   { bg: "rgba(29,158,117,0.15)",  color: "var(--db-success)",        label: t("resStatusArrived") },
    no_show:   { bg: "rgba(239,68,68,0.08)",   color: "var(--db-danger)",         label: t("reservationsStatusNoShow") },
    cancelled: { bg: "var(--db-bg-elevated)",  color: "var(--db-text-tertiary)",  label: t("resStatusCancelled") },
  };
  const sm = statusMeta[res.status] ?? statusMeta.pending;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        flexWrap: "wrap",
        background: "var(--db-bg-surface)",
        border: "1px solid var(--db-border)",
        borderRadius: "var(--db-radius)",
        padding: "10px 14px",
      }}
    >
      <span
        style={{
          fontSize: "13px",
          fontWeight: 700,
          color: "var(--db-text-secondary)",
          minWidth: "44px",
          flexShrink: 0,
        }}
      >
        {resFormatTime(res.reserved_at)}
      </span>
      <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--db-text-primary)", flex: 1, minWidth: "100px" }}>
        {customerName}
      </span>
      <span style={{ fontSize: "12px", color: "var(--db-text-tertiary)", whiteSpace: "nowrap" }}>
        {res.party_size} pax
      </span>
      <span style={{ fontSize: "12px", color: "var(--db-text-secondary)", whiteSpace: "nowrap" }}>
        {tableLabels}
      </span>
      <span
        style={{
          padding: "2px 8px",
          borderRadius: "999px",
          fontSize: "11px",
          fontWeight: 600,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          background: sm.bg,
          color: sm.color,
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {sm.label}
      </span>
    </div>
  );
}

// ── Notice helper ─────────────────────────────────────────────────────────────

function Notice({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        padding: "48px 24px",
        textAlign: "center",
        color: "var(--db-text-secondary)",
        fontSize: "14px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
