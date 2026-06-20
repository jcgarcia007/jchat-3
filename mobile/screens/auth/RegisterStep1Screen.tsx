/**
 * JChat 3.0 — Register Step 1 Screen placeholder (Task 0.7)
 * Real implementation: Task 1.4
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeColors } from '../../theme/colors';

export default function RegisterStep1Screen() {
  const c = useThemeColors();
  return (
    <View style={[styles.container, { backgroundColor: c.bgBase }]}>
      <Text style={[styles.title, { color: c.textPrimary }]}>
        Register — Step 1
      </Text>
      <Text style={[styles.subtitle, { color: c.textTertiary }]}>
        Coming — Task 1.4
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '600' },
  subtitle: { fontSize: 14, marginTop: 6 },
});
