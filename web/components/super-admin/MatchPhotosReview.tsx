/**
 * JChat 3.0 — Super Admin: Match photo review queue.
 *
 * Lists photos the automatic moderation left pending with needs_review = true
 * (rpc admin_list_match_photos_for_review). The admin approves or rejects them
 * (rpc admin_review_match_photo); a rejection also deletes the Storage object
 * through a server route that re-checks is_platform_admin with the caller's session.
 *
 * Tokens only (var(--*)). Icons: @tabler/icons-react.
 */

"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { SupabaseClient } from "@supabase/supabase-js";
import { IconPhoto, IconCheck, IconX, IconLoader2 } from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { formatRelativeTime } from "@/lib/relativeTime";

const BUCKET = "match-photos";
const SIGNED_URL_TTL_S = 3600;
const SCORE_KEYS = ["adult", "racy", "violence", "medical", "spoof"] as const;
type ScoreKey = typeof SCORE_KEYS[number];

interface ReviewPhoto {
  id: string;
  user_id: string;
  path: string;
  moderation: Partial<Record<ScoreKey, string>> | null;
  created_at: string;
  url: string | null;
}

/** match_photos RPCs are not in the generated types yet → untyped client. */
const db = supabase as unknown as SupabaseClient;

function scoreColor(value: string | undefined): string {
  if (value === "LIKELY" || value === "VERY_LIKELY") return "var(--color-danger)";
  if (value === "POSSIBLE") return "var(--color-warning)";
  return "var(--text-tertiary)";
}

export default function MatchPhotosReview({
  onToast,
}: {
  onToast?: (message: string) => void;
}) {
  const ta = useTranslations("superAdmin.alerts");
  const t = useTranslations("superAdmin.relativeTime");
  const [photos, setPhotos] = useState<ReviewPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: listError } = await db.rpc("admin_list_match_photos_for_review", { p_limit: 50 });
    if (listError) {
      setError(ta("matchPhotosLoadError"));
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as Omit<ReviewPhoto, "url">[];
    const withUrls: ReviewPhoto[] = await Promise.all(
      rows.map(async (row) => {
        const { data: signed } = await db.storage.from(BUCKET).createSignedUrl(row.path, SIGNED_URL_TTL_S);
        return { ...row, url: signed?.signedUrl ?? null };
      }),
    );
    setPhotos(withUrls);
    setLoading(false);
  }, [ta]);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(photo: ReviewPhoto, approve: boolean) {
    setBusyId(photo.id);
    setError(null);
    const reason = approve ? null : (reasons[photo.id]?.trim() || null);
    const { error: reviewError } = await db.rpc("admin_review_match_photo", {
      p_photo_id: photo.id,
      p_approve: approve,
      p_reason: reason,
    });
    if (reviewError) {
      setError(ta("matchPhotosActionError"));
      setBusyId(null);
      return;
    }
    if (!approve) {
      // The row is already rejected; now delete the object server-side (re-checks admin with the user's session).
      const res = await fetch("/api/super-admin/match-photos/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo_id: photo.id }),
      }).catch(() => null);
      if (!res || !res.ok) setError(ta("matchPhotosRemoveError"));
    }
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    onToast?.(approve ? ta("matchPhotoApprovedToast") : ta("matchPhotoRejectedToast"));
    setBusyId(null);
  }

  return (
    <div style={{ marginBottom: "24px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
        <IconPhoto size={15} stroke={1.6} style={{ color: "var(--color-brand)" }} />
        <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
          {ta("matchPhotosSectionTitle")}
        </span>
        <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>{photos.length}</span>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            padding: "10px 12px",
            marginBottom: "10px",
            borderRadius: "8px",
            border: "1px solid var(--color-danger)",
            background: "rgb(var(--color-danger-rgb) / 0.12)",
            color: "var(--text-primary)",
            fontSize: "13px",
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <IconLoader2 size={18} style={{ color: "var(--text-tertiary)", animation: "spin 1s linear infinite" }} />
      ) : photos.length === 0 ? (
        <div style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>{ta("matchPhotosEmpty")}</div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: "12px",
          }}
        >
          {photos.map((photo) => (
            <div
              key={photo.id}
              style={{
                border: "1px solid var(--border-subtle)",
                borderRadius: "10px",
                background: "var(--bg-surface)",
                overflow: "hidden",
              }}
            >
              {photo.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photo.url}
                  alt={ta("matchPhotoAlt")}
                  style={{ width: "100%", height: "220px", objectFit: "cover", display: "block" }}
                />
              ) : (
                <div style={{ height: "220px", background: "var(--bg-elevated)" }} />
              )}
              <div style={{ padding: "10px 12px" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
                  {SCORE_KEYS.map((key) => (
                    <span
                      key={key}
                      style={{
                        fontSize: "11px",
                        padding: "2px 6px",
                        borderRadius: "999px",
                        border: `1px solid ${scoreColor(photo.moderation?.[key])}`,
                        color: scoreColor(photo.moderation?.[key]),
                      }}
                    >
                      {ta(`matchPhotoScore_${key}`)}: {photo.moderation?.[key] ?? "—"}
                    </span>
                  ))}
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginBottom: "8px" }}>
                  {formatRelativeTime(photo.created_at, t, { granularity: "time" })}
                </div>
                <input
                  type="text"
                  value={reasons[photo.id] ?? ""}
                  onChange={(e) => setReasons((prev) => ({ ...prev, [photo.id]: e.target.value }))}
                  placeholder={ta("matchPhotoReasonPlaceholder")}
                  maxLength={200}
                  aria-label={ta("matchPhotoReasonPlaceholder")}
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    marginBottom: "8px",
                    borderRadius: "6px",
                    border: "1px solid var(--border-subtle)",
                    background: "var(--bg-base)",
                    color: "var(--text-primary)",
                    fontSize: "12px",
                  }}
                />
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={() => void review(photo, true)}
                    disabled={busyId === photo.id}
                    style={{
                      flex: 1,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "4px",
                      padding: "6px 10px",
                      borderRadius: "6px",
                      border: "none",
                      background: "var(--color-success)",
                      color: "var(--on-brand)",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: busyId === photo.id ? "default" : "pointer",
                      opacity: busyId === photo.id ? 0.6 : 1,
                    }}
                  >
                    <IconCheck size={14} stroke={2} />
                    {ta("matchPhotoApprove")}
                  </button>
                  <button
                    onClick={() => void review(photo, false)}
                    disabled={busyId === photo.id}
                    style={{
                      flex: 1,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "4px",
                      padding: "6px 10px",
                      borderRadius: "6px",
                      border: "none",
                      background: "var(--color-danger)",
                      color: "var(--on-brand)",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: busyId === photo.id ? "default" : "pointer",
                      opacity: busyId === photo.id ? 0.6 : 1,
                    }}
                  >
                    <IconX size={14} stroke={2} />
                    {ta("matchPhotoReject")}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
