/**
 * JChat 3.0 — OwnProfileMenu: the short menu that opens when I tap MY OWN photo in the chat (on one of my messages
 * or in the "people here" row): Cambiar foto · Editar perfil · Ver mi perfil. Rows are >= 52 px tall.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppModal } from '../common/AppModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { IconCamera, IconPencil, IconUser } from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';

interface Props {
  visible: boolean;
  onClose: () => void;
  onChangePhoto: () => void;
  onEditProfile: () => void;
  onViewProfile: () => void;
}

export function OwnProfileMenu({ visible, onClose, onChangePhoto, onEditProfile, onViewProfile }: Props): React.ReactElement {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation('chat');

  const run = (action: () => void) => () => {
    onClose();
    action();
  };

  return (
    <AppModal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} accessibilityRole="none" />
      <View accessibilityViewIsModal accessibilityLabel={t('ownMenu.title')} style={[styles.sheet, { backgroundColor: c.bgSurface, paddingBottom: insets.bottom + 12 }]}>
        <View style={[styles.handle, { backgroundColor: c.borderSubtle }]} />
        <Row testID="own-menu-change-photo" icon={<IconCamera size={22} color={c.textPrimary} />} label={t('ownMenu.changePhoto')} onPress={run(onChangePhoto)} color={c.textPrimary} border={c.borderSubtle} />
        <Row testID="own-menu-edit-profile" icon={<IconPencil size={22} color={c.textPrimary} />} label={t('ownMenu.editProfile')} onPress={run(onEditProfile)} color={c.textPrimary} border={c.borderSubtle} />
        <Row testID="own-menu-view-profile" icon={<IconUser size={22} color={c.textPrimary} />} label={t('ownMenu.viewProfile')} onPress={run(onViewProfile)} color={c.textPrimary} border={c.borderSubtle} />
        <Pressable onPress={onClose} accessibilityRole="button" style={styles.cancel}>
          <Text style={[styles.cancelLabel, { color: c.textSecondary }]}>{t('ownMenu.close')}</Text>
        </Pressable>
      </View>
    </AppModal>
  );
}

function Row({ icon, label, onPress, color, border, testID }: { testID: string; icon: React.ReactNode; label: string; onPress: () => void; color: string; border: string }): React.ReactElement {
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.row, { borderBottomColor: border, opacity: pressed ? 0.7 : 1 }]}>
      {icon}
      <Text style={[styles.rowLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: palette.scrimMedium },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8, paddingHorizontal: 8 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  rowLabel: { fontSize: 16, fontWeight: '600' },
  cancel: { minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  cancelLabel: { fontSize: 15 },
});
