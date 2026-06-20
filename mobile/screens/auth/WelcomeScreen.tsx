/**
 * JChat 3.0 — Welcome Screen placeholder (Task 0.7)
 * Real implementation: Task 1.2
 * Provides sign-in button for testing the auth guard.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { useAuth } from '../../context/AuthContext';
import type { AuthStackParamList } from '../../navigation/AppNavigator';

type WelcomeNav = NativeStackNavigationProp<AuthStackParamList, 'Welcome'>;

export default function WelcomeScreen() {
  const c = useThemeColors();
  const { devBypass } = useAuth();
  const navigation = useNavigation<WelcomeNav>();

  return (
    <View style={[styles.container, { backgroundColor: c.bgBase }]}>
      <Text style={[styles.title, { color: c.textPrimary }]}>Welcome</Text>
      <Text style={[styles.subtitle, { color: c.textTertiary }]}>
        Coming — Task 1.2
      </Text>

      {/* Auth guard test — calls signIn() directly */}
      <TouchableOpacity
        style={[styles.button, { backgroundColor: palette.brand }]}
        onPress={devBypass}
        accessibilityRole="button"
        accessibilityLabel="Sign in (stub)"
      >
        <Text style={styles.buttonText}>Sign In (Stub)</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.link}
        onPress={() => navigation.navigate('Login')}
        accessibilityRole="button"
      >
        <Text style={[styles.linkText, { color: palette.brand }]}>
          Go to Login
        </Text>
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
  link: { marginTop: 16, padding: 8 },
  linkText: { fontSize: 15, fontWeight: '500' },
});
