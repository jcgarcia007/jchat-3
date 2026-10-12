/**
 * JChat 3.0 — WebNoVenueScreen (web only): the root screen of a signed-in person on the web.
 * The web is for being INSIDE a venue's chat (reached by scanning a table / venue QR); it has no tabs, no map and
 * no "Nearby". Outside a chat this screen says how to get back in: scan the QR with the phone's camera.
 *   - "Saliste de {local}" right after leaving a venue (route param leftBusinessName), else "Entra a un chat".
 *   - Descargar la app → the store of the browser's platform (utils/storeLink + constants/appLinks).
 *   - Mi perfil → the profile.
 */

import React, { useCallback } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { IconDownload, IconQrcode, IconUser } from '@tabler/icons-react-native';

import type { MainStackParamList } from '../../navigation/AppNavigator';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { detectStorePlatform, storeLinkFor } from '../../utils/storeLink';

export default function WebNoVenueScreen(): React.ReactElement {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation('common');
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<{ Tabs: { leftBusinessName?: string } | undefined }, 'Tabs'>>();
  const leftBusinessName = route.params?.leftBusinessName?.trim() || null;

  const downloadApp = useCallback(() => {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    const url = storeLinkFor(detectStorePlatform(nav?.userAgent ?? '', nav?.maxTouchPoints ?? 0));
    void Linking.openURL(url);
  }, []);

  const openProfile = useCallback(() => {
    navigation.navigate('ProfileSheet');
  }, [navigation]);

  return (
    <View testID="web-no-venue" style={[styles.root, { backgroundColor: c.bgBase, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.content}>
        <View style={[styles.iconWrap, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>
          <IconQrcode size={44} color={palette.brand} />
        </View>
        <Text accessibilityRole="header" style={[styles.title, { color: c.textPrimary }]}>
          {leftBusinessName ? t('webShell.leftVenue', { business: leftBusinessName }) : t('webShell.joinTitle')}
        </Text>
        <Text style={[styles.body, { color: c.textSecondary }]}>{t('webShell.scanHint')}</Text>

        <Pressable
          testID="web-download-app"
          onPress={downloadApp}
          accessibilityRole="button"
          style={({ pressed }) => [styles.primary, { backgroundColor: palette.brand, opacity: pressed ? 0.85 : 1 }]}
        >
          <IconDownload size={20} color={palette.onBrand} />
          <Text style={[styles.primaryLabel, { color: palette.onBrand }]}>{t('webShell.downloadApp')}</Text>
        </Pressable>

        <Pressable
          testID="web-my-profile"
          onPress={openProfile}
          accessibilityRole="button"
          style={({ pressed }) => [styles.secondary, { borderColor: c.borderSubtle, backgroundColor: c.bgSurface, opacity: pressed ? 0.85 : 1 }]}
        >
          <IconUser size={20} color={c.textPrimary} />
          <Text style={[styles.secondaryLabel, { color: c.textPrimary }]}>{t('webShell.myProfile')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 24 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  iconWrap: { width: 88, height: 88, borderRadius: 44, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  title: { fontSize: 24, fontWeight: '800', textAlign: 'center' },
  body: { fontSize: 16, lineHeight: 23, textAlign: 'center', maxWidth: 360, marginBottom: 8 },
  primary: { minHeight: 52, alignSelf: 'center', maxWidth: 360, width: '100%', borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  primaryLabel: { fontSize: 16, fontWeight: '700' },
  secondary: { minHeight: 52, alignSelf: 'center', maxWidth: 360, width: '100%', borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  secondaryLabel: { fontSize: 16, fontWeight: '600' },
});
