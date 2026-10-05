/**
 * JChat 3.0 — ChatMoreSheet (⋯ of the chat top bar)
 *
 * My account and orders · Ask the venue for help · Leave the venue · (owner) Owner settings.
 * Replaces the old native Alert. Rows are ≥ 52 px tall.
 */

import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { IconDoorExit, IconHelp, IconReceipt, IconSettings } from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';

interface Props {
  visible: boolean;
  onClose: () => void;
  isOwner: boolean;
  /** Only meaningful when the user is in a venue session (non-owner). */
  inVenue: boolean;
  onMyOrders: () => void;
  onAskHelp: () => void;
  onLeaveVenue: () => void;
  onOwnerSettings: () => void;
}

export function ChatMoreSheet({
  visible,
  onClose,
  isOwner,
  inVenue,
  onMyOrders,
  onAskHelp,
  onLeaveVenue,
  onOwnerSettings,
}: Props): React.ReactElement {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation('chat');

  const run = (action: () => void) => () => {
    onClose();
    action();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} accessibilityRole="none" />
      <View style={[styles.sheet, { backgroundColor: c.bgSurface, paddingBottom: insets.bottom + 12 }]}>
        <View style={[styles.handle, { backgroundColor: c.borderSubtle }]} />

        <Row icon={<IconReceipt size={22} color={c.textPrimary} />} label={t('moreSheet.myOrders')} onPress={run(onMyOrders)} color={c.textPrimary} border={c.borderSubtle} />
        {!isOwner && inVenue ? (
          <Row icon={<IconHelp size={22} color={c.textPrimary} />} label={t('moreSheet.askHelp')} onPress={run(onAskHelp)} color={c.textPrimary} border={c.borderSubtle} />
        ) : null}
        {isOwner ? (
          <Row icon={<IconSettings size={22} color={c.textPrimary} />} label={t('moreSheet.ownerSettings')} onPress={run(onOwnerSettings)} color={c.textPrimary} border={c.borderSubtle} />
        ) : null}
        {!isOwner && inVenue ? (
          <Row icon={<IconDoorExit size={22} color={c.danger} />} label={t('venueSession.leave')} onPress={run(onLeaveVenue)} color={c.danger} border={c.borderSubtle} />
        ) : null}

        <Pressable onPress={onClose} accessibilityRole="button" style={styles.cancel}>
          <Text style={[styles.cancelLabel, { color: c.textSecondary }]}>{t('moreSheet.close')}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

function Row({
  icon,
  label,
  onPress,
  color,
  border,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  color: string;
  border: string;
}): React.ReactElement {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, { borderBottomColor: border, opacity: pressed ? 0.7 : 1 }]}
    >
      {icon}
      <Text style={[styles.rowLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: palette.scrimMedium },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8, paddingHorizontal: 8 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 52,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: { fontSize: 16, fontWeight: '600' },
  cancel: { minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  cancelLabel: { fontSize: 15 },
});
