/**
 * JChat 3.0 — Shared Supabase client (Stage 1 prerequisite)
 *
 * Single source of truth for the Supabase JS client across the mobile app.
 * Reads EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY from env.
 * Falls back to harmless placeholders so the app still boots (and tsc passes)
 * before a real backend is configured — network calls will simply fail until
 * `.env` is filled in (see .env.example).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'public-anon-placeholder-key';

/** True when real Supabase credentials are present (use to guard live calls). */
export const isSupabaseConfigured =
  !!process.env.EXPO_PUBLIC_SUPABASE_URL &&
  !!process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
