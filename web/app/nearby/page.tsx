/**
 * JChat 3.0 — Nearby Businesses Page (Task 2.13, web)
 *
 * Route: /nearby
 * Auth: public — no authentication required.
 *
 * "use client" — search, category chips, and city selector all require state.
 *
 * Features:
 *   - City / area selector (web substitute for GPS distance, which is Stage 4)
 *   - Real-time search bar (filters name + category)
 *   - Category filter chips
 *   - Open/closed badge (computed from businesses.hours vs now)
 *   - Room count per business
 *   - Tap → link to /b/[slug]
 *
 * Stubs:
 *   - Active user count: 0 // TODO(presence): live active counts
 *   - Distance: n/a on web (city selector used instead)
 *
 * Colors: var(--bg-*), var(--text-*), var(--color-*) only — no hardcoded hex.
 * Icons: @tabler/icons-react only.
 * // TODO(i18n): all strings are English; wire to i18n once the layer is set up.
 */

"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  IconBuildingStore,
  IconMapPin,
  IconMessage,
  IconSearch,
  IconUsers,
  IconX,
  IconChevronDown,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HoursEntry {
  open: string;   // "HH:MM"
  close: string;  // "HH:MM"
  closed?: boolean;
}

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type Hours = Partial<Record<DayKey, HoursEntry>>;

interface BusinessRow {
  id: string;
  name: string;
  slug: string;
  category: string;
  address: string | null;
  icon_emoji: string | null;
  hours: Hours | null;
  room_count: number;
  city: string;
  /** // TODO(presence): replace 0 with live active counts from presence channel */
  active_users: number;
}

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

const DEMO_BUSINESSES: BusinessRow[] = [
  {
    id: "demo-1",
    name: "The Blue Note",
    slug: "the-blue-note",
    category: "Bar & Lounge",
    address: "123 Main St, Miami, FL",
    icon_emoji: "🎵",
    hours: {
      mon: { open: "17:00", close: "02:00" },
      tue: { open: "17:00", close: "02:00" },
      wed: { open: "17:00", close: "02:00" },
      thu: { open: "17:00", close: "02:00" },
      fri: { open: "16:00", close: "03:00" },
      sat: { open: "14:00", close: "03:00" },
      sun: { open: "14:00", close: "00:00" },
    },
    room_count: 3,
    city: "Miami",
    active_users: 0,
  },
  {
    id: "demo-2",
    name: "Rooftop Garden",
    slug: "rooftop-garden",
    category: "Restaurant",
    address: "456 Oak Ave, New York, NY",
    icon_emoji: "🌿",
    hours: {
      mon: { open: "11:00", close: "22:00" },
      tue: { open: "11:00", close: "22:00" },
      wed: { open: "11:00", close: "22:00" },
      thu: { open: "11:00", close: "22:00" },
      fri: { open: "11:00", close: "23:00" },
      sat: { open: "10:00", close: "23:00" },
      sun: { closed: true, open: "00:00", close: "00:00" },
    },
    room_count: 2,
    city: "New York",
    active_users: 0,
  },
  {
    id: "demo-3",
    name: "Neon Club",
    slug: "neon-club",
    category: "Nightclub",
    address: "789 Electric Blvd, Miami, FL",
    icon_emoji: "🌟",
    hours: {
      mon: { closed: true, open: "00:00", close: "00:00" },
      tue: { closed: true, open: "00:00", close: "00:00" },
      wed: { closed: true, open: "00:00", close: "00:00" },
      thu: { open: "22:00", close: "05:00" },
      fri: { open: "22:00", close: "06:00" },
      sat: { open: "22:00", close: "06:00" },
      sun: { closed: true, open: "00:00", close: "00:00" },
    },
    room_count: 5,
    city: "Miami",
    active_users: 0,
  },
  {
    id: "demo-4",
    name: "Coffee House Co.",
    slug: "coffee-house-co",
    category: "Café",
    address: "321 Brew Street, Los Angeles, CA",
    icon_emoji: "☕",
    hours: {
      mon: { open: "07:00", close: "20:00" },
      tue: { open: "07:00", close: "20:00" },
      wed: { open: "07:00", close: "20:00" },
      thu: { open: "07:00", close: "20:00" },
      fri: { open: "07:00", close: "21:00" },
      sat: { open: "08:00", close: "21:00" },
      sun: { open: "08:00", close: "18:00" },
    },
    room_count: 1,
    city: "Los Angeles",
    active_users: 0,
  },
  {
    id: "demo-5",
    name: "Sports Arena Bar",
    slug: "sports-arena-bar",
    category: "Sports Bar",
    address: "55 Stadium Way, Chicago, IL",
    icon_emoji: "🏟️",
    hours: {
      mon: { open: "12:00", close: "01:00" },
      tue: { open: "12:00", close: "01:00" },
      wed: { open: "12:00", close: "01:00" },
      thu: { open: "12:00", close: "02:00" },
      fri: { open: "12:00", close: "03:00" },
      sat: { open: "11:00", close: "03:00" },
      sun: { open: "11:00", close: "00:00" },
    },
    room_count: 4,
    city: "Chicago",
    active_users: 0,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_KEYS: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function getTodayKey(): DayKey {
  return DAY_KEYS[new Date().getDay()];
}

function isOpenNow(hours: Hours | null): boolean {
  if (!hours) return false;
  const todayKey = getTodayKey();
  const entry = hours[todayKey];
  if (!entry || entry.closed) return false;

  const now = new Date();
  const [openH, openM] = entry.open.split(":").map(Number);
  const [closeH, closeM] = entry.close.split(":").map(Number);

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const openMinutes = openH * 60 + openM;
  let closeMinutes = closeH * 60 + closeM;

  // Handle midnight-crossing hours (e.g. open: 22:00, close: 05:00)
  if (closeMinutes < openMinutes) {
    closeMinutes += 24 * 60;
  }

  return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
}

/** Extract a city name from address string ("123 Main St, Miami, FL" → "Miami") */
function extractCity(address: string | null): string {
  if (!address) return "Unknown";
  const parts = address.split(",");
  if (parts.length >= 2) {
    return parts[parts.length - 2].trim();
  }
  return address.trim();
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchBusinesses(): Promise<BusinessRow[]> {
  if (!isSupabaseConfigured) return DEMO_BUSINESSES;

  const { data: businesses, error } = await supabase
    .from("businesses")
    .select("id, name, slug, category, address, icon_emoji, hours")
    .in("status", ["pending", "verified"])
    .order("name");

  if (error || !businesses) {
    console.warn("[NearbyPage] fetchBusinesses error:", error?.message);
    return [];
  }

  const ids = businesses.map((b: { id: string }) => b.id);
  const { data: roomCounts } = await supabase
    .from("rooms")
    .select("business_id")
    .in("business_id", ids);

  const countMap: Record<string, number> = {};
  (roomCounts ?? []).forEach((r: { business_id: string }) => {
    countMap[r.business_id] = (countMap[r.business_id] ?? 0) + 1;
  });

  return businesses.map((b: {
    id: string;
    name: string;
    slug: string;
    category: string;
    address: string | null;
    icon_emoji: string | null;
    hours: unknown;
  }) => ({
    id: b.id,
    name: b.name,
    slug: b.slug,
    category: b.category,
    address: b.address,
    icon_emoji: b.icon_emoji,
    hours: (b.hours as Hours) ?? null,
    room_count: countMap[b.id] ?? 0,
    city: extractCity(b.address),
    // TODO(presence): replace 0 with live active counts from presence channel
    active_users: 0,
  }));
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function OpenBadge({ open }: { open: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 600,
        background: open
          ? "rgba(29,158,117,0.15)"
          : "rgba(239,68,68,0.15)",
        color: open ? "var(--color-success)" : "var(--color-danger)",
        flexShrink: 0,
        lineHeight: "18px",
      }}
    >
      {open ? "Open" : "Closed"}
    </span>
  );
}

function BusinessCard({ item }: { item: BusinessRow }) {
  const open = isOpenNow(item.hours);

  return (
    <Link
      href={`/b/${item.slug}`}
      style={{ textDecoration: "none", display: "block" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "16px 18px",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 14,
          cursor: "pointer",
          transition: "border-color 0.15s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.borderColor =
            "var(--color-brand)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.borderColor =
            "var(--border-subtle)";
        }}
      >
        {/* Emoji avatar */}
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: "var(--bg-elevated)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 28,
            flexShrink: 0,
          }}
        >
          {item.icon_emoji ?? "🏪"}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Name + badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 3,
            }}
          >
            <span
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: "var(--text-primary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
              }}
            >
              {item.name}
            </span>
            <OpenBadge open={open} />
          </div>

          {/* Category */}
          <div
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              marginBottom: 8,
            }}
          >
            {item.category}
          </div>

          {/* Stats */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            {/* Address / city */}
            {item.address && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <IconMapPin
                  size={12}
                  color="var(--text-tertiary)"
                  strokeWidth={2}
                />
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--text-tertiary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: 180,
                  }}
                >
                  {item.address}
                </span>
              </div>
            )}

            {/* Rooms */}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <IconMessage
                size={12}
                color="var(--text-tertiary)"
                strokeWidth={2}
              />
              <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                {item.room_count}{" "}
                {item.room_count === 1 ? "room" : "rooms"}
              </span>
            </div>

            {/* Active users */}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <IconUsers
                size={12}
                color="var(--text-tertiary)"
                strokeWidth={2}
              />
              {/* TODO(presence): replace 0 with live active counts */}
              <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                {item.active_users} active
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NearbyPage() {
  const [businesses, setBusinesses] = useState<BusinessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState<string>("All cities");

  // ── Fetch ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    fetchBusinesses().then((data) => {
      if (!cancelled) {
        setBusinesses(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────

  const cities = useMemo<string[]>(() => {
    const set = new Set(businesses.map((b) => b.city));
    return ["All cities", ...Array.from(set).sort()];
  }, [businesses]);

  const categories = useMemo<string[]>(() => {
    const set = new Set(businesses.map((b) => b.category));
    return Array.from(set).sort();
  }, [businesses]);

  const filtered = useMemo<BusinessRow[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    return businesses.filter((b) => {
      const matchesSearch =
        !q ||
        b.name.toLowerCase().includes(q) ||
        b.category.toLowerCase().includes(q);
      const matchesCategory =
        !selectedCategory || b.category === selectedCategory;
      const matchesCity =
        selectedCity === "All cities" || b.city === selectedCity;
      return matchesSearch && matchesCategory && matchesCity;
    });
  }, [businesses, searchQuery, selectedCategory, selectedCity]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleCategoryToggle = useCallback((cat: string) => {
    setSelectedCategory((prev) => (prev === cat ? null : cat));
  }, []);

  const handleClearSearch = useCallback(() => setSearchQuery(""), []);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main
      data-theme="dark"
      style={{
        minHeight: "100vh",
        background: "var(--bg-base)",
        color: "var(--text-primary)",
      }}
    >
      <div
        style={{
          maxWidth: 760,
          margin: "0 auto",
          padding: "0 16px 60px",
        }}
      >
        {/* Page header */}
        <div
          style={{
            paddingTop: 48,
            paddingBottom: 24,
            borderBottom: "1px solid var(--border-subtle)",
            marginBottom: 24,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 4,
            }}
          >
            <IconBuildingStore
              size={26}
              color="var(--color-brand)"
              strokeWidth={2}
            />
            <h1
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: "var(--text-primary)",
                margin: 0,
                letterSpacing: -0.4,
              }}
            >
              Nearby Businesses
            </h1>
          </div>
          <p
            style={{
              fontSize: 14,
              color: "var(--text-secondary)",
              margin: 0,
            }}
          >
            Browse and join venues on JChat.
          </p>
        </div>

        {/* Controls */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            marginBottom: 20,
          }}
        >
          {/* Search + city row */}
          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            {/* Search bar */}
            <div
              style={{
                flex: 1,
                minWidth: 200,
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "var(--bg-surface)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 12,
                padding: "10px 14px",
              }}
            >
              <IconSearch
                size={16}
                color="var(--text-tertiary)"
                strokeWidth={2}
                style={{ flexShrink: 0 }}
              />
              <input
                type="text"
                placeholder="Search venues…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  fontSize: 14,
                  color: "var(--text-primary)",
                  // placeholder color handled via CSS below
                }}
              />
              {searchQuery.length > 0 && (
                <button
                  onClick={handleClearSearch}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 2,
                    display: "flex",
                    alignItems: "center",
                  }}
                  aria-label="Clear search"
                >
                  <IconX
                    size={14}
                    color="var(--text-tertiary)"
                    strokeWidth={2}
                  />
                </button>
              )}
            </div>

            {/* City selector */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "var(--bg-surface)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 12,
                padding: "10px 14px",
                flexShrink: 0,
              }}
            >
              <IconMapPin
                size={15}
                color="var(--color-brand)"
                strokeWidth={2}
              />
              <select
                value={selectedCity}
                onChange={(e) => setSelectedCity(e.target.value)}
                style={{
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  fontSize: 14,
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  appearance: "none",
                  paddingRight: 20,
                }}
                aria-label="Select city"
              >
                {cities.map((city) => (
                  <option
                    key={city}
                    value={city}
                    style={{ background: "var(--bg-surface)" }}
                  >
                    {city}
                  </option>
                ))}
              </select>
              <IconChevronDown
                size={14}
                color="var(--text-tertiary)"
                strokeWidth={2}
                style={{ marginLeft: -16, pointerEvents: "none" }}
              />
            </div>
          </div>

          {/* Category chips */}
          {categories.length > 0 && (
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              {categories.map((cat) => {
                const active = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => handleCategoryToggle(cat)}
                    style={{
                      padding: "5px 14px",
                      borderRadius: 20,
                      border: `1px solid ${active ? "var(--color-brand)" : "var(--border-subtle)"}`,
                      background: active
                        ? "var(--color-brand)"
                        : "var(--bg-surface)",
                      // Active chip on brand-blue: use light surface token for contrast
                      color: active ? "var(--bg-surface-light)" : "var(--text-secondary)",
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: "pointer",
                      transition: "background 0.15s, color 0.15s, border-color 0.15s",
                    }}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Results count */}
        {!loading && (
          <div
            style={{
              fontSize: 12,
              color: "var(--text-tertiary)",
              marginBottom: 14,
            }}
          >
            {filtered.length === 0
              ? "No venues found"
              : `${filtered.length} venue${filtered.length === 1 ? "" : "s"}`}
            {selectedCity !== "All cities" && ` in ${selectedCity}`}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              paddingTop: 80,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                border: "3px solid var(--border-subtle)",
                borderTopColor: "var(--color-brand)",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }}
            />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Business list */}
        {!loading && filtered.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {filtered.map((item) => (
              <BusinessCard key={item.id} item={item} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && filtered.length === 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              paddingTop: 80,
              gap: 14,
            }}
          >
            <IconBuildingStore
              size={48}
              color="var(--text-tertiary)"
              strokeWidth={1.5}
            />
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  marginBottom: 8,
                }}
              >
                {businesses.length === 0
                  ? "No venues available"
                  : "No results found"}
              </div>
              <div
                style={{
                  fontSize: 14,
                  color: "var(--text-secondary)",
                  lineHeight: 1.6,
                  maxWidth: 320,
                }}
              >
                {businesses.length === 0
                  ? "Check back soon — more venues are joining JChat."
                  : "Try a different search, category, or city."}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
