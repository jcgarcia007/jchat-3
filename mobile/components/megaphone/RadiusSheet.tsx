import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconCheck } from '@tabler/icons-react-native';
import { useTranslation } from 'react-i18next';

import { useThemeColors } from '../../theme/colors';
import {
  FEED_RADIUS_OPTIONS,
  formatRadius,
  type FeedRadiusMiles,
} from '../../utils/distanceUnits';

interface RadiusSheetProps {
  visible: boolean;
  value: FeedRadiusMiles;
  onSelect: (miles: FeedRadiusMiles) => void;
  onClose: () => void;
}

/** Bottom sheet (RN Modal) to pick the megaphone radius. Values are miles; labels may show km. */
export default function RadiusSheet({ visible, value, onSelect, onClose }: RadiusSheetProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const translation = useTranslation('offers');

  return (
    <Modal animationType="slide" onRequestClose={onClose} statusBarTranslucent transparent visible={visible}>
      <TouchableWithoutFeedback accessible={false} onPress={onClose}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]} />
      </TouchableWithoutFeedback>

      <View
        style={[
          styles.sheet,
          { backgroundColor: colors.bgSurface, borderTopColor: colors.borderSubtle, paddingBottom: insets.bottom + 12 },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: colors.borderSubtle }]} />
        <Text style={[styles.title, { color: colors.textPrimary }]}>{translation.t('radiusSheetTitle')}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {translation.t('radiusSheetSubtitle')}
        </Text>

        {FEED_RADIUS_OPTIONS.map((miles) => {
          const selected = miles === value;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={miles}
              onPress={() => onSelect(miles)}
              style={[styles.option, { borderBottomColor: colors.borderSubtle }]}
            >
              <Text
                style={[
                  styles.optionLabel,
                  { color: selected ? colors.brand : colors.textPrimary, fontWeight: selected ? '700' : '500' },
                ]}
              >
                {formatRadius(miles)}
              </Text>
              {selected ? <IconCheck size={20} color={colors.brand} strokeWidth={2.5} /> : null}
            </Pressable>
          );
        })}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    bottom: 0,
    left: 0,
    paddingHorizontal: 20,
    position: 'absolute',
    right: 0,
  },
  handle: { alignSelf: 'center', borderRadius: 2, height: 4, marginBottom: 8, marginTop: 12, width: 36 },
  title: { fontSize: 17, fontWeight: '700', marginTop: 4 },
  subtitle: { fontSize: 13, lineHeight: 18, marginBottom: 6, marginTop: 4 },
  option: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
  },
  optionLabel: { fontSize: 16 },
});
