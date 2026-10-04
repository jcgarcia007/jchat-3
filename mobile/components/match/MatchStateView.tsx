/**
 * JChat 3.0 — Match empty / blocked state (UX pass)
 *
 * One layout for every Match state that has nothing to swipe: centered text, a big PRIMARY button
 * with the next logical action (Upload photo / Scan QR / Back to chat) and an optional secondary
 * one below. Optional children (e.g. the "tell me when new people arrive" switch) sit in between.
 */

import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';

interface StateAction {
  label: string;
  onPress: () => void;
  icon?: React.ReactNode;
  loading?: boolean;
}

interface MatchStateViewProps {
  title?: string;
  message?: string;
  primary?: StateAction;
  secondary?: StateAction;
  children?: React.ReactNode;
}

export function MatchStateView({ title, message, primary, secondary, children }: MatchStateViewProps) {
  const c = useThemeColors();
  return (
    <View style={styles.wrap}>
      {title ? (
        <Text style={[styles.title, { color: c.textPrimary }]} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      {message ? <Text style={[styles.message, { color: c.textSecondary }]}>{message}</Text> : null}
      {children}
      {primary ? (
        <Pressable
          onPress={primary.onPress}
          disabled={primary.loading}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.primary,
            { backgroundColor: c.brand, opacity: pressed || primary.loading ? 0.8 : 1 },
          ]}
        >
          {primary.loading ? (
            <ActivityIndicator color={palette.onBrand} />
          ) : (
            <>
              {primary.icon}
              <Text style={[styles.primaryText, { color: palette.onBrand }]}>{primary.label}</Text>
            </>
          )}
        </Pressable>
      ) : null}
      {secondary ? (
        <Pressable
          onPress={secondary.onPress}
          accessibilityRole="button"
          style={({ pressed }) => [styles.secondary, { borderColor: c.brand, opacity: pressed ? 0.8 : 1 }]}
        >
          {secondary.icon}
          <Text style={[styles.secondaryText, { color: c.brand }]}>{secondary.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    minHeight: 360,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 24,
  },
  title: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  message: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  primary: {
    alignSelf: 'stretch',
    minHeight: 56,
    borderRadius: 16,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  primaryText: { fontSize: 17, fontWeight: '800' },
  secondary: {
    alignSelf: 'stretch',
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 2,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { fontSize: 15, fontWeight: '700' },
});
