/**
 * JChat 3.0 — 18+ age gate helper for server layouts / route handlers.
 *
 * `users.age_confirmed_at` is set ONLY by the `confirm_age` RPC (migration 185),
 * which stores just the birth year + the confirmation timestamp. Anyone signed in
 * without it (email, Google, Apple, or an account created before the gate) is sent
 * to /auth/confirm-age. Fails CLOSED: if the status can't be read, the user is
 * also sent there (the page shows a retry instead of letting them in).
 */

import { redirect } from "next/navigation";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export function confirmAgeUrl(next: string): string {
  return `/auth/confirm-age?next=${encodeURIComponent(next)}`;
}

/** true only when the server has a confirmation for this user. */
export async function isAgeConfirmed(supabase: ServerClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("users")
    .select("age_confirmed_at")
    .eq("id", userId)
    .maybeSingle();
  return !error && data?.age_confirmed_at != null;
}

/** Redirects to the age-confirmation page unless the user is confirmed. */
export async function requireAgeConfirmed(
  supabase: ServerClient,
  userId: string,
  next: string,
): Promise<void> {
  if (!(await isAgeConfirmed(supabase, userId))) redirect(confirmAgeUrl(next));
}
