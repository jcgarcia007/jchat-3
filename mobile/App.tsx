/**
 * JChat 3.0 — Entry point
 * Renders the root navigator wrapped in AuthProvider (Supabase-backed auth).
 */

import React from 'react';
import { AuthProvider } from './context/AuthContext';
import AppNavigator from './navigation/AppNavigator';

export default function App() {
  return (
    <AuthProvider>
      <AppNavigator />
    </AuthProvider>
  );
}
