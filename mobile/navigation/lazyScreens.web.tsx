/**
 * JChat 3.0 — screens that the client web app does not need up front (web): loaded on demand.
 *
 * Expo CLI splits the web bundle at every async `import()` (docs.expo.dev/guides/customizing-metro, "Bundle
 * splitting"; web only), so the Map tab and the whole POS flow (the waiter / staff screens, receipts, printers,
 * terminal) are fetched the first time someone opens them, not with the first page. iOS / Android keep static
 * imports (lazyScreens.ts), so nothing changes there.
 *
 * Each lazy screen has its own Suspense fallback (a spinner) and an error boundary: if the chunk cannot be
 * downloaded (offline, a deploy replaced the old files) the person gets "No pudimos cargar esta pantalla ·
 * Reintentar" instead of a blank app, and Retry fetches the chunk again.
 */

import React, { Suspense, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Spinner } from '../components/common/Spinner';
import { useTranslation } from 'react-i18next';

import { palette } from '../theme/tokens';
import { useThemeColors } from '../theme/colors';

function ScreenFallback(): React.ReactElement {
  const c = useThemeColors();
  return (
    <View style={[styles.center, { backgroundColor: c.bgBase }]} accessibilityRole="progressbar">
      <Spinner color={c.brand} />
    </View>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }): React.ReactElement {
  const c = useThemeColors();
  const { t } = useTranslation('common');
  return (
    <View style={[styles.center, { backgroundColor: c.bgBase }]} role="alert">
      <Text style={[styles.message, { color: c.textPrimary }]}>{t('lazy.loadError')}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('actions.retry')}
        onPress={onRetry}
        style={[styles.retry, { backgroundColor: c.brand }]}
      >
        <Text style={[styles.retryLabel, { color: palette.onBrand }]}>{t('actions.retry')}</Text>
      </Pressable>
    </View>
  );
}

class LoadBoundary extends React.Component<{ onRetry: () => void; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  render(): React.ReactNode {
    return this.state.failed ? <LoadError onRetry={this.props.onRetry} /> : this.props.children;
  }
}

function lazyScreen(load: () => Promise<{ default: React.ComponentType }>): React.ComponentType {
  let Screen = React.lazy(load);
  return function LazyScreen(): React.ReactElement {
    const [attempt, setAttempt] = useState(0);
    return (
      <LoadBoundary
        key={attempt}
        onRetry={() => {
          Screen = React.lazy(load); // a failed React.lazy stays failed: a fresh one downloads the chunk again
          setAttempt((n) => n + 1);
        }}
      >
        <Suspense fallback={<ScreenFallback />}>
          <Screen />
        </Suspense>
      </LoadBoundary>
    );
  };
}

export const MapScreen: React.ComponentType = lazyScreen(() => import('../screens/map/MapScreen'));
export const PosNavigator: React.ComponentType = lazyScreen(() => import('./PosNavigator'));
// The signed-in person's messages / notifications and nearby offers (MainStack WebMessages / WebOffers).
export const MessagesScreen: React.ComponentType = lazyScreen(() => import('../screens/dms/MessagesScreen'));
export const OffersScreen: React.ComponentType = lazyScreen(() => import('../screens/offers/OffersScreen'));

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  message: { fontSize: 15, textAlign: 'center' },
  retry: { minHeight: 44, paddingHorizontal: 20, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  retryLabel: { fontSize: 15, fontWeight: '700' },
});
