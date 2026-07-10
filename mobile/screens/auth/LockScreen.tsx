/**
 * JChat 3.0 — Lock Screen (M2)
 *
 * Biometric gate shown ONLY when a restored session is `locked` (cold start +
 * user opted into biometric app-lock). Rendered by AppNavigator in place of the
 * main stack while `isAuthenticated && locked`.
 *
 * Behaviour:
 *  - Prompts Face ID / Touch ID automatically on mount.
 *  - Success → unlock() → the main app renders.
 *  - Failure / cancel → stays here; the user can retry Face ID or sign out.
 *    (Product decision: no passcode fallback. Sign out is the only escape.)
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { IconFingerprint } from '@tabler/icons-react-native';

import { palette } from '../../theme/tokens';
import { useThemeColors } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import { authenticateBiometric } from '../../services/biometric';

export default function LockScreen() {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation('auth');
  const { unlock, signOut } = useAuth();
  const [attempting, setAttempting] = useState(false);

  const attempt = useCallback(async () => {
    setAttempting(true);
    const ok = await authenticateBiometric(t('lock.prompt'));
    setAttempting(false);
    if (ok) unlock();
    // On failure/cancel: remain on this screen — user retries or signs out.
  }, [t, unlock]);

  // Auto-prompt once when the gate mounts.
  useEffect(() => {
    void attempt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: c.bgBase, paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <StatusBar barStyle={c.bgBase === palette.bgBase ? 'light-content' : 'dark-content'} />

      <View style={styles.center}>
        <View style={[styles.iconRing, { backgroundColor: c.brandLight, borderColor: c.brand }]}>
          <IconFingerprint size={56} color={c.brand} strokeWidth={1.5} />
        </View>
        <Text style={[styles.title, { color: c.textPrimary }]}>{t('lock.title')}</Text>
        <Text style={[styles.subtitle, { color: c.textSecondary }]}>{t('lock.subtitle')}</Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={attempt}
          disabled={attempting}
          style={({ pressed }) => [
            styles.unlockButton,
            { backgroundColor: c.brand, opacity: attempting ? 0.7 : pressed ? 0.85 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('lock.unlockButton')}
        >
          {attempting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.unlockLabel}>{t('lock.unlockButton')}</Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => {
            signOut().catch(() => null);
          }}
          style={styles.signOutButton}
          accessibilityRole="button"
          accessibilityLabel={t('lock.signOut')}
        >
          <Text style={[styles.signOutLabel, { color: c.textTertiary }]}>{t('lock.signOut')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 24,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconRing: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 300,
  },
  actions: {
    paddingBottom: 16,
  },
  unlockButton: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unlockLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  signOutButton: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  signOutLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
});
