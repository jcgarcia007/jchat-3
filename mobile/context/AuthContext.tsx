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
  useState,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import { isBiometricEnabled } from '../services/biometric';
import { changeAppLanguage } from '../i18n';
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

  useEffect(() => {
    let mounted = true;
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
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      // Never touch `locked` here — a fresh sign-in must enter the app directly.
      setSession(next);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Sync i18n language with the user's DB preference after login / session restore.
  // The DB (users.language) takes priority over the device locale. Runs once when
  // session.user.id becomes available — a single-field, single-row query.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;

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
  const devBypass = useCallback(() => setBypass(true), []);
  const signOut = useCallback(async () => {
    setBypass(false);
    setLocked(false);
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
      devBypass,
      signOut,
    }),
    [session, loading, bypass, locked, unlock, devBypass, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
