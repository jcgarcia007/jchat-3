import AsyncStorage from '@react-native-async-storage/async-storage';
import { isSupabaseConfigured, supabase } from './supabase';
import { AppError } from '../utils/errors';

const ONBOARDING_COMPLETED_KEY = 'onboarding.completed';

export async function hasLocalOnboardingCompletion(): Promise<boolean> {
  return (await AsyncStorage.getItem(ONBOARDING_COMPLETED_KEY)) === 'true';
}

export async function storeLocalOnboardingCompletion(): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
}

export async function getOnboardingCompleted(userId: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;

  const { data, error } = await supabase
    .from('users')
    .select('onboarding_completed')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return data?.onboarding_completed === true;
}

export async function completeOnboarding(userId: string): Promise<void> {
  if (!isSupabaseConfigured) throw new AppError('NOT_CONFIGURED');

  const { error } = await supabase
    .from('users')
    .update({ onboarding_completed: true })
    .eq('id', userId);

  if (error) throw error;
}
