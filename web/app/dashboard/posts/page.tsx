/**
 * JChat 3.0 — Business Posts (Dashboard) · Project B, phase 1
 *
 * Lists the posts published on behalf of the ACTIVE business (posts.business_id).
 * Only the owner can publish (RLS: can_publish_business_post). Posts are public
 * in the app once the business is verified, and permanent until the owner deletes them.
 *
 * Design: var(--db-*) tokens only. No hardcoded hex.
 * Icons: @tabler/icons-react only.
 * "use client" — hooks + state throughout.
 */

"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  IconAlertCircle,
  IconHeart,
  IconMessageCircle,
  IconPhoto,
  IconX,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useActiveBusiness } from "@/lib/useActiveBusiness";

// ── Types ─────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

interface BusinessPost {
  id: string;
  caption: string | null;
  media_urls: string[];
  created_at: string;
  /** undefined → count unavailable (e.g. blocked by RLS); omitted from the card. */
  likes?: number;
  comments?: number;
}

interface PostRowWithCounts {
  id: string;
  caption: string | null;
  media_urls: string[];
  created_at: string;
  post_likes?: { count: number }[] | null;
  comments?: { count: number }[] | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function embeddedCount(rows: { count: number }[] | null | undefined): number | undefined {
  if (!Array.isArray(rows) || rows.length === 0) return undefined;
  return rows[0].count;
}

// ── PostCard ──────────────────────────────────────────────────────────────────

function PostCard({ post }: { post: BusinessPost }) {
  const t = useTranslations("dashboardCommon");
  const cover = post.media_urls[0] ?? null;

  return (
    <div
      style={{
        display: "flex",
        gap: "14px",
        padding: "14px 16px",
        background: "var(--db-bg-surface)",
        border: "1px solid var(--db-border)",
        borderRadius: "var(--db-radius-card)",
      }}
    >
      {/* Thumbnail */}
      <div
        style={{
          width: 72,
          height: 72,
          flexShrink: 0,
          borderRadius: "var(--db-radius)",
          background: "var(--db-bg-elevated)",
          border: "1px solid var(--db-border)",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--db-text-tertiary)",
        }}
      >
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={t("postsThumbAlt")}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <IconPhoto size={26} />
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {post.caption ? (
          <p
            style={{
              margin: 0,
              fontSize: "14px",
              lineHeight: 1.5,
              color: "var(--db-text-primary)",
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {post.caption}
          </p>
        ) : (
          <p style={{ margin: 0, fontSize: "13px", color: "var(--db-text-tertiary)" }}>
            {t("postsPhotoOnly")}
          </p>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "14px",
            marginTop: "8px",
            fontSize: "12px",
            color: "var(--db-text-tertiary)",
          }}
        >
          <span>{formatDate(post.created_at)}</span>
          {post.media_urls.length > 1 && (
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <IconPhoto size={12} />
              {post.media_urls.length}
            </span>
          )}
          {post.likes !== undefined && (
            <span
              style={{ display: "flex", alignItems: "center", gap: "4px" }}
              title={t("postsLikesLabel")}
            >
              <IconHeart size={12} />
              {post.likes.toLocaleString()}
            </span>
          )}
          {post.comments !== undefined && (
            <span
              style={{ display: "flex", alignItems: "center", gap: "4px" }}
              title={t("postsCommentsLabel")}
            >
              <IconMessageCircle size={12} />
              {post.comments.toLocaleString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page component ───────────────────────────────────────────────────────

export default function PostsPage() {
  const t = useTranslations("dashboardCommon");
  const tCommon = useTranslations("common");
  const { business, loading: businessLoading, needsRegister } = useActiveBusiness();

  const [posts, setPosts] = useState<BusinessPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const businessId = business?.id ?? null;
  const isVerified = business?.status === "verified";

  // ── Load one page of posts (offset-based, newest first) ─────────────────────
  const loadPosts = useCallback(
    async (offset: number) => {
      if (!isSupabaseConfigured || !businessId) return;
      setLoading(true);
      setError(null);
      try {
        const to = offset + PAGE_SIZE - 1;
        // Likes/comments counts are embedded. If that query fails (e.g. RLS on
        // those tables), retry without them and simply omit the counts.
        const withCounts = await supabase
          .from("posts")
          .select("id, caption, media_urls, created_at, post_likes(count), comments(count)")
          .eq("business_id", businessId)
          .order("created_at", { ascending: false })
          .range(offset, to);

        let rows: PostRowWithCounts[];
        let countsAvailable = true;
        if (withCounts.error) {
          countsAvailable = false;
          const plain = await supabase
            .from("posts")
            .select("id, caption, media_urls, created_at")
            .eq("business_id", businessId)
            .order("created_at", { ascending: false })
            .range(offset, to);
          if (plain.error) throw plain.error;
          rows = (plain.data ?? []) as PostRowWithCounts[];
        } else {
          rows = (withCounts.data ?? []) as unknown as PostRowWithCounts[];
        }

        const mapped: BusinessPost[] = rows.map((r) => ({
          id: r.id,
          caption: r.caption,
          media_urls: r.media_urls ?? [],
          created_at: r.created_at,
          likes: countsAvailable ? (embeddedCount(r.post_likes) ?? 0) : undefined,
          comments: countsAvailable ? (embeddedCount(r.comments) ?? 0) : undefined,
        }));

        setPosts((prev) => (offset === 0 ? mapped : [...prev, ...mapped]));
        setHasMore(rows.length === PAGE_SIZE);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
        setError(t("postsLoadError", { msg }));
      } finally {
        setLoading(false);
      }
    },
    [businessId, t]
  );

  useEffect(() => {
    if (businessId) void loadPosts(0);
  }, [businessId, loadPosts]);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 900 }}>
      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <h1
          style={{
            fontSize: "22px",
            fontWeight: 700,
            color: "var(--db-text-primary)",
            marginBottom: "4px",
          }}
        >
          {t("postsPageTitle")}
        </h1>
        <p style={{ fontSize: "14px", color: "var(--db-text-secondary)" }}>
          {t("postsSubtitle")}
        </p>
      </div>

      {/* Unverified business notice (creating is still allowed) */}
      {business && !isVerified && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "8px",
            padding: "12px 16px",
            marginBottom: "16px",
            borderRadius: "var(--db-radius)",
            background: "var(--db-bg-elevated)",
            border: "1px solid var(--db-warning)",
            color: "var(--db-warning)",
            fontSize: "13px",
            lineHeight: 1.5,
          }}
        >
          <IconAlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          {t("postsUnverifiedNotice")}
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "12px 16px",
            marginBottom: "16px",
            borderRadius: "var(--db-radius)",
            background: "var(--db-bg-elevated)",
            border: "1px solid var(--db-danger)",
            color: "var(--db-danger)",
            fontSize: "14px",
          }}
        >
          <IconAlertCircle size={16} />
          {error}
          <button
            onClick={() => setError(null)}
            aria-label={tCommon("cancel")}
            style={{
              marginLeft: "auto",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "inherit",
            }}
          >
            <IconX size={14} />
          </button>
        </div>
      )}

      {/* No business */}
      {needsRegister && (
        <p style={{ fontSize: "14px", color: "var(--db-text-secondary)" }}>
          {t("postsNoBusinessMessage")}
        </p>
      )}

      {/* List */}
      {businessId && (
        <div>
          <h2
            style={{
              fontSize: "13px",
              fontWeight: 700,
              color: "var(--db-text-tertiary)",
              marginBottom: "12px",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            {loading && posts.length === 0
              ? tCommon("loading")
              : posts.length === 0
              ? t("postsEmptyHeading")
              : t("postsCountHeading", { count: posts.length })}
          </h2>

          {posts.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}

          {hasMore && (
            <div style={{ textAlign: "center", marginTop: "16px" }}>
              <button
                onClick={() => void loadPosts(posts.length)}
                disabled={loading}
                style={{
                  padding: "9px 18px",
                  borderRadius: "var(--db-radius)",
                  border: "1px solid var(--db-border)",
                  background: "transparent",
                  color: "var(--db-text-secondary)",
                  fontSize: "14px",
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.5 : 1,
                }}
              >
                {loading ? tCommon("loading") : t("postsLoadMore")}
              </button>
            </div>
          )}

          {!loading && posts.length === 0 && (
            <div
              style={{
                textAlign: "center",
                padding: "60px 20px",
                color: "var(--db-text-tertiary)",
                background: "var(--db-bg-surface)",
                borderRadius: "var(--db-radius-card)",
                border: "1px dashed var(--db-border)",
              }}
            >
              <IconPhoto size={36} style={{ opacity: 0.3, marginBottom: "12px" }} />
              <p style={{ fontSize: "14px" }}>{t("postsEmptyMessage")}</p>
            </div>
          )}
        </div>
      )}

      {businessLoading && !business && !needsRegister && (
        <p style={{ fontSize: "14px", color: "var(--db-text-tertiary)" }}>
          {tCommon("loading")}
        </p>
      )}
    </div>
  );
}
