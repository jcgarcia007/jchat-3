/**
 * JChat 3.0 — Splash Screen placeholder (Task 0.7)
 * Real implementation: Task 1.1
 * Auto-advances to Welcome after a brief delay in the real version.
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import type { AuthStackParamList } from '../../navigation/AppNavigator';

type SplashNav = NativeStackNavigationProp<AuthStackParamList, 'Splash'>;

export default function SplashScreen() {
  const c = useThemeColors();
  const navigation = useNavigation<SplashNav>();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigation.replace('Welcome');
    }, 1500);
    return () => clearTimeout(timer);
  }, [navigation]);

  return (
    <View style={[styles.container, { backgroundColor: palette.bgBase }]}>
      <Text style={[styles.title, { color: palette.brand }]}>JChat</Text>
      <Text style={[styles.version, { color: c.textTertiary }]}>3.0</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 48, fontWeight: '700', letterSpacing: -1 },
  version: { fontSize: 16, marginTop: 8 },
});
