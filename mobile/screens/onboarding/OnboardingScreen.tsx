/**
 * JChat 3.0 — Onboarding Screen (Task 1.6)
 * 4 static screens presented in a single component via `currentStep` (0–3).
 *
 * Design: dark gradient background (matching Splash), illustration icon,
 * title, description, progress dots, Next / "Explore the map" button, Skip.
 *
 * On finish (step 4 or Skip): sets users.onboarding_completed = true in
 * Supabase (guarded by isSupabaseConfigured), then navigates to Tabs.
 *
 * TODO(Task 1.7): gate Onboarding display on users.onboarding_completed flag.
 * TODO(schema): add users.onboarding_completed boolean default false
 *   to supabase/migrations/001_initial_schema.sql
 */

import React, { useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  IconMessages,
  IconMap,
  IconRocket,
  IconUsers,
} from '@tabler/icons-react-native';

import { palette } from '../../theme/tokens';
import { supabase, isSupabaseConfigured } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import type { MainStackParamList } from '../../navigation/AppNavigator';

// ---------------------------------------------------------------------------
// One-off screen colors NOT in the shared palette.
// Sourced from JCHAT_3.0_DESIGN_SYSTEM.docx — onboarding section.
// All surface / text colors that have palette equivalents are pulled from there.
// ---------------------------------------------------------------------------
const ONBOARDING_COLORS = {
  /** Main canvas — same deep dark as Splash */
  canvasBg: '#060810',
  /** Gradient top stop */
  gradientTop: '#060810',
  /** Gradient bottom stop — dark navy tint */
  gradientBottom: '#0d1030',
  /**
   * Step 3 accent (Chat screen) — a warm orange-red that distinguishes this
   * step from Brand (#5C7CFA) and Success (#1D9E75). No token equivalent.
   */
  accent3: '#D85A30',
} as const;

// ---------------------------------------------------------------------------
// Step data
// ---------------------------------------------------------------------------
type StepConfig = {
  icon: React.ElementType;
  iconColor: string;
  title: string;
  description: string;
  glow?: boolean;
};

// Copy sourced from MASTER_SPEC Section 4.3 (verbatim).
// TODO(i18n): replace hard-coded strings with t('onboarding.stepN.*')
const STEPS: StepConfig[] = [
  {
    icon: IconUsers,
    iconColor: palette.brand,
    title: 'The people around you are waiting',
    description:
      'JChat connects you with everyone physically at the same place. Walk in, join the conversation.',
  },
  {
    icon: IconMap,
    iconColor: palette.success,
    title: 'See what’s happening right now',
    description:
      'The map shows every active venue near you. The hotter the color, the more people inside.',
  },
  {
    icon: IconMessages,
    iconColor: ONBOARDING_COLORS.accent3,
    title: 'Chat, order, and connect',
    description:
      'Talk to everyone in the room, call for service, or order directly from the menu — all without leaving the conversation.',
  },
  {
    icon: IconRocket,
    iconColor: palette.brand,
    title: 'You’re all set',
    description:
      'Find a place near you, walk in, and start connecting. Your next great night out starts here.',
    glow: true,
  },
];

const TOTAL_STEPS = STEPS.length; // 4

// ---------------------------------------------------------------------------
// Navigation type
// ---------------------------------------------------------------------------
type OnboardingNav = NativeStackNavigationProp<MainStackParamList, 'Onboarding'>;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Rounded square icon container — 60 px icon inside a 96 px square */
function IllustrationIcon({
  step,
}: {
  step: StepConfig;
}) {
  const { icon: Icon, iconColor, glow } = step;
  return (
    <View
      style={[
        styles.iconSquare,
        { backgroundColor: `${iconColor}1A` }, // 10% opacity fill
        glow && {
          shadowColor: iconColor,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.6,
          shadowRadius: 28,
          elevation: 16,
        },
      ]}
    >
      <Icon size={60} color={iconColor} strokeWidth={1.6} />
    </View>
  );
}

/** Progress dot row — active step is a 20 px pill, others are 8 px circles */
function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: total }).map((_, i) => {
        const active = i === current;
        return (
          <View
            key={i}
            style={[
              styles.dot,
              active
                ? { width: 20, backgroundColor: palette.brand }
                : { width: 8, backgroundColor: `${palette.brand}40` },
            ]}
          />
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function markOnboardingComplete(userId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  // TODO(schema): ensure users table has: onboarding_completed boolean default false
  await supabase
    .from('users')
    .update({ onboarding_completed: true })
    .eq('id', userId);
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------
export default function OnboardingScreen() {
  const navigation = useNavigation<OnboardingNav>();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [currentStep, setCurrentStep] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const isLastStep = currentStep === TOTAL_STEPS - 1;

  // Crossfade between steps
  const transitionToStep = (nextStep: number) => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setCurrentStep(nextStep);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    });
  };

  const handleNext = () => {
    if (isLastStep) {
      handleFinish();
    } else {
      transitionToStep(currentStep + 1);
    }
  };

  const handleSkip = () => {
    handleFinish();
  };

  const handleFinish = () => {
    if (user?.id) {
      // Fire-and-forget — don't block navigation on the DB write
      markOnboardingComplete(user.id).catch(() => {
        // TODO(i18n): surface error gracefully if needed
      });
    }
    navigation.navigate('Tabs');
  };

  const step = STEPS[currentStep];

  return (
    <View style={styles.canvas}>
      {/* Base background */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: ONBOARDING_COLORS.canvasBg }]} />

      {/* Gradient overlay */}
      <LinearGradient
        colors={[ONBOARDING_COLORS.gradientTop, ONBOARDING_COLORS.gradientBottom]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Skip button — top-right, hidden on last step */}
      <View
        style={[
          styles.skipContainer,
          { top: insets.top + 16 },
        ]}
        pointerEvents={isLastStep ? 'none' : 'auto'}
      >
        {!isLastStep && (
          <Pressable
            onPress={handleSkip}
            hitSlop={12}
            style={({ pressed }) => [styles.skipButton, pressed && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel="Skip onboarding"
          >
            {/* TODO(i18n): translate "Skip" */}
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        )}
      </View>

      {/* Animated step content */}
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <IllustrationIcon step={step} />

        {/* TODO(i18n): wrap title + description in t() */}
        <Text style={styles.title}>{step.title}</Text>
        <Text style={styles.description}>{step.description}</Text>
      </Animated.View>

      {/* Bottom controls */}
      <View
        style={[
          styles.bottomControls,
          { paddingBottom: insets.bottom + 32 },
        ]}
      >
        <ProgressDots current={currentStep} total={TOTAL_STEPS} />

        {/* Next / Explore button */}
        {isLastStep ? (
          // Step 4 — indigo → purple gradient CTA
          <Pressable
            onPress={handleNext}
            style={({ pressed }) => [pressed && { opacity: 0.88 }]}
            accessibilityRole="button"
            accessibilityLabel="Explore the map"
          >
            <LinearGradient
              colors={[palette.brand, palette.brandPurple]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.ctaButton}
            >
              {/* TODO(i18n): translate "Explore the map" */}
              <Text style={styles.ctaText}>Explore the map</Text>
            </LinearGradient>
          </Pressable>
        ) : (
          // Steps 1–3 — solid brand-color button
          <Pressable
            onPress={handleNext}
            style={({ pressed }) => [
              styles.ctaButton,
              styles.ctaButtonSolid,
              pressed && { opacity: 0.85 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Next"
          >
            {/* TODO(i18n): translate "Next" */}
            <Text style={styles.ctaText}>Next</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  canvas: {
    flex: 1,
    backgroundColor: ONBOARDING_COLORS.canvasBg,
  },

  skipContainer: {
    position: 'absolute',
    right: 24,
    zIndex: 10,
  },

  skipButton: {
    paddingVertical: 6,
    paddingHorizontal: 2,
  },

  skipText: {
    fontSize: 15,
    fontWeight: '500',
    color: palette.textSecondary,
    // Matches palette.textSecondary (#aeaeb2 in dark mode)
  },

  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    // Shift content up slightly so bottom controls don't crowd it
    paddingBottom: 120,
  },

  /** 96×96 rounded square container for the 60 px icon */
  iconSquare: {
    width: 96,
    height: 96,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },

  title: {
    fontSize: 26,
    fontWeight: '700',
    color: palette.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.3,
    marginBottom: 16,
    // palette.textPrimary = #f5f5f7
  },

  description: {
    fontSize: 16,
    fontWeight: '400',
    color: palette.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    // palette.textSecondary = #aeaeb2
  },

  bottomControls: {
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 28,
  },

  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  dot: {
    height: 8,
    borderRadius: 4,
  },

  /** Shared button shape — used for both solid and gradient variants */
  ctaButton: {
    width: 280,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    // For the LinearGradient variant the bg color is ignored (gradient paints it)
  },

  ctaButtonSolid: {
    backgroundColor: palette.brand,
    // Soft brand glow
    shadowColor: palette.brand,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },

  ctaText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#ffffff',
    // NOTE: this #ffffff is literally "white text on a colored button" — not a
    // surface color token. Matches palette usage in other auth screens.
    letterSpacing: 0.1,
    ...Platform.select({
      android: { includeFontPadding: false },
    }),
  },
});
