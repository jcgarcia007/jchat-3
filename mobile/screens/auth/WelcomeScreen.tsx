/**
 * JChat 3.0 — Welcome Screen (Task 1.2)
 * Full-screen branded gradient with logo, tagline, nav dots, and CTA buttons.
 */

import React from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Platform,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useRegistrationEntry } from '../../hooks/useRegistrationEntry';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { IconBrandPagekit } from '@tabler/icons-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette } from '../../theme/tokens';
import type { AuthStackParamList } from '../../navigation/AppNavigator';
import { getAppWindow } from '../../utils/appWindow';
import { EntryVenueCard } from '../../components/auth/EntryVenueCard';
import AppText from '../../components/common/AppText';
import { controlMinHeight, space } from '../../theme/spacing';

// ---------------------------------------------------------------------------
// Design-System gradient / border hexes specific to this screen.
// Fixed dark background → text colors are fixed light values, NOT theme tokens
// (useThemeColors() resolves dark text in light mode → invisible here).
// ---------------------------------------------------------------------------
const WELCOME_COLORS = {
  gradientStart: palette.brandArtBase,   // splash gradient top
  gradientEnd:   palette.brandArtMid,   // splash gradient bottom
  ghostBorder:   palette.onImageFaint, // ghost button border — visible on the dark gradient
  dotInactive:   palette.brandArtLine,   // inactive nav dot
  textOnDark:    palette.textPrimary,   // title + ghost label — always light on the fixed dark gradient
  textSecondaryOnDark: palette.onImageMuted, // subtitle — fixed light, never a theme token
  onBrand:       palette.onBrand,   // text on the brand-fill primary button
} as const;

type WelcomeNav = NativeStackNavigationProp<AuthStackParamList, 'Welcome'>;

const { width: SCREEN_WIDTH } = getAppWindow();
const BUTTON_RADIUS = 14;

export default function WelcomeScreen() {
  const navigation = useNavigation<WelcomeNav>();
  const openRegistration = useRegistrationEntry(() => navigation.navigate('RegisterStep1'));
  const { t } = useTranslation('auth');
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient
      colors={[WELCOME_COLORS.gradientStart, WELCOME_COLORS.gradientEnd]}
      style={styles.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
    >
      <StatusBar barStyle="light-content" />

      {/* A venue QR / link is pending: "Vas a entrar a {negocio}" (renders nothing otherwise) */}
      <EntryVenueCard variant="welcome" style={{ marginTop: insets.top + space.md, marginHorizontal: space.xl, alignSelf: 'stretch' }} />

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
        <AppText variant="display" color={WELCOME_COLORS.textOnDark} style={styles.title}>
          {t('welcome.title')}
        </AppText>

        {/* Subtitle */}
        <AppText variant="body" color={WELCOME_COLORS.textSecondaryOnDark} style={styles.subtitle}>
          {t('welcome.subtitle')}
        </AppText>
      </View>

      {/* ── Navigation dots ── */}
      <View style={styles.dotsRow} accessible accessibilityRole="image" accessibilityLabel={t('welcome.stepIndicator')}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i === 0
                ? { backgroundColor: palette.brandFill, width: 20 }
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
          onPress={openRegistration}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t('welcome.getStarted')}
        >
          <AppText variant="button" color={WELCOME_COLORS.onBrand} style={styles.primaryButtonText}>
            {t('welcome.getStarted')}
          </AppText>
        </TouchableOpacity>

        {/* Ghost — Log in */}
        <TouchableOpacity
          style={[styles.button, styles.ghostButton]}
          onPress={() => navigation.navigate('Login')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('welcome.login')}
        >
          <AppText variant="button" color={WELCOME_COLORS.textOnDark} style={styles.ghostButtonText}>
            {t('welcome.login')}
          </AppText>
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
    paddingBottom: Platform.OS === 'ios' ? space.xxxl + space.sm : space.xxl,
  },

  // ── Hero ──────────────────────────────────────────────────────────────────
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xxl,
  },
  logoWrap: {
    width: 88,
    height: 88,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xxl,
    // Subtle glass feel — no opaque background needed; gradient shows through
  },
  title: {
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: space.md,
  },
  subtitle: {
    fontWeight: '400',
    textAlign: 'center',
    paddingHorizontal: space.sm,
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
    gap: space.md,
  },
  button: {
    minHeight: controlMinHeight,
    borderRadius: BUTTON_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  primaryButton: {
    backgroundColor: palette.brandFill,
  },
  primaryButtonText: {
    fontWeight: '600',
  },
  ghostButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: WELCOME_COLORS.ghostBorder,
  },
  ghostButtonText: {
    fontWeight: '500',
  },
});
