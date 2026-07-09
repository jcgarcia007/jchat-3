/**
 * JChat 3.0 — Welcome Screen (Task 1.2)
 * Full-screen branded gradient with logo, tagline, nav dots, and CTA buttons.
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { IconBrandPagekit } from '@tabler/icons-react-native';

import { palette } from '../../theme/tokens';
import { useThemeColors } from '../../theme/colors';
import type { AuthStackParamList } from '../../navigation/AppNavigator';

// ---------------------------------------------------------------------------
// Design-System gradient / border hexes specific to this screen.
// All other colors come from palette / useThemeColors().
// ---------------------------------------------------------------------------
const WELCOME_COLORS = {
  gradientStart: '#060810',   // splash gradient top
  gradientEnd:   '#0d1030',   // splash gradient bottom
  ghostBorder:   '#2a2a3e',   // ghost button border
  dotInactive:   '#2a2d4a',   // inactive nav dot
  textOnDark:    '#f5f5f7',   // title — always light on the fixed dark gradient
  onBrand:       '#ffffff',   // text on the brand-fill primary button
} as const;

type WelcomeNav = NativeStackNavigationProp<AuthStackParamList, 'Welcome'>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BUTTON_RADIUS = 14;
const BUTTON_HEIGHT = 44;

export default function WelcomeScreen() {
  const c = useThemeColors();
  const navigation = useNavigation<WelcomeNav>();
  const { t } = useTranslation('auth');

  return (
    <LinearGradient
      colors={[WELCOME_COLORS.gradientStart, WELCOME_COLORS.gradientEnd]}
      style={styles.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
    >
      <StatusBar barStyle="light-content" />

      {/* ── Hero section ── */}
      <View style={styles.hero}>
        {/* Logo icon */}
        <View style={[styles.logoWrap, { borderColor: palette.brandLight }]}>
          <IconBrandPagekit
            size={56}
            color={palette.brand}
            strokeWidth={1.5}
          />
        </View>

        {/* Tagline */}
        <Text style={styles.title}>{t('welcome.title')}</Text>

        {/* Subtitle */}
        <Text style={[styles.subtitle, { color: c.textSecondary }]}>
          {t('welcome.subtitle')}
        </Text>
      </View>

      {/* ── Navigation dots ── */}
      <View style={styles.dotsRow} accessibilityLabel={t('welcome.stepIndicator')}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i === 0
                ? { backgroundColor: palette.brand, width: 20 }
                : { backgroundColor: WELCOME_COLORS.dotInactive },
            ]}
          />
        ))}
      </View>

      {/* ── CTA buttons ── */}
      <View style={styles.buttonsWrap}>
        {/* Primary — Get started */}
        <TouchableOpacity
          style={[styles.button, styles.primaryButton]}
          onPress={() => navigation.navigate('RegisterStep1')}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t('welcome.getStarted')}
        >
          <Text style={styles.primaryButtonText}>{t('welcome.getStarted')}</Text>
        </TouchableOpacity>

        {/* Ghost — Log in */}
        <TouchableOpacity
          style={[styles.button, styles.ghostButton]}
          onPress={() => navigation.navigate('Login')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('welcome.login')}
        >
          <Text style={[styles.ghostButtonText, { color: c.textPrimary }]}>
            {t('welcome.login')}
          </Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: Platform.OS === 'ios' ? 48 : 32,
  },

  // ── Hero ──────────────────────────────────────────────────────────────────
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  logoWrap: {
    width: 88,
    height: 88,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    // Subtle glass feel — no opaque background needed; gradient shows through
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: WELCOME_COLORS.textOnDark, // always-light on dark gradient (Design System)
    textAlign: 'center',
    lineHeight: 36,
    letterSpacing: -0.3,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 8,
  },

  // ── Nav dots ──────────────────────────────────────────────────────────────
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 36,
  },
  dot: {
    height: 6,
    borderRadius: 3,
    width: 6,           // overridden inline for active dot
  },

  // ── Buttons ───────────────────────────────────────────────────────────────
  buttonsWrap: {
    width: SCREEN_WIDTH - 48,   // full-width with 24px side margins each
    gap: 12,
  },
  button: {
    height: BUTTON_HEIGHT,
    minHeight: 44,              // 44px minimum touch target
    borderRadius: BUTTON_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  primaryButton: {
    backgroundColor: palette.brand,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: WELCOME_COLORS.onBrand,
    letterSpacing: 0.1,
  },
  ghostButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: WELCOME_COLORS.ghostBorder,
  },
  ghostButtonText: {
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
});
