import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';

/**
 * "Only for ages 21 and over. You will be asked for ID at the venue." — shown right before paying when the order or the gift holds a
 * product with `id_required` (alcohol). Same component on devices and web; colors only from the theme.
 */
export function IdRequiredNotice(): React.ReactElement {
  const c = useThemeColors();
  const { t } = useTranslation('common');
  return (
    <View
      testID="id-required-notice"
      accessibilityRole="alert"
      style={[styles.box, { backgroundColor: palette.warning + '22', borderColor: palette.warning }]}
    >
      <Text style={[styles.text, { color: c.warningText }]}>{t('idRequiredNotice')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 8, width: '100%' },
  text: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
});
