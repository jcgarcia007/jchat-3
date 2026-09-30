import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';

import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';

interface CategoryChipProps {
  active: boolean;
  label: string;
  onPress: () => void;
}

export default function CategoryChip({ active, label, onPress }: CategoryChipProps) {
  const colors = useThemeColors();
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      activeOpacity={0.75}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: active ? colors.brand : colors.bgSurface,
          borderColor: active ? colors.brand : colors.borderSubtle,
        },
      ]}
    >
      <Text style={[styles.label, { color: active ? palette.bgSurfaceLight : colors.textSecondary }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  label: { fontSize: 13, fontWeight: '500' },
});
