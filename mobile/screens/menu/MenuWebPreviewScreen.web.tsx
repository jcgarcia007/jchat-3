/**
 * JChat 3.0 — MenuWebPreviewScreen (web). The embedded menu (an iframe of jchat.cloud/m/<slug>?app=1) cannot work on the
 * web: jchat.cloud forbids being framed (X-Frame-Options / frame-ancestors, kept on purpose against clickjacking) and
 * the postMessage hand-off to the native checkout does not exist here. Nothing in the web chat navigates to this screen
 * any more (the 🍴 button opens the public menu in a new tab); if someone still lands here, show a button instead of a
 * blank frame. The button opens the menu in a new tab (a click, so it is not blocked as a popup).
 */

import React, { useCallback } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { IconArrowLeft } from '@tabler/icons-react-native';

import type { MainStackParamList } from '../../navigation/AppNavigator';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { publicMenuUrl } from '../../utils/venueMenuTarget';

export default function MenuWebPreviewScreen(): React.ReactElement {
  const c = useThemeColors();
  const { t } = useTranslation('pos');
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList, 'MenuWebPreview'>>();
  const { slug, businessName } = useRoute<RouteProp<MainStackParamList, 'MenuWebPreview'>>().params;

  const openMenu = useCallback(() => void Linking.openURL(publicMenuUrl(slug)), [slug]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bgBase }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel={t('webPreview.menuTitle')} hitSlop={10} style={styles.back}>
          <IconArrowLeft size={22} color={c.textPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: c.textPrimary }]} numberOfLines={1}>{businessName ?? t('webPreview.menuTitle')}</Text>
      </View>
      <View style={styles.body}>
        <Text style={[styles.hint, { color: c.textSecondary }]}>{t('webPreview.openInTabHint')}</Text>
        <Pressable testID="web-open-menu" onPress={openMenu} accessibilityRole="button" style={({ pressed }) => [styles.button, { backgroundColor: palette.brand, opacity: pressed ? 0.85 : 1 }]}>
          <Text style={[styles.buttonLabel, { color: palette.onBrand }]}>{t('webPreview.openMenu')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 17, fontWeight: '700' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  hint: { fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 360 },
  button: { minHeight: 52, minWidth: 220, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  buttonLabel: { fontSize: 16, fontWeight: '700' },
});
