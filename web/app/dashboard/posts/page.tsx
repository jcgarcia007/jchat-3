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
  IconCheck,
  IconHeart,
  IconMessageCircle,
  IconPencil,
  IconPhoto,
  IconPlus,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useActiveBusiness } from "@/lib/useActiveBusiness";

// ── Types ─────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;
const MAX_CAPTION = 1000;
const MAX_PHOTOS = 4;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const BUCKET = "post-media";
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

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

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  const m = (e as { message?: unknown } | null)?.message;
  return typeof m === "string" ? m : String(e);
}

/** Postgres 42501 = insufficient_privilege (RLS rejected the write). */
function isRlsError(e: unknown): boolean {
  return (e as { code?: unknown } | null)?.code === "42501";
}

/**
 * Storage object path inside the post-media bucket, from its public URL.
 * Only returns paths that belong to this business ({uid}/business/{businessId}/{file}):
 * media_urls is user-writable, so a crafted URL must never reach another path.
 */
function storagePathFromUrl(url: string, businessId: string): string | null {
  try {
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const { pathname } = new URL(url);
    if (!pathname.startsWith(marker)) return null;
    const path = decodeURIComponent(pathname.slice(marker.length));
    const allowed = new RegExp(`^[^/]+/business/${businessId}/[^/]+$`);
    return allowed.test(path) ? path : null;
  } catch {
    return null;
  }
}

/** Best-effort removal of bucket objects. Never throws: failures must not block the UI. */
async function removePathsBestEffort(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    const { error } = await supabase.storage.from(BUCKET).remove(paths);
    if (error) console.warn("[posts] could not delete files:", error.message);
  } catch (e: unknown) {
    console.warn("[posts] could not delete files:", errorMessage(e));
  }
}

async function removeFilesBestEffort(urls: string[], businessId: string): Promise<void> {
  const paths = urls
    .map((u) => storagePathFromUrl(u, businessId))
    .filter((p): p is string => p !== null);
  await removePathsBestEffort(paths);
}

function embeddedCount(rows: { count: number }[] | null | undefined): number | undefined {
  if (!Array.isArray(rows) || rows.length === 0) return undefined;
  return rows[0].count;
}

// ── PostCard ──────────────────────────────────────────────────────────────────

function PostCard({
  post,
  deleting,
  onEdit,
  onDelete,
}: {
  post: BusinessPost;
  deleting: boolean;
  onEdit: (post: BusinessPost) => void;
  onDelete: (post: BusinessPost) => void;
}) {
  const t = useTranslations("dashboardCommon");
  const tCommon = useTranslations("common");
  const [confirming, setConfirming] = useState(false);
  const cover = post.media_urls[0] ?? null;

  const actionButton: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    padding: "6px 12px",
    borderRadius: "var(--db-radius)",
    border: "1px solid var(--db-border)",
    background: "transparent",
    fontSize: "12px",
    fontWeight: 600,
    cursor: deleting ? "not-allowed" : "pointer",
    opacity: deleting ? 0.5 : 1,
  };

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

      {/* Actions */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: "8px",
          flexShrink: 0,
        }}
      >
        {confirming ? (
          <>
            <span style={{ fontSize: "12px", color: "var(--db-text-secondary)", maxWidth: 180, textAlign: "right" }}>
              {t("postsDeleteConfirm")}
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => setConfirming(false)}
                disabled={deleting}
                style={{ ...actionButton, color: "var(--db-text-secondary)" }}
              >
                {tCommon("cancel")}
              </button>
              <button
                onClick={() => onDelete(post)}
                disabled={deleting}
                style={{ ...actionButton, color: "var(--db-danger)", borderColor: "var(--db-danger)" }}
              >
                <IconTrash size={13} />
                {deleting ? t("postsDeletingState") : t("postsDeleteConfirmButton")}
              </button>
            </div>
          </>
        ) : (
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => onEdit(post)}
              disabled={deleting}
              style={{ ...actionButton, color: "var(--db-text-secondary)" }}
            >
              <IconPencil size={13} />
              {t("postsEditButton")}
            </button>
            <button
              onClick={() => setConfirming(true)}
              disabled={deleting}
              style={{ ...actionButton, color: "var(--db-danger)" }}
            >
              <IconTrash size={13} />
              {t("postsDeleteButton")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── PostForm (inline create / edit) ───────────────────────────────────────────

interface StagedPhoto {
  id: string;
  file: File;
  preview: string;
}

function PostForm({
  businessId,
  post,
  onSaved,
  onCancel,
}: {
  businessId: string;
  /** null → create; a post → edit (only caption and media_urls are written). */
  post: BusinessPost | null;
  onSaved: (successMessage: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("dashboardCommon");
  const tCommon = useTranslations("common");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [caption, setCaption] = useState(post?.caption ?? "");
  const [keptUrls, setKeptUrls] = useState<string[]>(post?.media_urls ?? []);
  const [staged, setStaged] = useState<StagedPhoto[]>([]);
  const [saving, setSaving] = useState(false);
  const savingRef = React.useRef(false);
  const [error, setError] = useState<string | null>(null);

  // Release object URLs on unmount.
  const stagedRef = React.useRef<StagedPhoto[]>([]);
  stagedRef.current = staged;
  useEffect(() => {
    return () => stagedRef.current.forEach((p) => URL.revokeObjectURL(p.preview));
  }, []);

  const photoCount = keptUrls.length + staged.length;

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    const accepted: StagedPhoto[] = [];
    let room = MAX_PHOTOS - photoCount;
    for (const file of Array.from(files)) {
      if (!(file.type in ALLOWED_TYPES)) {
        setError(t("postsInvalidTypeError", { name: file.name }));
        continue;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        setError(t("postsTooLargeError", { name: file.name }));
        continue;
      }
      if (room <= 0) {
        setError(t("postsMaxPhotosError", { max: MAX_PHOTOS }));
        break;
      }
      accepted.push({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file) });
      room -= 1;
    }
    if (accepted.length > 0) setStaged((prev) => [...prev, ...accepted]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeStaged(id: string) {
    setStaged((prev) => {
      const gone = prev.find((p) => p.id === id);
      if (gone) URL.revokeObjectURL(gone.preview);
      return prev.filter((p) => p.id !== id);
    });
  }

  async function handleSave() {
    setError(null);
    const text = caption.trim();
    if (text.length === 0 && photoCount === 0) {
      setError(t("postsEmptyPostError"));
      return;
    }
    if (caption.length > MAX_CAPTION) {
      setError(t("postsCaptionTooLongError", { max: MAX_CAPTION }));
      return;
    }
    if (photoCount > MAX_PHOTOS) {
      setError(t("postsMaxPhotosError", { max: MAX_PHOTOS }));
      return;
    }
    if (!isSupabaseConfigured) {
      setError(t("postsSupabaseNotConfiguredError"));
      return;
    }

    if (savingRef.current) return; // synchronous double-submit guard
    savingRef.current = true;
    setSaving(true);
    let savedMessage: string | null = null;
    const uploadedPaths: string[] = [];
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error(t("postsNotAuthenticatedError"));

      // 1. Upload new photos to {auth.uid()}/business/{business_id}/{uuid}.{ext}.
      //    If any upload fails, nothing is written to the database.
      const newUrls: string[] = [];
      for (const { file } of staged) {
        const path = `${user.id}/business/${businessId}/${crypto.randomUUID()}.${ALLOWED_TYPES[file.type]}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) {
          setError(t("postsUploadError", { msg: upErr.message }));
          await removePathsBestEffort(uploadedPaths);
          savingRef.current = false;
          setSaving(false);
          return;
        }
        uploadedPaths.push(path);
        newUrls.push(supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
      }

      const mediaUrls = [...keptUrls, ...newUrls];

      if (post === null) {
        // 2a. Create: business_id is always the active business, user_id always auth.uid().
        const { error: insErr } = await supabase.from("posts").insert({
          user_id: user.id,
          business_id: businessId,
          caption: text.length > 0 ? text : null,
          media_urls: mediaUrls,
        });
        if (insErr) throw insErr;
        savedMessage = t("postsCreatedSuccess");
      } else {
        // 2b. Edit: only caption and media_urls, scoped to the active business.
        const { data: updated, error: updErr } = await supabase
          .from("posts")
          .update({ caption: text.length > 0 ? text : null, media_urls: mediaUrls })
          .eq("id", post.id)
          .eq("business_id", businessId)
          .select("id");
        if (updErr) throw updErr;
        if (!updated || updated.length === 0) {
          // RLS filtered the row out: treated as no permission.
          const denied = new Error("row-level security");
          (denied as Error & { code?: string }).code = "42501";
          throw denied;
        }
        // 3. Removed photos leave the bucket only after the update succeeded.
        const removed = post.media_urls.filter((u) => !keptUrls.includes(u));
        await removeFilesBestEffort(removed, businessId);
        savedMessage = t("postsUpdatedSuccess");
      }
    } catch (e: unknown) {
      // The row was not saved: do not leave the freshly uploaded files orphaned.
      await removePathsBestEffort(uploadedPaths);
      setError(isRlsError(e) ? t("postsPermissionError") : t("postsSaveError", { msg: errorMessage(e) }));
      savingRef.current = false;
      setSaving(false);
      return;
    }
    // Outside the try: a failure in the parent callback must not delete saved photos.
    if (savedMessage !== null) onSaved(savedMessage);
  }

  const over = caption.length > MAX_CAPTION;

  return (
    <div
      style={{
        background: "var(--db-bg-surface)",
        border: "1px solid var(--db-border)",
        borderRadius: "var(--db-radius-card)",
        padding: "24px",
        marginBottom: "28px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "20px",
        }}
      >
        <h2 style={{ fontSize: "16px", fontWeight: 600, color: "var(--db-text-primary)" }}>
          {post === null ? t("postsFormNewTitle") : t("postsFormEditTitle")}
        </h2>
        <button
          onClick={onCancel}
          disabled={saving}
          aria-label={tCommon("cancel")}
          style={{
            background: "none",
            border: "none",
            color: "var(--db-text-tertiary)",
            cursor: "pointer",
            padding: "4px",
            display: "flex",
            alignItems: "center",
          }}
        >
          <IconX size={18} />
        </button>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 14px",
            marginBottom: "16px",
            borderRadius: "var(--db-radius)",
            background: "var(--db-bg-elevated)",
            border: "1px solid var(--db-danger)",
            color: "var(--db-danger)",
            fontSize: "13px",
          }}
        >
          <IconAlertCircle size={16} style={{ flexShrink: 0 }} />
          {error}
        </div>
      )}

      {/* Caption */}
      <label
        htmlFor="post-caption"
        style={{
          display: "block",
          fontSize: "12px",
          fontWeight: 600,
          color: "var(--db-text-secondary)",
          marginBottom: "6px",
          letterSpacing: "0.03em",
          textTransform: "uppercase",
        }}
      >
        {t("postsCaptionLabel")}
      </label>
      <textarea
        id="post-caption"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder={t("postsCaptionPlaceholder")}
        rows={4}
        disabled={saving}
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: "var(--db-radius)",
          border: `1px solid ${over ? "var(--db-danger)" : "var(--db-border)"}`,
          background: "var(--db-bg-elevated)",
          color: "var(--db-text-primary)",
          fontSize: "14px",
          resize: "vertical",
          fontFamily: "inherit",
          boxSizing: "border-box",
        }}
      />
      <div
        style={{
          textAlign: "right",
          fontSize: "12px",
          marginTop: "4px",
          color: over ? "var(--db-danger)" : "var(--db-text-tertiary)",
        }}
      >
        {t("postsCaptionCounter", { count: caption.length, max: MAX_CAPTION })}
      </div>

      {/* Photos */}
      <div style={{ marginTop: "16px" }}>
        <div
          style={{
            fontSize: "12px",
            fontWeight: 600,
            color: "var(--db-text-secondary)",
            marginBottom: "6px",
            letterSpacing: "0.03em",
            textTransform: "uppercase",
          }}
        >
          {t("postsPhotosLabel", { count: photoCount, max: MAX_PHOTOS })}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
          {keptUrls.map((url) => (
            <PhotoThumb
              key={url}
              src={url}
              removeLabel={t("postsRemovePhoto")}
              disabled={saving}
              onRemove={() => setKeptUrls((prev) => prev.filter((u) => u !== url))}
            />
          ))}
          {staged.map((p) => (
            <PhotoThumb
              key={p.id}
              src={p.preview}
              removeLabel={t("postsRemovePhoto")}
              disabled={saving}
              onRemove={() => removeStaged(p.id)}
            />
          ))}
          {photoCount < MAX_PHOTOS && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={saving}
              style={{
                width: 84,
                height: 84,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "4px",
                borderRadius: "var(--db-radius)",
                border: "1px dashed var(--db-border)",
                background: "var(--db-bg-elevated)",
                color: "var(--db-text-secondary)",
                fontSize: "11px",
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              <IconPhoto size={20} />
              {t("postsAddPhotos")}
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          style={{ display: "none" }}
        />
        <p style={{ fontSize: "11px", color: "var(--db-text-tertiary)", marginTop: "6px" }}>
          {t("postsPhotosHint")}
        </p>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
        <button
          onClick={onCancel}
          disabled={saving}
          style={{
            padding: "9px 18px",
            borderRadius: "var(--db-radius)",
            border: "1px solid var(--db-border)",
            background: "transparent",
            color: "var(--db-text-secondary)",
            fontSize: "14px",
            cursor: saving ? "not-allowed" : "pointer",
          }}
        >
          {tCommon("cancel")}
        </button>
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "9px 20px",
            borderRadius: "var(--db-radius)",
            border: "none",
            background: saving ? "var(--db-text-tertiary)" : "var(--db-accent)",
            color: "var(--db-accent-text)",
            fontSize: "14px",
            fontWeight: 600,
            cursor: saving ? "not-allowed" : "pointer",
          }}
        >
          <IconCheck size={15} />
          {saving ? t("postsSavingState") : post === null ? t("postsPublishButton") : t("postsSaveButton")}
        </button>
      </div>
    </div>
  );
}

function PhotoThumb({
  src,
  removeLabel,
  disabled,
  onRemove,
}: {
  src: string;
  removeLabel: string;
  disabled: boolean;
  onRemove: () => void;
}) {
  return (
    <div
      style={{
        position: "relative",
        width: 84,
        height: 84,
        borderRadius: "var(--db-radius)",
        overflow: "hidden",
        border: "1px solid var(--db-border)",
        background: "var(--db-bg-elevated)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      <button
        onClick={onRemove}
        disabled={disabled}
        aria-label={removeLabel}
        title={removeLabel}
        style={{
          position: "absolute",
          top: 4,
          right: 4,
          width: 22,
          height: 22,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "999px",
          border: "none",
          background: "var(--db-bg-surface)",
          color: "var(--db-text-primary)",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <IconX size={12} />
      </button>
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
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<BusinessPost | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const requestRef = React.useRef(0);
  const businessId = business?.id ?? null;
  const isVerified = business?.status === "verified";

  // ── Load one page of posts (offset-based, newest first) ─────────────────────
  const loadPosts = useCallback(
    async (offset: number) => {
      if (!isSupabaseConfigured || !businessId) return;
      const requestId = ++requestRef.current;
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

        // A newer load (or a delete / business switch) superseded this one: drop it.
        if (requestId !== requestRef.current) return;
        setPosts((prev) => {
          if (offset === 0) return mapped;
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...mapped.filter((p) => !seen.has(p.id))];
        });
        setHasMore(rows.length === PAGE_SIZE);
      } catch (e: unknown) {
        if (requestId === requestRef.current) {
          setError(t("postsLoadError", { msg: errorMessage(e) }));
        }
      } finally {
        if (requestId === requestRef.current) setLoading(false);
      }
    },
    [businessId, t]
  );

  // Business switched: forget everything from the previous one before loading.
  useEffect(() => {
    setPosts([]);
    setHasMore(false);
    setShowForm(false);
    setEditing(null);
  }, [businessId]);

  useEffect(() => {
    if (businessId) void loadPosts(0);
  }, [businessId, loadPosts]);

  // ── Form open / close ───────────────────────────────────────────────────────
  const openNew = () => {
    setEditing(null);
    setShowForm(true);
    setError(null);
    setSuccess(null);
  };
  const openEdit = (post: BusinessPost) => {
    setEditing(post);
    setShowForm(true);
    setError(null);
    setSuccess(null);
  };
  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
  };
  const handleSaved = (message: string) => {
    closeForm();
    setSuccess(message);
    void loadPosts(0);
  };

  // ── Delete: row first, then files (file failures never block) ───────────────
  const handleDelete = async (post: BusinessPost) => {
    if (!isSupabaseConfigured || !businessId) return;
    setDeletingId(post.id);
    setError(null);
    setSuccess(null);
    try {
      const { data, error: delErr } = await supabase
        .from("posts")
        .delete()
        .eq("id", post.id)
        .eq("business_id", businessId)
        .select("id");
      if (delErr) throw delErr;
      if (!data || data.length === 0) {
        const denied = new Error("row-level security");
        (denied as Error & { code?: string }).code = "42501";
        throw denied;
      }
      await removeFilesBestEffort(post.media_urls, businessId);
      requestRef.current += 1; // invalidate any in-flight load computed before the delete
      setLoading(false);
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
      setSuccess(t("postsDeletedSuccess"));
    } catch (e: unknown) {
      setError(
        isRlsError(e) ? t("postsPermissionError") : t("postsDeleteError", { msg: errorMessage(e) })
      );
    } finally {
      setDeletingId(null);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 900 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: "24px",
          gap: "16px",
          flexWrap: "wrap",
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
            {t("postsPageTitle")}
          </h1>
          <p style={{ fontSize: "14px", color: "var(--db-text-secondary)" }}>
            {t("postsSubtitle")}
          </p>
        </div>
        {businessId && !showForm && (
          <button
            onClick={openNew}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "9px 18px",
              borderRadius: "var(--db-radius)",
              border: "none",
              background: "var(--db-accent)",
              color: "var(--db-accent-text)",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            <IconPlus size={16} />
            {t("postsNewButton")}
          </button>
        )}
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

      {/* Success banner */}
      {success && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "12px 16px",
            marginBottom: "16px",
            borderRadius: "var(--db-radius)",
            background: "var(--db-bg-elevated)",
            border: "1px solid var(--db-success)",
            color: "var(--db-success)",
            fontSize: "14px",
          }}
        >
          <IconCheck size={16} />
          {success}
          <button
            onClick={() => setSuccess(null)}
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

      {/* Create / edit form */}
      {showForm && businessId && (
        <PostForm
          key={editing?.id ?? "new"}
          businessId={businessId}
          post={editing}
          onSaved={handleSaved}
          onCancel={closeForm}
        />
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
                <PostCard
                  key={post.id}
                  post={post}
                  deleting={deletingId === post.id}
                  onEdit={openEdit}
                  onDelete={(p) => void handleDelete(p)}
                />
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
              <p style={{ fontSize: "14px", marginBottom: showForm ? 0 : "16px" }}>
                {t("postsEmptyMessage")}
              </p>
              {!showForm && (
                <button
                  onClick={openNew}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "9px 18px",
                    borderRadius: "var(--db-radius)",
                    border: "none",
                    background: "var(--db-accent)",
                    color: "var(--db-accent-text)",
                    fontSize: "14px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <IconPlus size={16} />
                  {t("postsNewButton")}
                </button>
              )}
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
