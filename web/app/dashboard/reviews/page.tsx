"use client";

/**
 * JChat 3.0 — Dashboard: Reviews (Task 2.15)
 *
 * Business owner view of all reviews received. Features:
 *   - Average rating + total count header.
 *   - Full review list (all statuses: visible, reported, hidden).
 *   - Per-review response text area + submit button (calls respondToReview).
 *   - Reported reviews note: visible in the list but flagged.
 *     TODO(Super Admin): reported reviews route to the Super Admin queue.
 *
 * Data:
 *   - Uses supabase client from web/lib/supabase.
 *   - Resolves the owner's active business via resolveActiveBusiness()
 *     (@/lib/business); shows <NoBusinessCTA> when there is no business yet.
 *
 * Design:
 *   - All colors via var(--db-*) tokens; no hardcoded hex.
 *   - Star gold in local REVIEW_COLORS block (design spec: #FFCC00).
 *   - Icons: @tabler/icons-react.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  IconStar,
  IconStarFilled,
  IconFlag,
  IconMessageCircle,
  IconRefresh,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { resolveActiveBusiness, type ActiveBusiness } from "@/lib/business";
import { NoBusinessCTA } from "@/components/dashboard/NoBusinessCTA";

// ── Local color block ──────────────────────────────────────────────────────
// No exact --db- token for gold star color. Design spec: #FFCC00.
// See JCHAT_3.0_DESIGN_SYSTEM.docx · Section 2.
const REVIEW_COLORS = {
  /** Star fill. Design spec: #FFCC00. No --db- token for this value. */
  starGold: "#FFCC00",
} as const;

// ── Types ──────────────────────────────────────────────────────────────────

interface ReviewAuthor {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface ReviewRow {
  id: string;
  user_id: string;
  business_id: string;
  rating: number;
  body: string | null;
  created_at: string;
  response: string | null;
  responded_at: string | null;
  status: "visible" | "reported" | "hidden";
  author: ReviewAuthor | null;
}

interface AverageRating {
  avg: number;
  count: number;
}

// ── Data helpers ───────────────────────────────────────────────────────────

async function fetchReviews(businessId: string): Promise<ReviewRow[]> {
  if (!isSupabaseConfigured) return [];

  const { data, error } = await supabase
    .from("reviews")
    .select(
      `
      id,
      user_id,
      business_id,
      rating,
      body,
      created_at,
      response,
      responded_at,
      status,
      author:users!reviews_user_id_fkey (
        id,
        username,
        display_name,
        avatar_url
      )
    `
    )
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as ReviewRow[];
}

async function computeAverage(reviews: ReviewRow[]): Promise<AverageRating> {
  const visible = reviews.filter((r) => r.status === "visible");
  if (visible.length === 0) return { avg: 0, count: 0 };
  const sum = visible.reduce((acc, r) => acc + r.rating, 0);
  return { avg: sum / visible.length, count: visible.length };
}

async function submitResponse(
  reviewId: string,
  response: string
): Promise<void> {
  if (!isSupabaseConfigured)
    throw new Error("Supabase is not configured");

  const { error } = await supabase
    .from("reviews")
    .update({
      response,
      responded_at: new Date().toISOString(),
    })
    .eq("id", reviewId);

  if (error) throw error;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function authorLabel(review: ReviewRow): string {
  if (review.author?.display_name) return review.author.display_name;
  if (review.author?.username) return `@${review.author.username}`;
  return "Anonymous";
}

function authorInitials(review: ReviewRow): string {
  const name =
    review.author?.display_name || review.author?.username || "?";
  return name.slice(0, 2).toUpperCase();
}

// ── StarDisplay ────────────────────────────────────────────────────────────

function StarDisplay({
  value,
  size = 16,
}: {
  value: number;
  size?: number;
}) {
  return (
    <span style={{ display: "inline-flex", gap: "2px", alignItems: "center" }}>
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= Math.round(value);
        const Icon = filled ? IconStarFilled : IconStar;
        return (
          <Icon
            key={star}
            size={size}
            color={filled ? REVIEW_COLORS.starGold : "var(--db-text-tertiary)"}
          />
        );
      })}
    </span>
  );
}

// ── AverageHeader ──────────────────────────────────────────────────────────

function AverageHeader({ avg, count }: AverageRating) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "16px",
        padding: "20px 24px",
        background: "var(--db-bg-elevated)",
        borderRadius: "12px",
        border: "1px solid var(--db-border)",
        marginBottom: "24px",
      }}
    >
      <div
        style={{
          fontSize: "48px",
          fontWeight: 800,
          color: "var(--db-text-primary)",
          lineHeight: 1,
        }}
      >
        {count > 0 ? avg.toFixed(1) : "—"}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <StarDisplay value={avg} size={22} />
        <div
          style={{ fontSize: "13px", color: "var(--db-text-secondary)" }}
        >
          {count > 0
            ? `Based on ${count} review${count !== 1 ? "s" : ""}`
            : "No reviews yet"}
        </div>
      </div>
    </div>
  );
}

// ── ReviewCard ─────────────────────────────────────────────────────────────

interface ReviewCardProps {
  review: ReviewRow;
  onResponseSubmit: (reviewId: string, response: string) => Promise<void>;
}

function ReviewCard({ review, onResponseSubmit }: ReviewCardProps) {
  const [draft, setDraft] = useState(review.response ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResponseBox, setShowResponseBox] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!draft.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onResponseSubmit(review.id, draft.trim());
      setSaved(true);
      setShowResponseBox(false);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save response");
    } finally {
      setSaving(false);
    }
  }, [draft, review.id, onResponseSubmit]);

  const isReported = review.status === "reported";
  const isHidden = review.status === "hidden";

  return (
    <div
      style={{
        background: "var(--db-bg-surface)",
        border: `1px solid ${isReported ? "var(--db-warning)" : "var(--db-border)"}`,
        borderRadius: "12px",
        padding: "16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        opacity: isHidden ? 0.55 : 1,
      }}
    >
      {/* Header: avatar + author + date + status badge */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "12px",
        }}
      >
        {/* Avatar initials */}
        <div
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "50%",
            background: "var(--db-accent-bg)",
            color: "var(--db-accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "13px",
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {authorInitials(review)}
        </div>

        <div style={{ flex: 1 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: "14px",
                fontWeight: 600,
                color: "var(--db-text-primary)",
              }}
            >
              {authorLabel(review)}
            </span>

            {isReported && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "var(--db-warning)",
                  background: "rgba(245,158,11,0.12)",
                  borderRadius: "6px",
                  padding: "2px 7px",
                }}
              >
                <IconFlag size={11} />
                Reported
                {/* TODO(Super Admin): reported reviews route to the Super Admin queue */}
              </span>
            )}

            {isHidden && (
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "var(--db-text-tertiary)",
                  background: "var(--db-bg-elevated)",
                  borderRadius: "6px",
                  padding: "2px 7px",
                }}
              >
                Hidden
              </span>
            )}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginTop: "2px",
            }}
          >
            <StarDisplay value={review.rating} size={14} />
            <span
              style={{ fontSize: "12px", color: "var(--db-text-tertiary)" }}
            >
              {formatDate(review.created_at)}
            </span>
          </div>
        </div>
      </div>

      {/* Body */}
      {review.body && (
        <p
          style={{
            margin: 0,
            fontSize: "14px",
            color: "var(--db-text-secondary)",
            lineHeight: "1.55",
          }}
        >
          {review.body}
        </p>
      )}

      {/* Existing response */}
      {review.response && !showResponseBox && (
        <div
          style={{
            background: "var(--db-bg-base)",
            borderLeft: "3px solid var(--db-accent)",
            borderRadius: "0 8px 8px 0",
            padding: "10px 14px",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "12px",
              fontWeight: 600,
              color: "var(--db-accent)",
            }}
          >
            <IconMessageCircle size={13} />
            Owner response
            {review.responded_at && (
              <span
                style={{
                  fontWeight: 400,
                  color: "var(--db-text-tertiary)",
                  marginLeft: "4px",
                }}
              >
                · {formatDate(review.responded_at)}
              </span>
            )}
          </div>
          <p
            style={{
              margin: 0,
              fontSize: "13px",
              color: "var(--db-text-secondary)",
              lineHeight: "1.5",
            }}
          >
            {review.response}
          </p>
          <button
            onClick={() => {
              setDraft(review.response ?? "");
              setShowResponseBox(true);
            }}
            style={{
              alignSelf: "flex-start",
              marginTop: "4px",
              fontSize: "12px",
              color: "var(--db-accent)",
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Edit response
          </button>
        </div>
      )}

      {/* Response box */}
      {!review.response || showResponseBox ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              review.response
                ? "Edit your response…"
                : "Reply publicly to this review…"
            }
            rows={3}
            maxLength={1000}
            disabled={saving}
            style={{
              width: "100%",
              boxSizing: "border-box",
              resize: "vertical",
              background: "var(--db-bg-base)",
              border: "1px solid var(--db-border)",
              borderRadius: "8px",
              padding: "10px 12px",
              fontSize: "13px",
              color: "var(--db-text-primary)",
              outline: "none",
              fontFamily: "inherit",
            }}
          />

          {error && (
            <p
              style={{
                margin: 0,
                fontSize: "12px",
                color: "var(--db-danger)",
              }}
            >
              {error}
            </p>
          )}

          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button
              onClick={handleSubmit}
              disabled={saving || !draft.trim()}
              style={{
                padding: "7px 18px",
                borderRadius: "8px",
                border: "none",
                background: "var(--db-accent)",
                color: "var(--db-accent-text)",
                fontSize: "13px",
                fontWeight: 600,
                cursor: saving || !draft.trim() ? "not-allowed" : "pointer",
                opacity: saving || !draft.trim() ? 0.5 : 1,
              }}
            >
              {saving ? "Saving…" : review.response ? "Update" : "Post Response"}
            </button>

            {showResponseBox && review.response && (
              <button
                onClick={() => setShowResponseBox(false)}
                style={{
                  padding: "7px 14px",
                  borderRadius: "8px",
                  border: "1px solid var(--db-border)",
                  background: "none",
                  color: "var(--db-text-secondary)",
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            )}

            {saved && (
              <span
                style={{ fontSize: "12px", color: "var(--db-success)" }}
              >
                Saved!
              </span>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [average, setAverage] = useState<AverageRating>({ avg: 0, count: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [business, setBusiness] = useState<ActiveBusiness | null>(null);
  const [needsRegister, setNeedsRegister] = useState(false);

  const load = useCallback(async (businessId: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchReviews(businessId);
      setReviews(data);
      const avg = await computeAverage(data);
      setAverage(avg);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to load reviews"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!isSupabaseConfigured) {
        setReviews([]);
        setLoading(false);
        return;
      }
      try {
        const res = await resolveActiveBusiness();
        if (!active) return;
        if (!res.ok) {
          if (res.reason === "no_business" || res.reason === "unauthenticated") setNeedsRegister(true);
          else setError(res.message);
          setLoading(false);
          return;
        }
        setBusiness(res.business);
        await load(res.business.id);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Failed to load reviews.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [load]);

  const handleResponseSubmit = useCallback(
    async (reviewId: string, response: string) => {
      await submitResponse(reviewId, response);
      // Optimistically update local state so the card reflects the saved response.
      setReviews((prev) =>
        prev.map((r) =>
          r.id === reviewId
            ? { ...r, response, responded_at: new Date().toISOString() }
            : r
        )
      );
    },
    []
  );

  if (!loading && needsRegister) {
    return (
      <div style={{ maxWidth: "760px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--db-text-primary)", margin: 0 }}>
          Reviews
        </h1>
        <NoBusinessCTA message="Register your business to see and respond to reviews." />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "760px" }}>
      {/* Page header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "20px",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "22px",
              fontWeight: 700,
              color: "var(--db-text-primary)",
              margin: 0,
            }}
          >
            Reviews
          </h1>
          <p
            style={{
              fontSize: "13px",
              color: "var(--db-text-secondary)",
              margin: "4px 0 0",
            }}
          >
            Read and respond to customer reviews for your venue.
          </p>
        </div>

        <button
          onClick={() => { if (business) void load(business.id); }}
          disabled={loading}
          title="Refresh"
          aria-label="Refresh reviews"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "8px 14px",
            borderRadius: "8px",
            border: "1px solid var(--db-border)",
            background: "var(--db-bg-elevated)",
            color: "var(--db-text-secondary)",
            fontSize: "13px",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.5 : 1,
          }}
        >
          <IconRefresh size={15} />
          Refresh
        </button>
      </div>

      {/* Average rating header */}
      <AverageHeader avg={average.avg} count={average.count} />

      {/* Loading state */}
      {loading && (
        <div
          style={{
            textAlign: "center",
            padding: "48px 0",
            color: "var(--db-text-tertiary)",
            fontSize: "14px",
          }}
        >
          Loading reviews…
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div
          style={{
            padding: "16px 20px",
            background: "rgba(239,68,68,0.08)",
            border: "1px solid var(--db-danger)",
            borderRadius: "10px",
            color: "var(--db-danger)",
            fontSize: "14px",
          }}
        >
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && reviews.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "64px 0",
            color: "var(--db-text-tertiary)",
            fontSize: "14px",
          }}
        >
          No reviews yet. They will appear here once customers leave feedback.
        </div>
      )}

      {/* Review list */}
      {!loading && !error && reviews.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {reviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              onResponseSubmit={handleResponseSubmit}
            />
          ))}
        </div>
      )}
    </div>
  );
}
