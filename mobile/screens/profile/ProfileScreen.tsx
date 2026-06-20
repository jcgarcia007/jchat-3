/**
 * JChat 3.0 — Profile Screen placeholder (Task 0.7)
 * Real implementation: Task 1.7 (Profile with ProfileHeader)
 * Provides signOut() for testing the auth guard.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { useAuth } from '../../context/AuthContext';

export default function ProfileScreen() {
  const c = useThemeColors();
  const { signOut } = useAuth();
  return (
    <View style={[styles.container, { backgroundColor: c.bgBase }]}>
      <Text style={[styles.title, { color: c.textPrimary }]}>Profile</Text>
      <Text style={[styles.subtitle, { color: c.textTertiary }]}>
        Coming — Task 1.7
      </Text>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: palette.danger }]}
        onPress={signOut}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
      >
        <Text style={styles.buttonText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '600' },
  subtitle: { fontSize: 14, marginTop: 6 },
  button: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  buttonText: { color: palette.bgSurfaceLight, fontWeight: '600', fontSize: 16 },
});
