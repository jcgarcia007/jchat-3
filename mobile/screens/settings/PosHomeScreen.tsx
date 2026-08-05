/**
 * JChat 3.0 — POS Home Screen (placeholder — Task 3.x)
 *
 * Reached after a successful PIN verification from WorkModeScreen.
 * Full waiter POS implementation is a separate task; this screen holds
 * the navigation slot so WorkModeScreen can navigate here immediately.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { IconChevronLeft, IconReceipt2 } from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import type { SettingsStackParamList } from '../../navigation/SettingsStack';

type PosHomeNav = NativeStackNavigationProp<SettingsStackParamList, 'PosHome'>;
type PosHomeRoute = RouteProp<SettingsStackParamList, 'PosHome'>;

export default function PosHomeScreen() {
  const c = useThemeColors();
  const { t } = useTranslation('settings');
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<PosHomeNav>();
  const route = useRoute<PosHomeRoute>();
  const { businessName } = route.params;

  return (
    <View style={[styles.screen, { backgroundColor: c.bgBase }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 12,
            backgroundColor: c.bgBase,
            borderBottomColor: c.borderSubtle,
          },
        ]}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={t('workMode.pinCancel')}
        >
          <IconChevronLeft size={24} color={c.brand} strokeWidth={2} />
        </Pressable>
        <Text
          style={[styles.headerTitle, { color: c.textPrimary }]}
          numberOfLines={1}
        >
          {businessName}
        </Text>
      </View>

      <View style={styles.center}>
        <IconReceipt2 size={56} color={c.textTertiary} strokeWidth={1.5} />
        <Text style={[styles.comingSoonTitle, { color: c.textPrimary }]}>
          {t('workMode.posComingSoon')}
        </Text>
        <Text style={[styles.comingSoonSub, { color: c.textTertiary }]}>
          {t('workMode.posComingSoonSub')}
        </Text>
      </View>
    </View>
  );
}

const H_PAD = 16;

const styles = StyleSheet.create({
  screen: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: H_PAD,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  backButton: {
    marginRight: 8,
    padding: 4,
  },

  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '600',
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },

  comingSoonTitle: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },

  comingSoonSub: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
