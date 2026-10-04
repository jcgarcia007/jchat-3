/**
 * JChat 3.0 — Super Admin: remove a rejected Match photo from Storage.
 *
 * POST /api/super-admin/match-photos/remove   Body: { photo_id: string }
 *
 * 1. Authenticates the CALLER with their own session (anon key + cookies): is_platform_admin()
 *    runs with the user's JWT, never with the service role. Not an admin → 403.
 * 2. Only then uses supabaseAdmin (service role) to delete the object — and only for photos
 *    already marked 'rejected' (admin_review_match_photo), never an approved/pending one.
 */

import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabaseAdmin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const BUCKET = "match-photos";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  // 1) Caller must be a platform admin, verified with THEIR session.
  const userClient = await createSupabaseServerClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: isAdmin, error: adminError } = await userClient.rpc("is_platform_admin");
  if (adminError || isAdmin !== true) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  let photoId: unknown;
  try {
    ({ photo_id: photoId } = await req.json());
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (typeof photoId !== "string" || !UUID_RE.test(photoId)) {
    return NextResponse.json({ error: "invalid_photo_id" }, { status: 400 });
  }

  // 2) Service role from here on. match_photos is not in the generated types yet → untyped client.
  const admin = supabaseAdmin as unknown as SupabaseClient;
  const { data: photo, error: photoError } = await admin
    .from("match_photos")
    .select("path, status")
    .eq("id", photoId)
    .maybeSingle();
  if (photoError) return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  if (!photo) return NextResponse.json({ ok: true, removed: false });
  if (photo.status !== "rejected") {
    return NextResponse.json({ error: "not_rejected" }, { status: 409 });
  }

  const { error: removeError } = await admin.storage.from(BUCKET).remove([photo.path as string]);
  if (removeError) return NextResponse.json({ error: "remove_failed" }, { status: 500 });

  return NextResponse.json({ ok: true, removed: true });
}
