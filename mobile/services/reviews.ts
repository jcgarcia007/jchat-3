/**
 * JChat 3.0 — Reviews Service (Task 2.15)
 *
 * Pure async functions wrapping the Supabase `reviews` table.
 * All types are co-located here.
 *
 * Column reference (001_initial_schema.sql + 004_stage2_schema.sql):
 *   id           uuid        PK
 *   user_id      uuid        FK → users(id)
 *   business_id  uuid        FK → businesses(id)
 *   rating       smallint    1–5
 *   body         text        nullable
 *   created_at   timestamptz
 *   response     text        nullable  (added in 004)
 *   responded_at timestamptz nullable  (added in 004)
 *   status       text        'visible'|'reported'|'hidden' default 'visible' (added in 004)
 *
 * Unique constraint: (user_id, business_id) — one review per user per business.
 * `canReview` enforces a 7-day re-review window on top of the DB constraint.
 *
 * TODO(Task 3.8): call createReview() after order is delivered (see RatingPrompt).
 * TODO(i18n)
 */

import { supabase, isSupabaseConfigured } from './supabase';

// ── Co-located types ───────────────────────────────────────────────────────

/** Mirrors the `reviews` table columns (full schema after 004). */
export interface ReviewRow {
  id: string;
  user_id: string;
  business_id: string;
  rating: number; // 1–5
  body: string | null;
  created_at: string;
  response: string | null;
  responded_at: string | null;
  status: 'visible' | 'reported' | 'hidden';
}

/** ReviewRow enriched with author profile data. */
export interface ReviewWithAuthor extends ReviewRow {
  author: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

/** Input for creating a new review. */
export interface CreateReviewInput {
  businessId: string;
  rating: number; // 1–5
  body?: string;
}

/** Return shape of getAverageRating. */
export interface AverageRating {
  avg: number;
  count: number;
}

// ── createReview ────────────────────────────────────────────────────────────

/**
 * Insert a new review for a business.
 *
 * Throws if:
 *   - Supabase is not configured.
 *   - The user is not authenticated.
 *   - `canReview` returns false (reviewed within the last 7 days).
 *   - The insert fails (DB unique constraint, RLS, etc.).
 *
 * The `user_id` is taken from the active Supabase session — the RLS policy
 * ("reviews: authenticated insert own") enforces auth.uid() = user_id.
 *
 * TODO(Task 3.8): call this from the post-order delivery hook.
 */
export async function createReview(input: CreateReviewInput): Promise<ReviewRow> {
  if (!isSupabaseConfigured) {
    return Promise.reject(new Error('Supabase is not configured'));
  }

  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) {
    throw new Error('User must be authenticated to submit a review');
  }

  const userId = userData.user.id;

  const allowed = await canReview(input.businessId, userId);
  if (!allowed) {
    throw new Error('You can only review this business once every 7 days');
  }

  const { data, error } = await supabase
    .from('reviews')
    .insert({
      user_id: userId,
      business_id: input.businessId,
      rating: input.rating,
      body: input.body ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as ReviewRow;
}

// ── getBusinessReviews ─────────────────────────────────────────────────────

/**
 * Fetch all visible reviews for a business, ordered newest-first.
 * Includes a join on the author's profile so the UI can display name/avatar.
 *
 * Only reviews with status = 'visible' are returned to clients.
 * Reported/hidden reviews are managed by Super Admin (see dashboard page).
 */
export async function getBusinessReviews(
  businessId: string,
): Promise<ReviewWithAuthor[]> {
  if (!isSupabaseConfigured) return [];

  const { data, error } = await supabase
    .from('reviews')
    .select(`
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
    `)
    .eq('business_id', businessId)
    .eq('status', 'visible')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as ReviewWithAuthor[];
}

// ── getAverageRating ───────────────────────────────────────────────────────

/**
 * Compute the average rating and total count for a business.
 *
 * Only includes reviews with status = 'visible'.
 * Returns { avg: 0, count: 0 } when there are no reviews.
 *
 * Exposed so mobile profile screens (Task 1.7 wiring) can display the
 * aggregate without fetching individual review rows.
 */
export async function getAverageRating(businessId: string): Promise<AverageRating> {
  if (!isSupabaseConfigured) return { avg: 0, count: 0 };

  const { data, error } = await supabase
    .from('reviews')
    .select('rating')
    .eq('business_id', businessId)
    .eq('status', 'visible');

  if (error) throw error;
  if (!data || data.length === 0) return { avg: 0, count: 0 };

  const count = data.length;
  const sum = data.reduce((acc, row) => acc + (row.rating as number), 0);
  return { avg: sum / count, count };
}

// ── respondToReview ────────────────────────────────────────────────────────

/**
 * Let a business owner post (or update) a response to a review.
 *
 * Only the business owner should call this. Enforcement is at the RLS level
 * via the "reviews: author update" policy — owners must have permission to
 * update review rows for their business (or a separate policy for owner response).
 *
 * NOTE: The current RLS policy allows only the review *author* to update their
 * own row. A production implementation should add a separate RLS policy that
 * allows the business owner (matched via the businesses table) to update
 * `response` and `responded_at` only. For now, this is called from the
 * server-side dashboard (Next.js) where the session is the owner's.
 *
 * TODO(RLS): add "reviews: business owner update response" policy when
 *   the owner authentication flow (Task 2.1) is fully wired.
 */
export async function respondToReview(
  reviewId: string,
  response: string,
): Promise<void> {
  if (!isSupabaseConfigured) {
    return Promise.reject(new Error('Supabase is not configured'));
  }

  const { error } = await supabase
    .from('reviews')
    .update({
      response,
      responded_at: new Date().toISOString(),
    })
    .eq('id', reviewId);

  if (error) throw error;
}

// ── reportReview ───────────────────────────────────────────────────────────

/**
 * Flag a review as reported (status → 'reported').
 *
 * Reported reviews are hidden from the public listing (getBusinessReviews
 * filters to status = 'visible') and queued for Super Admin moderation.
 *
 * TODO(Super Admin): reported reviews route to the Super Admin review queue.
 */
export async function reportReview(reviewId: string): Promise<void> {
  if (!isSupabaseConfigured) {
    return Promise.reject(new Error('Supabase is not configured'));
  }

  const { error } = await supabase
    .from('reviews')
    .update({ status: 'reported' })
    .eq('id', reviewId);

  if (error) throw error;
}

// ── canReview ──────────────────────────────────────────────────────────────

/**
 * Returns true if the user is allowed to submit a new review for the business.
 *
 * Rules:
 *   1. The user has never reviewed this business, OR
 *   2. Their most recent review is older than 7 days.
 *
 * This is a client-side guard that supplements the DB unique constraint
 * (which prevents duplicate rows entirely). In practice, the unique(user_id,
 * business_id) constraint means a second review will always fail at the DB
 * level; `canReview` gives a friendlier early rejection with the time message.
 *
 * NOTE: If the unique constraint is later relaxed (e.g. one review per visit),
 * update this function to check within the 7-day window only.
 */
export async function canReview(businessId: string, userId: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;

  const { data, error } = await supabase
    .from('reviews')
    .select('created_at')
    .eq('business_id', businessId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return true; // no previous review → allowed

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const lastReviewDate = new Date(data.created_at);
  return lastReviewDate < sevenDaysAgo;
}
