/**
 * JChat 3.0 — Entry point
 * Task 0.7: renders the root navigator (auth guard + bottom tabs + deep linking).
 * Task 0.2 token-preview body has been replaced by AppNavigator.
 */

import React from 'react';
import AppNavigator from './navigation/AppNavigator';

export default function App() {
  return <AppNavigator />;
}
