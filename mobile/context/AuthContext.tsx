/**
 * JChat 3.0 — Auth context (Stage 1 prerequisite, replaces Task 0.7 useAuthStub)
 *
 * Wraps Supabase auth session. `isAuthenticated` is derived from a live session
 * OR a local dev bypass (so the nav shell stays testable before real login is
 * wired end-to-end against a backend). Screens consume this via `useAuth()`.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';
import { isBiometricEnabled } from '../services/biometric';
import { fetchAgeConfirmed } from '../services/age';
import i18n, { changeAppLanguage } from '../i18n';
import type { SupportedLanguage } from '../i18n';

/** Server-side 18+ confirmation state of the signed-in user. */
export type AgeStatus = 'loading' | 'confirmed' | 'required' | 'error';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  /**
   * True when a RESTORED session must pass the biometric gate before entering
   * the app. Set only on cold start (never on a fresh login / background return).
   */
  locked: boolean;
  /** Clear the biometric gate (called by LockScreen after a successful Face ID). */
  unlock: () => void;
  /**
   * True right after a FRESH sign-in in this app session (not cold-start restore).
   * Used to offer the post-login biometric enrollment prompt once.
   */
  justSignedIn: boolean;
  /** Clear the fresh-sign-in signal (called once the enrollment prompt has been handled). */
  clearJustSignedIn: () => void;
  /** True while a verified OTP recovery session is isolated from the normal app. */
  isRecovering: boolean;
  /** Persist recovery intent before verifyOtp creates its authenticated session. */
  beginRecovery: () => Promise<void>;
  /** Clear the recovery state after saving or cancelling. */
  clearRecovery: () => Promise<void>;
  /**
   * 18+ gate. The app (tabs) must NOT render unless this is 'confirmed':
   * 'required' = users.age_confirmed_at is null; 'error' = could not read it
   * (fail closed — the gate shows "Retry").
   */
  ageStatus: AgeStatus;
  /** Re-read users.age_confirmed_at (after confirm_age, or on Retry). */
  refreshAge: () => Promise<void>;
  /** Keep the gate in 'loading' while a sign-up flow calls confirm_age itself. */
  holdAgeGate: (hold: boolean) => void;
  /** Dev-only: enter the app without a real session (placeholder buttons). */
  devBypass: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const RECOVERY_PENDING_KEY = 'jchat.recovery_pending';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [bypass, setBypass] = useState(false);
  const [locked, setLocked] = useState(false);
  const [justSignedIn, setJustSignedIn] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  // Age state is keyed by user id so a stale value can never leak across accounts.
  const [ageState, setAgeState] = useState<{ userId: string; status: AgeStatus } | null>(null);
  const [ageHold, setAgeHold] = useState(false);
  // True once the initial getSession has resolved. Guards justSignedIn so that
  // startup events ('INITIAL_SESSION' or a restore that fires 'SIGNED_IN' in some
  // versions) don't look like a fresh login.
  const initializedRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    // Intercepts sign-up / email-change confirmation links. Password recovery no
    // longer uses links; the user enters the emailed OTP inside the app instead.
    async function handleAuthUrl(url: string) {
      const isConfirm = url.includes('://confirm');
      if (!isConfirm) return;
      const ok = await exchangeAuthUrl(url);
      if (!mounted) return;
      if (ok) {
        Alert.alert(i18n.t('auth:confirmEmail.successTitle'), i18n.t('auth:confirmEmail.successMessage'));
      } else {
        Alert.alert(i18n.t('auth:confirmEmail.errorTitle'), i18n.t('auth:confirmEmail.errorMessage'));
      }
    }

    /** Establishes the session carried by an auth deep link. Returns true on success. */
    async function exchangeAuthUrl(url: string): Promise<boolean> {
      const parsed = Linking.parse(url);
      const code = typeof parsed.queryParams?.code === 'string' ? parsed.queryParams.code : null;
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        return !error;
      }
      // Implicit flow: tokens in fragment (#access_token=...&refresh_token=...&type=recovery|signup)
      const hash = url.includes('#') ? url.slice(url.indexOf('#') + 1) : '';
      const frag: Record<string, string> = {};
      for (const pair of hash.split('&')) {
        if (!pair) continue;
        const eq = pair.indexOf('=');
        const k = decodeURIComponent(eq >= 0 ? pair.slice(0, eq) : pair);
        const v = decodeURIComponent(eq >= 0 ? pair.slice(eq + 1) : '');
        frag[k] = v;
      }
      if (frag.access_token && frag.refresh_token) {
        const { error } = await supabase.auth.setSession({
          access_token: frag.access_token,
          refresh_token: frag.refresh_token,
        });
        return !error;
      }
      // Expired / already-used link: Supabase redirects with #error=…&error_code=otp_expired
      return false;
    }

    // Cold start: a persisted recovery flag means the app closed before the user
    // saved a new password. Discard that recovery session before showing any UI.
    void (async () => {
      const recoveryPending = await AsyncStorage.getItem(RECOVERY_PENDING_KEY);
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;

      if (recoveryPending === '1') {
        if (data.session) {
          const { error } = await supabase.auth.signOut({ scope: 'local' });
          if (error) {
            // Never expose the normal app if local cleanup could not be confirmed.
            // Keep the persisted barrier and recovery UI so Cancel can retry.
            console.warn('[AuthContext] recovery session cleanup failed:', error.message);
            if (!mounted) return;
            setSession(data.session);
            setIsRecovering(true);
            setLocked(false);
            setLoading(false);
            initializedRef.current = true;
            return;
          }
        }
        await AsyncStorage.removeItem(RECOVERY_PENDING_KEY);
        if (!mounted) return;
        setSession(null);
        setIsRecovering(false);
        setLocked(false);
      } else {
        setSession(data.session);
      }

      if (recoveryPending !== '1' && data.session && (await isBiometricEnabled())) {
        if (mounted) setLocked(true);
      }
      if (mounted) setLoading(false);
      // Initialization complete — any SIGNED_IN after this point is a fresh login.
      initializedRef.current = true;
      // Registration confirmation still uses a deep link.
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl && mounted) await handleAuthUrl(initialUrl);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      // The cold-start routine above owns initial restoration and recovery cleanup.
      if (!initializedRef.current) return;
      // Never touch `locked` here — a fresh sign-in must enter the app directly.
      setSession(next);
      // Only a fresh login (after init) offers the enrollment prompt.
      if (_event === 'SIGNED_IN' && initializedRef.current) {
        setJustSignedIn(true);
      }
    });

    // Warm start: app already open when the user taps a confirmation link.
    const linkSub = Linking.addEventListener('url', ({ url }) => { void handleAuthUrl(url); });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      linkSub.remove();
    };
  }, []);

  // Sync i18n language with the user's DB preference after login / session restore.
  // The DB (users.language) takes priority over the device locale. Runs once when
  // session.user.id becomes available — a single-field, single-row query.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;

    // Registration with email confirmation ON: the profile the user chose in
    // RegisterStep2 couldn't be saved without a session, so it travels in
    // user_metadata.pending_profile. Apply it on the first authenticated session,
    // then clear it. On failure (e.g. username taken meanwhile) the row keeps the
    // trigger-derived defaults and we retry next session.
    const pending = session?.user?.user_metadata?.pending_profile as
      | { username?: string; display_name?: string | null; language?: SupportedLanguage }
      | null
      | undefined;
    if (pending && typeof pending.username === 'string') {
      void (async () => {
        const { error } = await supabase
          .from('users')
          .update({
            username: pending.username,
            display_name: pending.display_name ?? null,
            language: pending.language ?? 'en',
          })
          .eq('id', userId);
        if (error) {
          console.warn('[AuthContext] pending_profile apply failed:', error.message);
          return;
        }
        if (pending.language === 'en' || pending.language === 'es') changeAppLanguage(pending.language);
        await supabase.auth.updateUser({ data: { pending_profile: null } });
      })();
      // The pending profile carries the language — skip the DB read below so a
      // stale 'en' (trigger default) can't race and override it.
      return;
    }

    void supabase
      .from('users')
      .select('language')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (data?.language && (data.language === 'en' || data.language === 'es')) {
          changeAppLanguage(data.language as SupportedLanguage);
        }
      });
  }, [session?.user?.id]);

  const refreshAge = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) return;
    const confirmed = await fetchAgeConfirmed(userId);
    setAgeState({
      userId,
      status: confirmed === null ? 'error' : confirmed ? 'confirmed' : 'required',
    });
  }, [session?.user?.id]);

  // Read the 18+ confirmation whenever the signed-in user changes (email, Google,
  // Apple and pre-existing accounts all go through here).
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      setAgeState(null);
      return;
    }
    let cancelled = false;
    void fetchAgeConfirmed(userId).then((confirmed) => {
      if (cancelled) return;
      setAgeState({
        userId,
        status: confirmed === null ? 'error' : confirmed ? 'confirmed' : 'required',
      });
    });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const holdAgeGate = useCallback((hold: boolean) => setAgeHold(hold), []);

  const unlock = useCallback(() => setLocked(false), []);
  const clearJustSignedIn = useCallback(() => setJustSignedIn(false), []);
  const beginRecovery = useCallback(async () => {
    await AsyncStorage.setItem(RECOVERY_PENDING_KEY, '1');
    setIsRecovering(true);
  }, []);
  const clearRecovery = useCallback(async () => {
    await AsyncStorage.removeItem(RECOVERY_PENDING_KEY);
    setIsRecovering(false);
  }, []);
  const devBypass = useCallback(() => setBypass(true), []);
  const signOut = useCallback(async () => {
    const userId = session?.user?.id;
    if (userId) {
      try {
        const { error } = await supabase
          .from('users')
          .update({ push_token: null })
          .eq('id', userId);
        if (error) {
          console.warn('[AuthContext] Failed to clear push token before sign out:', error.message);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.warn('[AuthContext] Failed to clear push token before sign out:', message);
      }
    }
    setBypass(false);
    setLocked(false);
    setJustSignedIn(false);
    setAgeHold(false);
    await supabase.auth.signOut();
  }, [session?.user?.id]);

  const ageStatus: AgeStatus = bypass && !session
    ? 'confirmed'
    : ageHold || !session || ageState?.userId !== session.user.id
      ? 'loading'
      : ageState.status;

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      isAuthenticated: !!session || bypass,
      locked,
      unlock,
      justSignedIn,
      clearJustSignedIn,
      isRecovering,
      beginRecovery,
      clearRecovery,
      ageStatus,
      refreshAge,
      holdAgeGate,
      devBypass,
      signOut,
    }),
    [ageStatus, refreshAge, holdAgeGate, session, loading, bypass, locked, unlock, justSignedIn, clearJustSignedIn, isRecovering, beginRecovery, clearRecovery, devBypass, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
