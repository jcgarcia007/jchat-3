/**
 * JChat 3.0 — Task 2.12: Public Business Preview Page
 *
 * Route: /b/[slug]
 * Auth: NONE — fully public, no authentication required.
 *
 * Server Component (async). Fetches business + rooms server-side from Supabase.
 * Falls back to a placeholder business when Supabase is not configured so the
 * page still renders locally without a backend.
 *
 * Next.js 16 breaking change: `params` is a Promise — must be awaited.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  IconMapPin,
  IconClock,
  IconMessageCircle,
  IconBrandAppstore,
  IconBrandGooglePlay,
  IconStar,
  IconChevronRight,
  IconPhoto,
  IconToolsKitchen2,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HoursEntry {
  open: string;  // e.g. "09:00"
  close: string; // e.g. "22:00"
  closed?: boolean;
}

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

type Hours = Partial<Record<DayKey, HoursEntry>>;

interface Room {
  id: string;
  name: string;
  description?: string | null;
}

interface Business {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string | null;
  cover_url: string | null;
  icon_emoji: string | null;
  hours: Hours | null;
  address: string | null;
  rooms: Room[];
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

const PLACEHOLDER_BUSINESS: Business = {
  id: "demo-id",
  slug: "demo-venue",
  name: "Demo Venue",
  category: "Bar & Lounge",
  description:
    "A lively venue with great drinks and an amazing atmosphere. Join the conversation in our chat rooms!",
  cover_url: null,
  icon_emoji: "🍹",
  hours: {
    mon: { open: "17:00", close: "02:00" },
    tue: { open: "17:00", close: "02:00" },
    wed: { open: "17:00", close: "02:00" },
    thu: { open: "17:00", close: "02:00" },
    fri: { open: "16:00", close: "03:00" },
    sat: { open: "14:00", close: "03:00" },
    sun: { open: "14:00", close: "00:00" },
  },
  address: "123 Main St, Miami, FL 33101",
  rooms: [
    { id: "room-1", name: "Main Lounge", description: "The central hang-out spot" },
    { id: "room-2", name: "VIP Room", description: "Exclusive access area" },
    { id: "room-3", name: "Rooftop Bar", description: "Open-air drinks with a view" },
  ],
};

async function getBusiness(slug: string): Promise<Business | null> {
  if (!isSupabaseConfigured) {
    // Return placeholder so the page renders without a backend
    return slug === "demo-venue" ? PLACEHOLDER_BUSINESS : null;
  }

  const { data: biz, error: bizError } = await supabase
    .from("businesses")
    .select("id, slug, name, category, description, cover_url, icon_emoji, hours, address")
    .eq("slug", slug)
    .single();

  if (bizError || !biz) return null;

  const { data: rooms } = await supabase
    .from("rooms")
    .select("id, name, description")
    .eq("business_id", biz.id)
    .order("name");

  return {
    ...biz,
    hours: (biz.hours as Hours) ?? null,
    rooms: (rooms ?? []) as Room[],
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_LABELS: Record<DayKey, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

const DAY_ORDER: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function formatHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour} ${period}` : `${hour}:${m.toString().padStart(2, "0")} ${period}`;
}

function getTodayKey(): DayKey {
  const days: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return days[new Date().getDay()];
}

// ---------------------------------------------------------------------------
// SEO — generateMetadata (Next.js 16: params is a Promise)
// ---------------------------------------------------------------------------

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const biz = await getBusiness(slug);

  if (!biz) {
    return {
      title: "Business Not Found — JChat",
      description: "This business could not be found on JChat.",
    };
  }

  const title = `${biz.name} — JChat`;
  const description =
    biz.description ??
    `${biz.name} is on JChat. Download the app to join the conversation.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "JChat",
      ...(biz.cover_url ? { images: [{ url: biz.cover_url, alt: biz.name }] } : {}),
    },
    twitter: {
      card: biz.cover_url ? "summary_large_image" : "summary",
      title,
      description,
      ...(biz.cover_url ? { images: [biz.cover_url] } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// JSON-LD structured data (schema.org LocalBusiness)
// ---------------------------------------------------------------------------

function JsonLd({ biz }: { biz: Business }) {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: biz.name,
    description: biz.description ?? undefined,
    address: biz.address
      ? {
          "@type": "PostalAddress",
          streetAddress: biz.address,
        }
      : undefined,
    image: biz.cover_url ?? undefined,
    url: `https://jchat.app/b/${biz.slug}`, // TODO: replace with real production domain
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CoverPhoto({ url, name }: { url: string | null; name: string }) {
  return (
    <div
      style={{
        width: "100%",
        height: 260,
        background: url
          ? `url(${url}) center/cover no-repeat`
          : "linear-gradient(135deg, var(--color-brand) 0%, var(--color-brand-purple) 100%)",
        display: "flex",
        alignItems: "flex-end",
        position: "relative",
        flexShrink: 0,
      }}
      aria-label={`Cover photo for ${name}`}
      role="img"
    >
      {/* Gradient overlay for readability */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to bottom, transparent 40%, rgba(15,15,17,0.85) 100%)",
        }}
      />
    </div>
  );
}

function HoursSection({ hours }: { hours: Hours }) {
  const todayKey = getTodayKey();

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        borderRadius: 14,
        padding: "20px 24px",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 16,
        }}
      >
        <IconClock size={18} color="var(--color-brand)" />
        <h2
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: "var(--text-primary)",
            margin: 0,
          }}
        >
          Hours
        </h2>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {DAY_ORDER.map((day) => {
          const entry = hours[day];
          const isToday = day === todayKey;
          return (
            <div
              key={day}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "6px 10px",
                borderRadius: 8,
                background: isToday ? "var(--color-brand-light)" : "transparent",
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  color: isToday ? "var(--color-brand)" : "var(--text-secondary)",
                  fontWeight: isToday ? 600 : 400,
                  minWidth: 90,
                }}
              >
                {DAY_LABELS[day]}
              </span>
              <span
                style={{
                  fontSize: 13,
                  color: entry?.closed
                    ? "var(--color-danger)"
                    : isToday
                    ? "var(--color-brand)"
                    : "var(--text-primary)",
                  fontWeight: isToday ? 600 : 400,
                }}
              >
                {entry?.closed || !entry
                  ? "Closed"
                  : `${formatHour(entry.open)} – ${formatHour(entry.close)}`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RoomCard({ room }: { room: Room }) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 14,
        padding: "16px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: "var(--color-brand-light)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <IconMessageCircle size={20} color="var(--color-brand)" />
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text-primary)",
              marginBottom: 2,
            }}
          >
            {room.name}
          </div>
          {room.description && (
            <div
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {room.description}
            </div>
          )}
        </div>
      </div>
      <IconChevronRight size={16} color="var(--text-tertiary)" style={{ flexShrink: 0 }} />
    </div>
  );
}

function MenuPreviewStub() {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 14,
        padding: "20px 24px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <IconToolsKitchen2 size={18} color="var(--color-brand)" />
        <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
          Menu
        </h2>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          padding: "24px 0",
        }}
      >
        <IconPhoto size={36} color="var(--text-tertiary)" />
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, textAlign: "center" }}>
          Menu coming soon — download JChat to see the full menu in-app.
        </p>
        {/* TODO: replace stub with real menu items when Task 3.1 menu data is available */}
      </div>
    </div>
  );
}

function DownloadCTA({ businessName }: { businessName: string }) {
  // TODO: replace placeholder URLs with real App Store / Google Play production links
  const APP_STORE_URL = "https://apps.apple.com/app/jchat/id000000000"; // TODO: real App Store link
  const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.jchat.app"; // TODO: real Play Store link

  return (
    <div
      style={{
        background: "linear-gradient(135deg, var(--color-brand) 0%, var(--color-brand-purple) 100%)",
        borderRadius: 18,
        padding: "28px 24px",
        textAlign: "center",
      }}
    >
      <div style={{ marginBottom: 6 }}>
        <IconMessageCircle size={32} color="var(--bg-surface-light)" />
      </div>
      <h2
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: "var(--bg-surface-light)",
          margin: "0 0 8px",
        }}
      >
        Join {businessName} on JChat
      </h2>
      <p
        style={{
          fontSize: 13,
          color: "rgba(255,255,255,0.8)",
          margin: "0 0 24px",
          lineHeight: 1.5,
        }}
      >
        Download JChat to enter the chat room, see live offers, and connect with this venue.
      </p>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          alignItems: "center",
        }}
      >
        <a
          href={APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "var(--bg-surface-light)",
            color: "var(--text-primary-light)",
            borderRadius: 12,
            padding: "12px 24px",
            fontWeight: 600,
            fontSize: 14,
            textDecoration: "none",
            width: "100%",
            maxWidth: 260,
            justifyContent: "center",
          }}
        >
          <IconBrandAppstore size={20} />
          Download on the App Store
        </a>
        <a
          href={PLAY_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "rgba(255,255,255,0.15)",
            color: "var(--bg-surface-light)",
            border: "1px solid rgba(255,255,255,0.3)",
            borderRadius: 12,
            padding: "12px 24px",
            fontWeight: 600,
            fontSize: 14,
            textDecoration: "none",
            width: "100%",
            maxWidth: 260,
            justifyContent: "center",
          }}
        >
          <IconBrandGooglePlay size={20} />
          Get it on Google Play
        </a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Not-found page
// ---------------------------------------------------------------------------

function NotFoundState({ slug }: { slug: string }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-base)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 360 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "var(--text-primary)",
            marginBottom: 8,
          }}
        >
          Venue not found
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          We couldn&apos;t find a business at{" "}
          <code
            style={{
              background: "var(--bg-surface)",
              padding: "2px 6px",
              borderRadius: 4,
              fontSize: 13,
            }}
          >
            /b/{slug}
          </code>
          . It may have moved or the link could be incorrect.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page — main export (Next.js 16: params is a Promise)
// ---------------------------------------------------------------------------

export default async function BusinessPreviewPage({ params }: PageProps) {
  const { slug } = await params;
  const biz = await getBusiness(slug);

  // If Supabase is configured and business not found, use Next.js notFound()
  // which renders the nearest not-found.js or a 404 response.
  if (!biz && isSupabaseConfigured) {
    notFound();
  }

  // When Supabase is NOT configured and slug is unknown, show a friendly state
  // rather than crashing — page still renders for development/preview.
  if (!biz) {
    return (
      <main data-theme="dark" style={{ background: "var(--bg-base)", minHeight: "100vh" }}>
        <NotFoundState slug={slug} />
      </main>
    );
  }

  return (
    <main
      data-theme="dark"
      style={{
        background: "var(--bg-base)",
        minHeight: "100vh",
        color: "var(--text-primary)",
      }}
    >
      {/* JSON-LD Structured Data */}
      <JsonLd biz={biz} />

      {/* Cover Photo */}
      <CoverPhoto url={biz.cover_url} name={biz.name} />

      {/* Content */}
      <div
        style={{
          maxWidth: 640,
          margin: "0 auto",
          padding: "0 16px 48px",
          position: "relative",
        }}
      >
        {/* Business Identity Header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 16,
            marginTop: -32,
            marginBottom: 24,
          }}
        >
          {/* Icon / Avatar */}
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              background: "var(--bg-elevated)",
              border: "3px solid var(--bg-base)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 36,
              flexShrink: 0,
              boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            }}
          >
            {biz.icon_emoji ?? "🏪"}
          </div>
          <div style={{ paddingBottom: 4, minWidth: 0 }}>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: "var(--text-primary)",
                margin: "0 0 4px",
                lineHeight: 1.2,
              }}
            >
              {biz.name}
            </h1>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <IconStar size={13} color="var(--color-gold)" />
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {biz.category}
              </span>
            </div>
          </div>
        </div>

        {/* Description */}
        {biz.description && (
          <p
            style={{
              fontSize: 14,
              color: "var(--text-secondary)",
              lineHeight: 1.7,
              margin: "0 0 20px",
            }}
          >
            {biz.description}
          </p>
        )}

        {/* Address */}
        {biz.address && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 28,
              padding: "10px 14px",
              background: "var(--bg-surface)",
              borderRadius: 10,
              border: "1px solid var(--border-subtle)",
            }}
          >
            <IconMapPin size={16} color="var(--color-brand)" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{biz.address}</span>
          </div>
        )}

        {/* Chat Rooms */}
        {biz.rooms.length > 0 && (
          <section style={{ marginBottom: 24 }}>
            <h2
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                margin: "0 0 12px",
              }}
            >
              Chat Rooms
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {biz.rooms.map((room) => (
                <RoomCard key={room.id} room={room} />
              ))}
            </div>
          </section>
        )}

        {/* Download CTA */}
        <div style={{ marginBottom: 24 }}>
          <DownloadCTA businessName={biz.name} />
        </div>

        {/* Hours */}
        {biz.hours && Object.keys(biz.hours).length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <HoursSection hours={biz.hours} />
          </div>
        )}

        {/* Menu Preview (stub until Task 3.1) */}
        <MenuPreviewStub />
      </div>
    </main>
  );
}
