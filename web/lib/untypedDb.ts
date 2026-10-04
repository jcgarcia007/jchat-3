/**
 * JChat 3.0 — Untyped browser Supabase client.
 *
 * Match tables/columns added by migrations 189–193 (business_games, match_kicks, reports.business_id,
 * match_* RPCs) are not in lib/database.types.ts yet (not regenerated on purpose). Use this
 * client ONLY for those; everything else keeps the typed `supabase` client. Remove once the
 * types are regenerated.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export const untypedDb = supabase as unknown as SupabaseClient;
