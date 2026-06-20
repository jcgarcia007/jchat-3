/**
 * JChat 3.0 — Auth State Stub (Task 0.7)
 * Minimal auth state for testing navigation before Supabase auth is wired.
 * TODO(Task 1.3): replace with real Supabase auth (AuthContext + supabase.auth.*)
 */

import { useState, useCallback } from 'react';

export interface AuthState {
  isAuthenticated: boolean;
  signIn: () => void;
  signOut: () => void;
}

export function useAuthStub(): AuthState {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const signIn = useCallback(() => {
    setIsAuthenticated(true);
  }, []);

  const signOut = useCallback(() => {
    setIsAuthenticated(false);
  }, []);

  return { isAuthenticated, signIn, signOut };
}
