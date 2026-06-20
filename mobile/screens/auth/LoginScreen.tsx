/**
 * JChat 3.0 — Login Screen placeholder (Task 0.7)
 * Real implementation: Task 1.3
 * Provides sign-in button for testing the auth guard.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';

interface Props {
  onSignIn: () => void;
}

export default function LoginScreen({ onSignIn }: Props) {
  const c = useThemeColors();

  return (
    <View style={[styles.container, { backgroundColor: c.bgBase }]}>
      <Text style={[styles.title, { color: c.textPrimary }]}>Login</Text>
      <Text style={[styles.subtitle, { color: c.textTertiary }]}>
        Coming — Task 1.3
      </Text>

      <TouchableOpacity
        style={[styles.button, { backgroundColor: palette.brand }]}
        onPress={onSignIn}
        accessibilityRole="button"
        accessibilityLabel="Sign in (stub)"
      >
        <Text style={styles.buttonText}>Sign In (Stub)</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '600' },
  subtitle: { fontSize: 14, marginTop: 6 },
  button: {
    marginTop: 32,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    minWidth: 200,
    alignItems: 'center',
  },
  buttonText: { color: palette.bgSurfaceLight, fontWeight: '600', fontSize: 16 },
});
