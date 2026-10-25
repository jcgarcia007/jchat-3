/**
 * JChat 3.0 — OpenInAppBanner (web): a 56 px bar "Abrir en JChat" with the app icon, an "Abrir" button and a 44×44 close.
 * Only while INVITE_TO_APP_ENABLED is on and the person has not closed it in the last 7 days (the X stores
 * jchat.inviteBanner.dismissedAt in localStorage; private mode just means it may come back). It sits IN the layout (above the
 * chat composer, at the bottom of the no-venue screen), so it never covers anything. "Abrir" tries the jchat:// equivalent
 * of the current URL and falls back to the store of the system (utils/inviteMoments openInApp).
 * Not mounted on login / sign-up / onboarding / payment screens.
 */

import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconX } from '@tabler/icons-react-native';

import { closeInviteBanner, isInviteBannerAllowed, openAppFromWeb, subscribeBannerClosed } from '../../services/inviteState';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';

const APP_ICON = require('../../assets/icon.png');

export function OpenInAppBanner(): React.ReactElement | null {
  const c = useThemeColors();
  const { t } = useTranslation('common');
  const [visible, setVisible] = useState(() => isInviteBannerAllowed());
  // Closing the banner in one screen hides the other mounted copies too (they stay in the stack under the chat).
  useEffect(() => subscribeBannerClosed(() => setVisible(false)), []);
  if (!visible) return null;

  return (
    <View testID="open-in-app-banner" style={[styles.bar, { backgroundColor: c.bgSurface, borderTopColor: c.borderSubtle }]}>
      <Image source={APP_ICON} style={styles.icon} accessibilityIgnoresInvertColors />
      <Text numberOfLines={1} style={[styles.text, { color: c.textPrimary }]}>
        {t('invite.banner')}
      </Text>
      <Pressable
        testID="open-in-app-open"
        onPress={openAppFromWeb}
        accessibilityRole="button"
        style={({ pressed }) => [styles.open, { backgroundColor: c.brandFill, opacity: pressed ? 0.85 : 1 }]}
      >
        <Text style={[styles.openLabel, { color: palette.onBrand }]}>{t('invite.open')}</Text>
      </Pressable>
      <Pressable
        testID="open-in-app-close"
        onPress={closeInviteBanner}
        accessibilityRole="button"
        accessibilityLabel={t('invite.close')}
        style={styles.close}
      >
        <IconX size={20} color={c.textSecondary} />
      </Pressable>
    </View>
  );
}

export default OpenInAppBanner;

const styles = StyleSheet.create({
  bar: { height: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 12, borderTopWidth: StyleSheet.hairlineWidth },
  icon: { width: 32, height: 32, borderRadius: 8 },
  text: { flex: 1, fontSize: 15, fontWeight: '600' },
  open: { minHeight: 36, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  openLabel: { fontSize: 14, fontWeight: '700' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
