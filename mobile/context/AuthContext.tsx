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
import { changeAppLanguage } from '../i18n';
import type { SupportedLanguage } from '../i18n';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  /** Dev-only: enter the app without a real session (placeholder buttons). */
  devBypass: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [bypass, setBypass] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        setLoading(false);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
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

  const devBypass = useCallback(() => setBypass(true), []);
  const signOut = useCallback(async () => {
    setBypass(false);
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      isAuthenticated: !!session || bypass,
      devBypass,
      signOut,
    }),
    [session, loading, bypass, devBypass, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
