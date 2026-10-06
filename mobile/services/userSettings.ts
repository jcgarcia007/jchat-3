import { isSupabaseConfigured, supabase } from './supabase';
import type { AppearancePreference } from '../theme/appearance';
import { isFeedRadiusMiles, type FeedRadiusMiles } from '../utils/distanceUnits';

export type ProximityMode = 'all' | 'favorites' | 'visited' | 'off';
export type UserLanguage = 'en' | 'es';
/** Lock-screen push preview level: full = name + text, name = name only, discreet = neutral. */
export type PushPreview = 'full' | 'name' | 'discreet';
export interface UserSettings {
  notifWork: boolean;
  notifSocial: boolean;
  proximityMode: ProximityMode;
  language: UserLanguage;
  appearance: AppearancePreference;
  /** Megaphone search radius. Always stored in miles. */
  feedRadiusMiles: FeedRadiusMiles;
  /** Match / games (migration 189). Server default: true. */
  gamesEnabled: boolean;
  /** Server default: 'discreet'. */
  pushPreviewMatch: PushPreview;
  /** Server default: 'full'. */
  pushPreviewDm: PushPreview;
  matchNotifyNewPeople: boolean;
  /** Age filter bounds, 18–99 (never shown as anyone's age). */
  matchAgeMin: number;
  matchAgeMax: number;
}

export type SettingsPatch = Partial<Pick<
  UserSettings,
  | 'notifWork' | 'notifSocial' | 'proximityMode' | 'appearance' | 'feedRadiusMiles'
  | 'gamesEnabled' | 'pushPreviewMatch' | 'pushPreviewDm' | 'matchNotifyNewPeople'
  | 'matchAgeMin' | 'matchAgeMax'
>>;

function isProximityMode(value: unknown): value is ProximityMode {
  return value === 'all' || value === 'favorites' || value === 'visited' || value === 'off';
}

function isPushPreview(value: unknown): value is PushPreview {
  return value === 'full' || value === 'name' || value === 'discreet';
}

function isAge(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 18 && value <= 99;
}

function isAppearancePreference(value: unknown): value is AppearancePreference {
  return value === 'dark' || value === 'light' || value === 'system';
}

export async function loadUserSettings(userId: string): Promise<Partial<UserSettings>> {
  if (!isSupabaseConfigured) return {};

  const { data, error } = await supabase
    .from('users')
    .select('language, settings')
    .eq('id', userId)
    .single();

  if (error) throw error;

  const dbSettings = data?.settings && typeof data.settings === 'object' && !Array.isArray(data.settings)
    ? data.settings as Record<string, unknown>
    : {};

  const loaded = {
    language: data?.language === 'es' ? 'es' : data?.language === 'en' ? 'en' : undefined,
    notifWork: typeof dbSettings.notifWork === 'boolean' ? dbSettings.notifWork : undefined,
    notifSocial: typeof dbSettings.notifSocial === 'boolean' ? dbSettings.notifSocial : undefined,
    proximityMode: isProximityMode(dbSettings.proximityMode) ? dbSettings.proximityMode : undefined,
    appearance: isAppearancePreference(dbSettings.appearance) ? dbSettings.appearance : undefined,
    feedRadiusMiles: isFeedRadiusMiles(dbSettings.feedRadiusMiles) ? dbSettings.feedRadiusMiles : undefined,
    gamesEnabled: typeof dbSettings.gamesEnabled === 'boolean' ? dbSettings.gamesEnabled : undefined,
    pushPreviewMatch: isPushPreview(dbSettings.pushPreviewMatch) ? dbSettings.pushPreviewMatch : undefined,
    pushPreviewDm: isPushPreview(dbSettings.pushPreviewDm) ? dbSettings.pushPreviewDm : undefined,
    matchNotifyNewPeople: typeof dbSettings.matchNotifyNewPeople === 'boolean' ? dbSettings.matchNotifyNewPeople : undefined,
    matchAgeMin: isAge(dbSettings.matchAgeMin) ? dbSettings.matchAgeMin : undefined,
    matchAgeMax: isAge(dbSettings.matchAgeMax) ? dbSettings.matchAgeMax : undefined,
  };
  // Missing values are omitted (not explicit undefined) so spreading over the defaults keeps them.
  return Object.fromEntries(Object.entries(loaded).filter(([, v]) => v !== undefined)) as Partial<UserSettings>;
}

export async function updateMySettings(patch: SettingsPatch): Promise<Record<string, unknown>> {
  if (!isSupabaseConfigured) return patch;

  const { data, error } = await supabase.rpc('update_my_settings', { p_patch: patch });
  if (error) throw error;

  return data && typeof data === 'object' && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
}

export async function updateMyLanguage(
  userId: string,
  language: UserLanguage,
): Promise<void> {
  if (!isSupabaseConfigured) return;

  const { error } = await supabase
    .from('users')
    .update({ language })
    .eq('id', userId);

  if (error) throw error;
}
