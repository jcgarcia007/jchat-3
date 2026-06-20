/**
 * JChat 3.0 — Nearby Screen placeholder (Task 0.7)
 * Real implementation: Task 2.13 (Nearby businesses list)
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeColors } from '../../theme/colors';

export default function NearbyScreen() {
  const c = useThemeColors();
  return (
    <View style={[styles.container, { backgroundColor: c.bgBase }]}>
      <Text style={[styles.title, { color: c.textPrimary }]}>Nearby</Text>
      <Text style={[styles.subtitle, { color: c.textTertiary }]}>
        Coming — Task 2.13
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '600' },
  subtitle: { fontSize: 14, marginTop: 6 },
});
