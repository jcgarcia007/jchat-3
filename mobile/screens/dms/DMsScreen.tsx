/**
 * JChat 3.0 — DMs Screen placeholder (Task 0.7)
 * Real implementation: Task 1.12 (Direct Messages)
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeColors } from '../../theme/colors';

export default function DMsScreen() {
  const c = useThemeColors();
  return (
    <View style={[styles.container, { backgroundColor: c.bgBase }]}>
      <Text style={[styles.title, { color: c.textPrimary }]}>DMs</Text>
      <Text style={[styles.subtitle, { color: c.textTertiary }]}>
        Coming — Task 1.12
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '600' },
  subtitle: { fontSize: 14, marginTop: 6 },
});
