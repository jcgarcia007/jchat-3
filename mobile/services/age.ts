/**
 * JChat 3.0 — Age confirmation (18+), server side.
 *
 * The full birth date is only ever sent to the `confirm_age` RPC (migration 185),
 * which verifies 18+ and stores ONLY the birth year + confirmation timestamp.
 * It is never persisted client-side (no AsyncStorage, no auth metadata).
 */

import { supabase } from './supabase';

export type ConfirmAgeResult = 'ok' | 'underage' | 'error';

/** YYYY-MM-DD from the LOCAL calendar date the user picked (no timezone shift). */
export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Latest date a user can pick (today). */
export function pickerMaxDate(): Date {
  return new Date();
}

export async function confirmAge(birthDate: Date): Promise<ConfirmAgeResult> {
  try {
    const { data, error } = await supabase.rpc('confirm_age', {
      p_birth_date: toIsoDate(birthDate),
    });
    if (error) return 'error';
    const res = data as { ok?: boolean; reason?: string } | null;
    if (res?.ok === true) return 'ok';
    if (res?.ok === false && res.reason === 'underage') return 'underage';
    return 'error';
  } catch {
    return 'error';
  }
}

/** true = confirmed, false = must ask, null = could not read (fail closed → retry). */
export async function fetchAgeConfirmed(userId: string): Promise<boolean | null> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('age_confirmed_at')
      .eq('id', userId)
      .single();
    if (error || !data) return null;
    return data.age_confirmed_at != null;
  } catch {
    return null;
  }
}
