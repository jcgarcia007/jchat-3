/**
 * JChat 3.0 — Spinner: the app's ActivityIndicator, always with an accessible name.
 *
 * react-native-web renders ActivityIndicator as role="progressbar" with no name (axe: aria-progressbar-name) and
 * screen readers on iOS / Android announce nothing useful for a bare spinner. Every spinner in the app goes through
 * this component, which defaults `accessibilityLabel` to the translated "Cargando…" / "Loading…" (common:loading);
 * a screen may pass a more specific label. scripts/spinner-usage.test.mjs fails if a file imports ActivityIndicator
 * from react-native directly.
 */

import React from 'react';
import { ActivityIndicator, type ActivityIndicatorProps } from 'react-native';
import { useTranslation } from 'react-i18next';

export function Spinner(props: ActivityIndicatorProps): React.ReactElement {
  const { t } = useTranslation('common');
  return <ActivityIndicator accessibilityLabel={t('loading')} {...props} />;
}

export default Spinner;
