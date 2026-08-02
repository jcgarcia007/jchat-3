/**
 * JChat 3.0 — Dashboard Reservations (F9-B)
 *
 * Staff-facing reservation flow:
 *  - Create reservations via create_reservation RPC (links customer + tables, marks
 *    tables reserved — atomic). No direct INSERT/UPDATE to reservations/
 *    reservation_customers/reservation_tables.
 *  - Phone-based customer auto-populate via search_reservation_customers RPC.
 *  - Status transitions: pending → cancelled / no_show (staff here);
 *    pending → arrived (floor page, F9-C — NOT here).
 *  - Calendar + List views; filter by status; Realtime refresh.
 *
 * event_type values stored in DB are stable English keys:
 *   birthday | anniversary | business | casual | other
 * Only the LABEL shown to the user is translated.
 */

"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  IconCalendarEvent,
  IconList,
  IconCheck,
  IconAlertCircle,
  IconClock,
  IconUsers,
  IconNotes,
  IconRefresh,
  IconCalendarTime,
  IconPlus,
  IconPhone,
  IconX,
} from "@tabler/icons-react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { resolveActiveBusiness } from "@/lib/business";
import { NoBusinessCTA } from "@/components/dashboard/NoBusinessCTA";
import type { TFn } from "@/lib/tabSemantics";

// ── Types ─────────────────────────────────────────────────────────────────────

type ReservationStatus = "pending" | "arrived" | "no_show" | "cancelled";
type ViewMode = "calendar" | "list";
type FilterStatus = "all" | ReservationStatus;

interface ReservationCustomer {
  id: string;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
}

interface TableOption {
  id: string;
  label: string;
  is_reserved: boolean;
}

interface ReservationTableLink {
  table_id: string;
}

interface Reservation {
  id: string;
  business_id: string;
  customer_id: string | null;
  user_id: string | null;
  reserved_at: string;
  party_size: number;
  event_type: string | null;
  special_requests: string | null;
  status: ReservationStatus;
  is_waitlist: boolean;
  created_at: string;
  customer?: ReservationCustomer | null;
  reservation_tables?: ReservationTableLink[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const EVENT_TYPES = [
  "birthday",
  "anniversary",
  "business",
  "casual",
  "other",
] as const;

const EVENT_TYPE_KEYS: Record<string, string> = {
  birthday: "resEventBirthday",
  anniversary: "resEventAnniversary",
  business: "resEventBusiness",
  casual: "resEventCasual",
  other: "resEventOther",
};

// ── Demo data ─────────────────────────────────────────────────────────────────

function makeDemoDate(offsetDays: number, hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

const DEMO_TABLES: TableOption[] = [
  { id: "demo-tbl-1", label: "Table 1", is_reserved: false },
  { id: "demo-tbl-2", label: "Table 2", is_reserved: true },
  { id: "demo-tbl-3", label: "Bar Seat A", is_reserved: false },
  { id: "demo-tbl-4", label: "Patio 1", is_reserved: false },
];

const DEMO_CUSTOMERS: ReservationCustomer[] = [
  { id: "demo-c1", phone: "+1 555-0101", first_name: "Alex", last_name: "Rivera" },
  { id: "demo-c2", phone: "+1 555-0102", first_name: "Jamie", last_name: "Lee" },
  { id: "demo-c3", phone: "+1 555-0103", first_name: "Morgan", last_name: "Park" },
  { id: "demo-c4", phone: "+1 555-0104", first_name: "Sam", last_name: "Kim" },
  { id: "demo-c5", phone: "+1 555-0105", first_name: "Taylor", last_name: "Wong" },
];

const DEMO_RESERVATIONS: Reservation[] = [
  {
    id: "demo-res-1",
    business_id: "demo-biz",
    customer_id: "demo-c1",
    user_id: null,
    reserved_at: makeDemoDate(1, 19),
    party_size: 4,
    event_type: "birthday",
    special_requests: "Window table please",
    status: "pending",
    is_waitlist: false,
    created_at: new Date().toISOString(),
    customer: DEMO_CUSTOMERS[0],
    reservation_tables: [{ table_id: "demo-tbl-1" }],
  },
  {
    id: "demo-res-2",
    business_id: "demo-biz",
    customer_id: "demo-c2",
    user_id: null,
    reserved_at: makeDemoDate(1, 20),
    party_size: 2,
    event_type: "anniversary",
    special_requests: null,
    status: "arrived",
    is_waitlist: false,
    created_at: new Date().toISOString(),
    customer: DEMO_CUSTOMERS[1],
    reservation_tables: [{ table_id: "demo-tbl-2" }],
  },
  {
    id: "demo-res-3",
    business_id: "demo-biz",
    customer_id: "demo-c3",
    user_id: null,
    reserved_at: makeDemoDate(2, 12),
    party_size: 6,
    event_type: "casual",
    special_requests: "Need a high chair",
    status: "pending",
    is_waitlist: false,
    created_at: new Date().toISOString(),
    customer: DEMO_CUSTOMERS[2],
    reservation_tables: [{ table_id: "demo-tbl-3" }, { table_id: "demo-tbl-4" }],
  },
  {
    id: "demo-res-4",
    business_id: "demo-biz",
    customer_id: "demo-c4",
    user_id: null,
    reserved_at: makeDemoDate(0, 13),
    party_size: 3,
    event_type: null,
    special_requests: null,
    status: "no_show",
    is_waitlist: false,
    created_at: new Date().toISOString(),
    customer: DEMO_CUSTOMERS[3],
    reservation_tables: [{ table_id: "demo-tbl-1" }],
  },
  {
    id: "demo-res-5",
    business_id: "demo-biz",
    customer_id: "demo-c5",
    user_id: null,
    reserved_at: makeDemoDate(3, 18),
    party_size: 5,
    event_type: "business",
    special_requests: "Projector screen requested",
    status: "pending",
    is_waitlist: true,
    created_at: new Date().toISOString(),
    customer: DEMO_CUSTOMERS[4],
    reservation_tables: [{ table_id: "demo-tbl-4" }],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function isoDateOnly(iso: string): string {
  return iso.slice(0, 10);
}

function customerLabel(r: Reservation): string {
  const c = r.customer;
  if (!c) return "—";
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
  if (name) return name;
  if (c.phone) return c.phone;
  return "—";
}

function tableLabels(r: Reservation, tables: TableOption[]): string {
  if (!r.reservation_tables || r.reservation_tables.length === 0) return "—";
  const tableMap = new Map(tables.map((t) => [t.id, t.label]));
  return r.reservation_tables
    .map((rt) => tableMap.get(rt.table_id) ?? rt.table_id.slice(-4))
    .join(", ");
}

// ── StatusBadge ───────────────────────────────────────────────────────────────

function getStatusMeta(t: TFn): Record<
  ReservationStatus,
  { label: string; bg: string; color: string }
> {
  return {
    pending: {
      label: t("orderStatusPending"),
      bg: "rgba(245,158,11,0.15)",
      color: "var(--db-warning)",
    },
    arrived: {
      label: t("resStatusArrived"),
      bg: "rgba(29,158,117,0.15)",
      color: "var(--db-success)",
    },
    no_show: {
      label: t("reservationsStatusNoShow"),
      bg: "rgba(239,68,68,0.08)",
      color: "var(--db-danger)",
    },
    cancelled: {
      label: t("resStatusCancelled"),
      bg: "var(--db-bg-elevated)",
      color: "var(--db-text-tertiary)",
    },
  };
}

function StatusBadge({
  status,
  isWaitlist,
  t,
}: {
  status: ReservationStatus;
  isWaitlist: boolean;
  t: TFn;
}) {
  const m = getStatusMeta(t)[status] ?? getStatusMeta(t).pending;
  return (
    <span style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
      <span
        style={{
          padding: "2px 10px",
          borderRadius: "999px",
          fontSize: "11px",
          fontWeight: 600,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          background: m.bg,
          color: m.color,
          whiteSpace: "nowrap",
        }}
      >
        {m.label}
      </span>
      {isWaitlist && (
        <span
          style={{
            padding: "2px 8px",
            borderRadius: "999px",
            fontSize: "11px",
            fontWeight: 600,
            background: "rgba(124,58,237,0.15)",
            color: "var(--db-brand-purple, #7C3AED)",
            whiteSpace: "nowrap",
          }}
        >
          {t("reservationsWaitlistBadge")}
        </span>
      )}
    </span>
  );
}

// ── EventTypeBadge ────────────────────────────────────────────────────────────

function EventTypeBadge({ eventType, t }: { eventType: string | null; t: TFn }) {
  if (!eventType) return null;
  const key = EVENT_TYPE_KEYS[eventType];
  if (!key) return null;
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: "999px",
        fontSize: "11px",
        fontWeight: 500,
        background: "var(--db-accent-bg)",
        color: "var(--db-accent)",
        whiteSpace: "nowrap",
      }}
    >
      {t(key)}
    </span>
  );
}

// ── AlertBanner ───────────────────────────────────────────────────────────────

function AlertBanner({
  type,
  message,
}: {
  type: "error" | "success" | "warning";
  message: string;
}) {
  const styles: Record<string, { bg: string; color: string }> = {
    error: { bg: "rgba(239,68,68,0.12)", color: "var(--db-danger)" },
    success: { bg: "rgba(29,158,117,0.12)", color: "var(--db-success)" },
    warning: { bg: "rgba(245,158,11,0.12)", color: "var(--db-warning)" },
  };
  const s = styles[type] ?? styles.error;
  const Icon = type === "success" ? IconCheck : IconAlertCircle;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "12px 16px",
        borderRadius: "var(--db-radius)",
        background: s.bg,
        color: s.color,
        fontSize: "14px",
        marginBottom: "16px",
      }}
    >
      <Icon size={16} />
      {message}
    </div>
  );
}

// ── NewReservationForm ────────────────────────────────────────────────────────

interface NewReservationFormProps {
  businessId: string;
  tables: TableOption[];
  onCreated: () => void;
  onClose: () => void;
  t: TFn;
}

function NewReservationForm({
  businessId,
  tables,
  onCreated,
  onClose,
  t,
}: NewReservationFormProps) {
  const [phone, setPhone] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [suggestions, setSuggestions] = useState<ReservationCustomer[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);
  const [customerFound, setCustomerFound] = useState(false);

  const [reservedAt, setReservedAt] = useState("");
  const [partySize, setPartySize] = useState("2");
  const [selectedTableIds, setSelectedTableIds] = useState<Set<string>>(
    new Set()
  );
  const [eventType, setEventType] = useState("");
  const [specialRequests, setSpecialRequests] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canSubmit =
    firstName.trim().length > 0 &&
    selectedTableIds.size > 0 &&
    Number(partySize) >= 1 &&
    reservedAt.length > 0 &&
    !submitting;

  const handlePhoneChange = (value: string) => {
    setPhone(value);
    setCustomerFound(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      if (!isSupabaseConfigured) {
        setSearching(false);
        return;
      }
      try {
        const { data } = await supabase.rpc(
          "search_reservation_customers",
          { p_business_id: businessId, p_query: value.trim() }
        );
        const results = (data as ReservationCustomer[] | null) ?? [];
        if (results.length > 0) {
          setSuggestions(results);
          setShowSuggestions(true);
        } else {
          setSuggestions([]);
          setShowSuggestions(false);
        }
      } catch {
        setSuggestions([]);
        setShowSuggestions(false);
      } finally {
        setSearching(false);
      }
    }, 400);
  };

  const selectSuggestion = (c: ReservationCustomer) => {
    setPhone(c.phone ?? "");
    setFirstName(c.first_name ?? "");
    setLastName(c.last_name ?? "");
    setSuggestions([]);
    setShowSuggestions(false);
    setCustomerFound(true);
  };

  const toggleTable = (id: string) => {
    setSelectedTableIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setFormError(null);

    if (!isSupabaseConfigured) {
      setTimeout(() => {
        setSubmitting(false);
        onCreated();
      }, 600);
      return;
    }

    try {
      const { error: err } = await supabase.rpc("create_reservation", {
        p_business_id: businessId,
        p_reserved_at: new Date(reservedAt).toISOString(),
        p_party_size: Number(partySize),
        p_table_ids: Array.from(selectedTableIds),
        p_event_type: eventType || null,
        p_phone: phone.trim() || null,
        p_first_name: firstName.trim() || null,
        p_last_name: lastName.trim() || null,
        p_special_requests: specialRequests.trim() || null,
      });
      if (err) throw err;
      onCreated();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setFormError(t("resNewError", { msg }));
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 12px",
    borderRadius: "var(--db-radius)",
    border: "1px solid var(--db-border)",
    background: "var(--db-bg-elevated)",
    color: "var(--db-text-primary)",
    fontSize: "14px",
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--db-text-secondary)",
    marginBottom: "6px",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  };

  const minDateTime = new Date().toISOString().slice(0, 16);

  return (
    <div
      style={{
        background: "var(--db-bg-surface)",
        border: "1px solid var(--db-accent)",
        borderRadius: "var(--db-radius-card)",
        padding: "24px",
        marginBottom: "24px",
      }}
    >
      {/* Form header */}
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
            color: "var(--db-text-primary)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <IconCalendarTime size={18} color="var(--db-accent)" />
          {t("resNewTitle")}
        </h2>
        <button
          onClick={onClose}
          title={t("resNewCancelButton")}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            borderRadius: "var(--db-radius)",
            border: "1px solid var(--db-border)",
            background: "transparent",
            color: "var(--db-text-tertiary)",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <IconX size={14} />
        </button>
      </div>

      {formError && <AlertBanner type="error" message={formError} />}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "20px",
        }}
      >
        {/* ─── Customer section ─── */}
        <div>
          <p
            style={{
              fontSize: "12px",
              fontWeight: 700,
              color: "var(--db-accent)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: "14px",
            }}
          >
            <IconPhone
              size={12}
              style={{ display: "inline", marginRight: 5, verticalAlign: "middle" }}
            />
            {t("resNewPhone")}
          </p>

          {/* Phone with suggestions */}
          <div style={{ position: "relative", marginBottom: "14px" }}>
            <label style={labelStyle}>{t("resNewPhone")}</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => handlePhoneChange(e.target.value)}
              placeholder="+1 555-0000"
              style={inputStyle}
              autoComplete="off"
            />
            {searching && (
              <span
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(4px)",
                  fontSize: "11px",
                  color: "var(--db-text-tertiary)",
                }}
              >
                {t("resNewSearching")}
              </span>
            )}
            {showSuggestions && suggestions.length > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  left: 0,
                  right: 0,
                  background: "var(--db-bg-surface)",
                  border: "1px solid var(--db-border)",
                  borderRadius: "var(--db-radius)",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
                  zIndex: 50,
                  overflow: "hidden",
                }}
              >
                {suggestions.slice(0, 10).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => selectSuggestion(c)}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "10px 14px",
                      textAlign: "left",
                      border: "none",
                      borderBottom: "1px solid var(--db-border)",
                      background: "transparent",
                      color: "var(--db-text-primary)",
                      fontSize: "13px",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>
                      {[c.first_name, c.last_name].filter(Boolean).join(" ")}
                    </span>
                    {c.phone && (
                      <span
                        style={{
                          marginLeft: 8,
                          color: "var(--db-text-tertiary)",
                          fontSize: "12px",
                        }}
                      >
                        {c.phone}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {customerFound && (
            <div
              style={{
                fontSize: "12px",
                color: "var(--db-success)",
                marginBottom: "10px",
                display: "flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              <IconCheck size={12} />
              {t("resNewCustomerFound")}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={labelStyle}>{t("resNewFirstName")}</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>{t("resNewLastName")}</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>
        </div>

        {/* ─── Reservation details ─── */}
        <div>
          <p
            style={{
              fontSize: "12px",
              fontWeight: 700,
              color: "var(--db-accent)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: "14px",
            }}
          >
            <IconCalendarEvent
              size={12}
              style={{ display: "inline", marginRight: 5, verticalAlign: "middle" }}
            />
            {t("resNewDateTime")}
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: "12px",
              marginBottom: "14px",
            }}
          >
            <div>
              <label style={labelStyle}>{t("resNewDateTime")}</label>
              <input
                type="datetime-local"
                value={reservedAt}
                min={minDateTime}
                onChange={(e) => setReservedAt(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>{t("resNewPartySize")}</label>
              <input
                type="number"
                min={1}
                max={50}
                value={partySize}
                onChange={(e) => setPartySize(e.target.value)}
                style={{ ...inputStyle, width: "80px" }}
              />
            </div>
          </div>

          <div style={{ marginBottom: "14px" }}>
            <label style={labelStyle}>{t("resNewEventType")}</label>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              style={{ ...inputStyle }}
            >
              <option value="">—</option>
              {EVENT_TYPES.map((et) => (
                <option key={et} value={et}>
                  {t(EVENT_TYPE_KEYS[et])}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>{t("resNewNotes")}</label>
            <textarea
              value={specialRequests}
              onChange={(e) => setSpecialRequests(e.target.value)}
              rows={2}
              style={{
                ...inputStyle,
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />
          </div>
        </div>
      </div>

      {/* Table selector */}
      <div style={{ marginTop: "20px" }}>
        <label style={labelStyle}>{t("resNewTables")}</label>
        {tables.length === 0 ? (
          <p style={{ fontSize: "13px", color: "var(--db-text-tertiary)" }}>—</p>
        ) : (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              marginTop: "6px",
            }}
          >
            {tables.map((tbl) => {
              const selected = selectedTableIds.has(tbl.id);
              return (
                <button
                  key={tbl.id}
                  onClick={() => toggleTable(tbl.id)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "999px",
                    border: "1px solid",
                    borderColor: selected
                      ? "var(--db-accent)"
                      : "var(--db-border)",
                    background: selected ? "var(--db-accent-bg)" : "transparent",
                    color: selected
                      ? "var(--db-accent)"
                      : tbl.is_reserved
                      ? "var(--db-text-tertiary)"
                      : "var(--db-text-secondary)",
                    fontSize: "13px",
                    fontWeight: selected ? 600 : 400,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    opacity: tbl.is_reserved && !selected ? 0.6 : 1,
                  }}
                >
                  {tbl.label}
                  {tbl.is_reserved && !selected && (
                    <span style={{ marginLeft: 5, fontSize: "11px" }}>
                      ({t("floorStateReserved")})
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: "10px",
          marginTop: "24px",
        }}
      >
        <button
          onClick={onClose}
          style={{
            padding: "9px 18px",
            borderRadius: "var(--db-radius)",
            border: "1px solid var(--db-border)",
            background: "transparent",
            color: "var(--db-text-secondary)",
            fontSize: "13px",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          {t("resNewCancelButton")}
        </button>
        <button
          onClick={() => void handleSubmit()}
          disabled={!canSubmit}
          style={{
            padding: "9px 20px",
            borderRadius: "var(--db-radius)",
            border: "none",
            background: canSubmit ? "var(--db-accent)" : "var(--db-text-tertiary)",
            color: "var(--db-accent-text)",
            fontSize: "13px",
            fontWeight: 600,
            cursor: canSubmit ? "pointer" : "not-allowed",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <IconCheck size={14} />
          {submitting ? "…" : t("resNewConfirmButton")}
        </button>
      </div>
    </div>
  );
}

// ── ReservationRow ────────────────────────────────────────────────────────────

interface ReservationRowProps {
  reservation: Reservation;
  tables: TableOption[];
  actionLoading: string | null;
  onAction: (id: string, action: "cancelled" | "no_show") => void;
  t: TFn;
}

function ReservationRow({
  reservation: r,
  tables,
  actionLoading,
  onAction,
  t,
}: ReservationRowProps) {
  const busy = actionLoading === r.id;

  return (
    <div
      style={{
        background: "var(--db-bg-surface)",
        border: "1px solid var(--db-border)",
        borderRadius: "var(--db-radius-card)",
        padding: "16px 20px",
        display: "flex",
        alignItems: "flex-start",
        gap: "16px",
        flexWrap: "wrap",
      }}
    >
      {/* Time column */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          minWidth: "56px",
          gap: "2px",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: "var(--db-radius)",
            background: "var(--db-accent-bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <IconCalendarTime size={20} color="var(--db-accent)" />
        </div>
        <span
          style={{
            fontSize: "11px",
            color: "var(--db-text-tertiary)",
            textAlign: "center",
            marginTop: "4px",
          }}
        >
          {formatDateShort(r.reserved_at)}
        </span>
        <span
          style={{
            fontSize: "11px",
            color: "var(--db-text-secondary)",
            textAlign: "center",
            fontWeight: 600,
          }}
        >
          {formatTime(r.reserved_at)}
        </span>
      </div>

      {/* Main info */}
      <div style={{ flex: 1, minWidth: "160px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexWrap: "wrap",
            marginBottom: "6px",
          }}
        >
          <span
            style={{
              fontSize: "15px",
              fontWeight: 600,
              color: "var(--db-text-primary)",
            }}
          >
            {customerLabel(r)}
          </span>
          <StatusBadge status={r.status} isWaitlist={r.is_waitlist} t={t} />
          <EventTypeBadge eventType={r.event_type} t={t} />
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "14px",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "12px",
              color: "var(--db-text-tertiary)",
            }}
          >
            <IconUsers size={12} />
            {t("reservationsGuestCountPlural", { count: r.party_size })}
          </span>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "12px",
              color: "var(--db-text-tertiary)",
            }}
          >
            <IconClock size={12} />
            {formatDate(r.reserved_at)} · {formatTime(r.reserved_at)}
          </span>
          {tables.length > 0 && r.reservation_tables && r.reservation_tables.length > 0 && (
            <span
              style={{
                fontSize: "12px",
                color: "var(--db-text-tertiary)",
                fontWeight: 500,
              }}
            >
              {tableLabels(r, tables)}
            </span>
          )}
        </div>

        {r.special_requests && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "4px",
              marginTop: "6px",
            }}
          >
            <IconNotes
              size={12}
              color="var(--db-text-tertiary)"
              style={{ marginTop: 2, flexShrink: 0 }}
            />
            <span
              style={{
                fontSize: "12px",
                color: "var(--db-text-secondary)",
                fontStyle: "italic",
              }}
            >
              {r.special_requests}
            </span>
          </div>
        )}
      </div>

      {/* Action buttons — pending only; arrived/cancelled/no_show: no actions */}
      {r.status === "pending" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexShrink: 0,
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={() => onAction(r.id, "no_show")}
            disabled={busy}
            style={{
              padding: "6px 12px",
              borderRadius: "var(--db-radius)",
              border: "1px solid var(--db-border)",
              background: "transparent",
              color: "var(--db-text-secondary)",
              fontSize: "12px",
              fontWeight: 500,
              cursor: busy ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {busy ? "…" : t("reservationsStatusNoShow")}
          </button>
          <button
            onClick={() => onAction(r.id, "cancelled")}
            disabled={busy}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "6px 12px",
              borderRadius: "var(--db-radius)",
              border: "1px solid var(--db-danger)",
              background: "rgba(239,68,68,0.08)",
              color: "var(--db-danger)",
              fontSize: "12px",
              fontWeight: 600,
              cursor: busy ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            <IconX size={13} />
            {busy ? "…" : t("resNewCancelButton")}
          </button>
        </div>
      )}
    </div>
  );
}

// ── CalendarView ──────────────────────────────────────────────────────────────

interface CalendarViewProps {
  reservations: Reservation[];
  tables: TableOption[];
  actionLoading: string | null;
  onAction: (id: string, action: "cancelled" | "no_show") => void;
  t: TFn;
}

function CalendarView({
  reservations,
  tables,
  actionLoading,
  onAction,
  t,
}: CalendarViewProps) {
  const grouped: Record<string, Reservation[]> = {};
  for (const r of reservations) {
    const key = isoDateOnly(r.reserved_at);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  }

  const sortedDates = Object.keys(grouped).sort();

  if (sortedDates.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "60px 20px",
          color: "var(--db-text-tertiary)",
          gap: "12px",
        }}
      >
        <IconCalendarEvent size={40} />
        <p style={{ fontSize: "15px", color: "var(--db-text-secondary)" }}>
          {t("reservationsEmptyCalendar")}
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {sortedDates.map((date) => {
        const dayRes = grouped[date] ?? [];
        const d = new Date(date + "T00:00:00");
        const dayLabel = d.toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
        });

        return (
          <div key={date}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "12px",
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "var(--db-accent)",
                  flexShrink: 0,
                }}
              />
              <h3
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "var(--db-text-secondary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                {dayLabel}
              </h3>
              <span style={{ fontSize: "12px", color: "var(--db-text-tertiary)" }}>
                {t("reservationsCountPlural", { count: dayRes.length })}
              </span>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                paddingLeft: "18px",
                borderLeft: "2px solid var(--db-border)",
              }}
            >
              {dayRes
                .slice()
                .sort(
                  (a, b) =>
                    new Date(a.reserved_at).getTime() -
                    new Date(b.reserved_at).getTime()
                )
                .map((r) => (
                  <ReservationRow
                    key={r.id}
                    reservation={r}
                    tables={tables}
                    actionLoading={actionLoading}
                    onAction={onAction}
                    t={t}
                  />
                ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ReservationsPage() {
  const t = useTranslations("dashboardCommon");

  const [businessId, setBusinessId] = useState<string | null>(null);
  const [loadingBiz, setLoadingBiz] = useState(true);

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(false);

  const [tables, setTables] = useState<TableOption[]>([]);

  const [viewMode, setViewMode] = useState<ViewMode>("calendar");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);

  const channelRef = useRef<RealtimeChannel | null>(null);

  // ── Resolve business id ───────────────────────────────────────────────────
  const resolveBusinessId = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoadingBiz(false);
      return;
    }
    try {
      const res = await resolveActiveBusiness();
      if (!res.ok) {
        setLoadingBiz(false);
        return;
      }
      setBusinessId(res.business.id);
    } catch {
      // business not found — keep null
    } finally {
      setLoadingBiz(false);
    }
  }, []);

  // ── Load tables (for form selector + row display) ─────────────────────────
  const loadTables = useCallback(async (bizId: string) => {
    try {
      const { data } = await supabase
        .from("tables")
        .select("id, label, is_reserved")
        .eq("business_id", bizId)
        .eq("is_active", true)
        .order("label");
      setTables((data as TableOption[] | null) ?? []);
    } catch {
      // non-critical — form still works, labels just won't resolve
    }
  }, []);

  // ── Load reservations ────────────────────────────────────────────────────
  const loadReservations = useCallback(
    async (bizId: string, silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const { data, error: err } = await supabase
          .from("reservations")
          .select(
            "*, customer:reservation_customers(id, phone, first_name, last_name), reservation_tables(table_id)"
          )
          .eq("business_id", bizId)
          .order("reserved_at", { ascending: true })
          .limit(200);
        if (err) throw err;
        setReservations((data as unknown as Reservation[]) ?? []);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(t("reservationsLoadError", { msg }));
      } finally {
        setLoading(false);
      }
    },
    [t]
  );

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  useEffect(() => {
    void resolveBusinessId();
  }, [resolveBusinessId]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setReservations(DEMO_RESERVATIONS);
      setTables(DEMO_TABLES);
      return;
    }
    if (!businessId) return;

    void loadReservations(businessId);
    void loadTables(businessId);

    channelRef.current = supabase
      .channel(`reservations-f9-${businessId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "reservations",
          filter: `business_id=eq.${businessId}`,
        },
        () => {
          void loadReservations(businessId, true);
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [businessId, loadReservations, loadTables]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleAction = useCallback(
    async (id: string, action: "cancelled" | "no_show") => {
      setActionLoading(id);
      setError(null);
      setSuccess(null);

      if (!isSupabaseConfigured) {
        setReservations((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status: action } : r))
        );
        setSuccess(t("reservationsActionDoneFallback"));
        setActionLoading(null);
        return;
      }

      try {
        const { error: err } = await supabase.rpc("set_reservation_status", {
          p_reservation_id: id,
          p_status: action,
        });
        if (err) throw err;

        setSuccess(t("reservationsActionDoneFallback"));
        setReservations((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status: action } : r))
        );
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(t("reservationsActionError", { msg }));
      } finally {
        setActionLoading(null);
      }
    },
    [t]
  );

  // ── Created callback ──────────────────────────────────────────────────────
  const handleCreated = useCallback(() => {
    setShowForm(false);
    setSuccess(t("resNewSuccess"));
    if (businessId) {
      void loadReservations(businessId, true);
      void loadTables(businessId);
    }
  }, [businessId, loadReservations, loadTables, t]);

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered =
    filterStatus === "all"
      ? reservations
      : reservations.filter((r) => r.status === filterStatus);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const pendingCount = reservations.filter((r) => r.status === "pending").length;
  const arrivedCount = reservations.filter((r) => r.status === "arrived").length;
  const noShowCount = reservations.filter((r) => r.status === "no_show").length;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 900 }}>
      {/* Page header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: "24px",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "22px",
              fontWeight: 700,
              color: "var(--db-text-primary)",
              marginBottom: "4px",
            }}
          >
            {t("railReservas")}
          </h1>
          <p style={{ fontSize: "14px", color: "var(--db-text-secondary)" }}>
            {t("reservationsSubtitle")}
          </p>
        </div>

        {/* Toolbar */}
        <div
          style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}
        >
          {/* Nueva Reserva */}
          <button
            onClick={() => {
              setShowForm((v) => !v);
              setError(null);
              setSuccess(null);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              padding: "7px 14px",
              borderRadius: "var(--db-radius)",
              border: "none",
              background: showForm ? "var(--db-accent-dark, var(--db-accent))" : "var(--db-accent)",
              color: "var(--db-accent-text)",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            <IconPlus size={15} />
            {t("resNewTitle")}
          </button>

          {/* Refresh */}
          {isSupabaseConfigured && businessId && (
            <button
              onClick={() => {
                void loadReservations(businessId);
                void loadTables(businessId);
              }}
              disabled={loading}
              title={t("reservationsRefreshAria")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                padding: "7px 12px",
                borderRadius: "var(--db-radius)",
                border: "1px solid var(--db-border)",
                background: "transparent",
                color: "var(--db-text-secondary)",
                fontSize: "13px",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              <IconRefresh size={15} />
            </button>
          )}

          {/* View toggle */}
          <div
            style={{
              display: "flex",
              borderRadius: "var(--db-radius)",
              border: "1px solid var(--db-border)",
              overflow: "hidden",
            }}
          >
            {(
              [
                {
                  mode: "calendar",
                  icon: <IconCalendarEvent size={15} />,
                  label: t("reservationsViewCalendar"),
                },
                {
                  mode: "list",
                  icon: <IconList size={15} />,
                  label: t("reservationsViewList"),
                },
              ] as const
            ).map(({ mode, icon, label }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                title={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "7px 13px",
                  border: "none",
                  background:
                    viewMode === mode ? "var(--db-accent)" : "transparent",
                  color:
                    viewMode === mode
                      ? "var(--db-accent-text)"
                      : "var(--db-text-secondary)",
                  fontSize: "13px",
                  cursor: "pointer",
                  fontWeight: viewMode === mode ? 600 : 400,
                }}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div
        style={{
          display: "flex",
          gap: "12px",
          marginBottom: "20px",
          flexWrap: "wrap",
        }}
      >
        {[
          {
            label: t("orderStatusPending"),
            value: pendingCount,
            color: "var(--db-warning)",
          },
          {
            label: t("resStatusArrived"),
            value: arrivedCount,
            color: "var(--db-success)",
          },
          {
            label: t("reservationsStatusNoShow"),
            value: noShowCount,
            color: "var(--db-danger)",
          },
          {
            label: t("reservationsStatTotal"),
            value: reservations.length,
            color: "var(--db-accent)",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              background: "var(--db-bg-surface)",
              border: "1px solid var(--db-border)",
              borderRadius: "var(--db-radius-card)",
              padding: "14px 20px",
              minWidth: "100px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: "22px",
                fontWeight: 700,
                color: stat.color,
                lineHeight: 1,
                marginBottom: "4px",
              }}
            >
              {stat.value}
            </div>
            <div
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: "var(--db-text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Alerts */}
      {error && <AlertBanner type="error" message={error} />}
      {success && <AlertBanner type="success" message={success} />}

      {/* Demo mode notice */}
      {!isSupabaseConfigured && (
        <AlertBanner
          type="warning"
          message={t("reservationsDemoModeMessage")}
        />
      )}

      {/* Business not found */}
      {!loadingBiz && isSupabaseConfigured && !businessId && (
        <NoBusinessCTA message={t("reservationsNoBusinessMessage")} />
      )}

      {/* New reservation form */}
      {showForm && businessId && (
        <NewReservationForm
          businessId={businessId}
          tables={tables}
          onCreated={handleCreated}
          onClose={() => setShowForm(false)}
          t={t}
        />
      )}
      {showForm && !isSupabaseConfigured && (
        <NewReservationForm
          businessId="demo-biz"
          tables={DEMO_TABLES}
          onCreated={handleCreated}
          onClose={() => setShowForm(false)}
          t={t}
        />
      )}

      {/* Filter tabs */}
      <div
        style={{
          display: "flex",
          gap: "6px",
          marginBottom: "20px",
          flexWrap: "wrap",
        }}
      >
        {(
          [
            { key: "all", label: t("reservationsFilterAll") },
            { key: "pending", label: t("orderStatusPending") },
            { key: "arrived", label: t("resStatusArrived") },
            { key: "no_show", label: t("reservationsStatusNoShow") },
            { key: "cancelled", label: t("resStatusCancelled") },
          ] as { key: FilterStatus; label: string }[]
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilterStatus(key)}
            style={{
              padding: "6px 14px",
              borderRadius: "999px",
              border: "1px solid",
              borderColor:
                filterStatus === key ? "var(--db-accent)" : "var(--db-border)",
              background:
                filterStatus === key ? "var(--db-accent-bg)" : "transparent",
              color:
                filterStatus === key
                  ? "var(--db-accent)"
                  : "var(--db-text-secondary)",
              fontSize: "13px",
              fontWeight: filterStatus === key ? 600 : 400,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading && reservations.length === 0 ? (
        <div
          style={{
            padding: "60px 20px",
            textAlign: "center",
            color: "var(--db-text-tertiary)",
            fontSize: "14px",
          }}
        >
          {t("reservationsLoadingList")}
        </div>
      ) : viewMode === "calendar" ? (
        <CalendarView
          reservations={filtered}
          tables={tables}
          actionLoading={actionLoading}
          onAction={handleAction}
          t={t}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {filtered.length === 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "60px 20px",
                color: "var(--db-text-tertiary)",
                gap: "12px",
              }}
            >
              <IconCalendarEvent size={40} />
              <p
                style={{ fontSize: "15px", color: "var(--db-text-secondary)" }}
              >
                {t("reservationsEmptyFiltered")}
              </p>
            </div>
          ) : (
            filtered.map((r) => (
              <ReservationRow
                key={r.id}
                reservation={r}
                tables={tables}
                actionLoading={actionLoading}
                onAction={handleAction}
                t={t}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
