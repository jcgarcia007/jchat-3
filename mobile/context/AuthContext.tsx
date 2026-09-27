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
import { supabase } from '../services/supabase';
import { isBiometricEnabled } from '../services/biometric';
import i18n, { changeAppLanguage } from '../i18n';
import type { SupportedLanguage } from '../i18n';

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
  /**
   * True when the app opened via a jchat://reset deep link (password recovery flow).
   * AppNavigator shows ResetPasswordScreen instead of the normal stack while this is true.
   */
  isRecovering: boolean;
  /** Clear the recovery state after a successful password update. */
  clearRecovery: () => void;
  /** Dev-only: enter the app without a real session (placeholder buttons). */
  devBypass: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [bypass, setBypass] = useState(false);
  const [locked, setLocked] = useState(false);
  const [justSignedIn, setJustSignedIn] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  // True once the initial getSession has resolved. Guards justSignedIn so that
  // startup events ('INITIAL_SESSION' or a restore that fires 'SIGNED_IN' in some
  // versions) don't look like a fresh login.
  const initializedRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    // Intercepts auth email deep links (PKCE `?code=` or implicit token fragment):
    //   jchat://reset   → password recovery; Supabase then fires PASSWORD_RECOVERY.
    //   jchat://confirm → sign-up / email-change confirmation; the user ends up
    //                     signed in and sees a "Email confirmed" message.
    async function handleAuthUrl(url: string) {
      const isReset = url.includes('://reset');
      const isConfirm = url.includes('://confirm');
      if (!isReset && !isConfirm) return;
      const ok = await exchangeAuthUrl(url);
      if (!mounted) return;
      if (isReset) {
        if (ok) {
          // The real recovery email uses the IMPLICIT flow (no `pkce_` prefix),
          // which resolves via setSession() → fires SIGNED_IN, not
          // PASSWORD_RECOVERY. Set isRecovering explicitly here so both flows
          // (PKCE and implicit) show ResetPasswordScreen; the PASSWORD_RECOVERY
          // listener below stays as a second path for whichever flow does emit it.
          setIsRecovering(true);
        } else {
          // Link expired or already used (#error_code=otp_expired, single-use token).
          Alert.alert(i18n.t('auth:resetPassword.expiredLinkTitle'), i18n.t('auth:resetPassword.expiredLinkMessage'));
        }
        return;
      }
      if (isConfirm) {
        if (ok) {
          Alert.alert(i18n.t('auth:confirmEmail.successTitle'), i18n.t('auth:confirmEmail.successMessage'));
        } else {
          Alert.alert(i18n.t('auth:confirmEmail.errorTitle'), i18n.t('auth:confirmEmail.errorMessage'));
        }
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

    // Cold start: restore the session AND decide the biometric gate here — this is
    // the ONLY place `locked` is ever set to true, so a fresh login (handled by
    // onAuthStateChange below) or a background return never triggers the lock.
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      if (data.session && (await isBiometricEnabled())) {
        if (mounted) setLocked(true);
      }
      if (mounted) setLoading(false);
      // Initialization complete — any SIGNED_IN after this point is a fresh login.
      initializedRef.current = true;
      // Check if the app was cold-started via an auth email deep link (reset / confirm).
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl && mounted) await handleAuthUrl(initialUrl);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      // Never touch `locked` here — a fresh sign-in must enter the app directly.
      setSession(next);
      // Only a fresh login (after init) offers the enrollment prompt.
      if (_event === 'SIGNED_IN' && initializedRef.current) {
        setJustSignedIn(true);
      }
      // Password recovery deep link — show ResetPasswordScreen.
      if (_event === 'PASSWORD_RECOVERY') {
        setIsRecovering(true);
      }
    });

    // Warm start: app already open when user taps the reset / confirm link.
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

  const unlock = useCallback(() => setLocked(false), []);
  const clearJustSignedIn = useCallback(() => setJustSignedIn(false), []);
  const clearRecovery = useCallback(() => setIsRecovering(false), []);
  const devBypass = useCallback(() => setBypass(true), []);
  const signOut = useCallback(async () => {
    setBypass(false);
    setLocked(false);
    setJustSignedIn(false);
    await supabase.auth.signOut();
  }, []);

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
      clearRecovery,
      devBypass,
      signOut,
    }),
    [session, loading, bypass, locked, unlock, justSignedIn, clearJustSignedIn, isRecovering, clearRecovery, devBypass, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
