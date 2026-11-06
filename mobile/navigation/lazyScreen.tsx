/**
 * navigation/lazyScreen.tsx — `lazyScreen(() => import('./Screen'))`: a screen whose module is only evaluated (and, on web,
 * downloaded) when it is first shown, with a spinner while it loads and a retry button when it fails.
 *
 * Shared by lazyScreens.web.tsx (code splitting) and lazyScreens.tsx (native: the Stripe Terminal SDK, a beta, is only
 * evaluated when someone enters Work Mode — B10-4).
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

export function lazyScreen(load: () => Promise<{ default: React.ComponentType }>): React.ComponentType {
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

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  message: { fontSize: 15, textAlign: 'center' },
  retry: { minHeight: 44, paddingHorizontal: 20, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  retryLabel: { fontSize: 15, fontWeight: '700' },
});
