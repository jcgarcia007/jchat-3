import { isSupabaseConfigured, supabase } from './supabase';

export type ProximityMode = 'all' | 'favorites' | 'visited' | 'off';
export type UserLanguage = 'en' | 'es';
export type AppearancePreference = 'dark' | 'light' | 'system';

export interface UserSettings {
  notifWork: boolean;
  notifSocial: boolean;
  proximityMode: ProximityMode;
  language: UserLanguage;
  appearance: AppearancePreference;
}

export type SettingsPatch = Partial<Pick<
  UserSettings,
  'notifWork' | 'notifSocial' | 'proximityMode' | 'appearance'
>>;

function isProximityMode(value: unknown): value is ProximityMode {
  return value === 'all' || value === 'favorites' || value === 'visited' || value === 'off';
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

  return {
    language: data?.language === 'es' ? 'es' : data?.language === 'en' ? 'en' : undefined,
    notifWork: typeof dbSettings.notifWork === 'boolean' ? dbSettings.notifWork : undefined,
    notifSocial: typeof dbSettings.notifSocial === 'boolean' ? dbSettings.notifSocial : undefined,
    proximityMode: isProximityMode(dbSettings.proximityMode) ? dbSettings.proximityMode : undefined,
    appearance: isAppearancePreference(dbSettings.appearance) ? dbSettings.appearance : undefined,
  };
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
