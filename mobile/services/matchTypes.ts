/**
 * JChat 3.0 — Match shared types (Fase D2+)
 *
 * Shapes returned by the Match RPCs (migrations 189–194). Deck cards NEVER carry an age
 * (the age filter is server-side) nor an email.
 */

/** A person as shown in the deck, in a profile or in the activity lists. */
export interface MatchCard {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_verified: boolean;
  /** Storage PATHS in the private `match-photos` bucket (approved photos only). */
  photos: string[];
  /** Interest keys. */
  interests: string[];
  /** Interest keys shared with the viewer. */
  common_interests?: string[];
  /** This person sent me a Super Like (deck highlights it with a blue border). */
  super_liked_me?: boolean;
}

export type MatchPhotoStatus = 'pending' | 'approved' | 'rejected';

/** One of MY match photos (with a short-lived signed URL for display). */
export interface MatchPhoto {
  id: string;
  user_id: string;
  path: string;
  sort: number;
  status: MatchPhotoStatus;
  rejection_reason: string | null;
  needs_review: boolean;
  created_at: string;
  url: string | null;
}

export interface InterestRow {
  key: string;
  name_es: string;
  name_en: string;
  sort: number;
}

/** Display name for a card: display_name, else @username, else null (never email). */
export function cardName(card: Pick<MatchCard, 'display_name' | 'username'>): string | null {
  const name = card.display_name?.trim();
  if (name) return name;
  return card.username ? `@${card.username}` : null;
}
