/**
 * JChat 3.0 — PricingScreen (user plans)
 *
 * Shows the two USER-tier plans: Regular (free) and Verified ($1.99/mo).
 * Purely visual — no payment logic in this version. The "Get Verified" CTA
 * shows a "Coming soon" alert until the Stripe flow is wired up.
 *
 * Business/Pro plans are NOT shown here — they live at /pricing on the web.
 */

import React, { useEffect, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import {
  IconArrowLeft,
  IconCheck,
  IconShieldCheck,
  IconUser,
} from '@tabler/icons-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { useAuth } from '../../context/AuthContext';
import { supabase, isSupabaseConfigured } from '../../services/supabase';

type UserPlan = 'regular' | 'verified' | 'business' | 'pro';

export default function PricingScreen() {
  const { t } = useTranslation('pricing');
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { user } = useAuth();

  const [currentPlan, setCurrentPlan] = useState<UserPlan | null>(null);

  // Read the user's current plan from users table (not in AuthContext).
  useEffect(() => {
    const userId = user?.id;
    if (!userId || !isSupabaseConfigured) return;
    let mounted = true;
    void supabase
      .from('users')
      .select('plan')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (mounted && data?.plan) setCurrentPlan(data.plan as UserPlan);
      });
    return () => { mounted = false; };
  }, [user?.id]);

  const handleGetVerified = () => {
    Alert.alert(t('comingSoon'), t('comingSoonMsg'));
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bgBase }]}>
      <StatusBar barStyle={c.bgBase === palette.bgBase ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: Platform.OS === 'android' ? insets.top + 8 : 12,
            backgroundColor: c.bgBase,
            borderBottomColor: c.borderSubtle,
          },
        ]}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
          hitSlop={8}
          accessibilityRole="button"
        >
          <IconArrowLeft size={24} color={c.textPrimary} strokeWidth={2} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: c.textPrimary }]}>{t('title')}</Text>
        {/* Spacer to centre the title */}
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Subtitle */}
        <Text style={[styles.subtitle, { color: c.textSecondary }]}>{t('subtitle')}</Text>

        {/* ── Regular card ───────────────────────────────────────────────────── */}
        <PlanCard
          title={t('plans.regular.name')}
          price={t('plans.regular.price')}
          description={t('plans.regular.description')}
          features={t('plans.regular.features', { returnObjects: true }) as string[]}
          icon={<IconUser size={22} color={c.textSecondary} strokeWidth={2} />}
          accentColor={c.textSecondary}
          isCurrentPlan={currentPlan === 'regular' || currentPlan === null}
          ctaLabel={
            currentPlan === 'regular' || currentPlan === null
              ? t('currentPlan')
              : t('currentPlan')
          }
          onCta={undefined}
          c={c}
        />

        {/* ── Verified card ──────────────────────────────────────────────────── */}
        <PlanCard
          title={t('plans.verified.name')}
          price={t('plans.verified.price')}
          description={t('plans.verified.description')}
          features={t('plans.verified.features', { returnObjects: true }) as string[]}
          icon={<IconShieldCheck size={22} color={palette.brand} strokeWidth={2} />}
          accentColor={palette.brand}
          highlighted
          isCurrentPlan={currentPlan === 'verified'}
          ctaLabel={
            currentPlan === 'verified' ? t('currentPlan') : t('getVerified')
          }
          onCta={currentPlan !== 'verified' ? handleGetVerified : undefined}
          comingSoonLabel={currentPlan !== 'verified' ? t('comingSoon') : undefined}
          c={c}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── PlanCard ────────────────────────────────────────────────────────────────

interface PlanCardProps {
  title: string;
  price: string;
  description: string;
  features: string[];
  icon: React.ReactNode;
  accentColor: string;
  highlighted?: boolean;
  isCurrentPlan: boolean;
  ctaLabel: string;
  onCta?: () => void;
  comingSoonLabel?: string;
  c: ReturnType<typeof useThemeColors>;
}

function PlanCard({
  title,
  price,
  description,
  features,
  icon,
  accentColor,
  highlighted = false,
  isCurrentPlan,
  ctaLabel,
  onCta,
  comingSoonLabel,
  c,
}: PlanCardProps) {
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: c.bgSurface,
          borderColor: highlighted ? palette.brand : c.borderSubtle,
          borderWidth: highlighted ? 1.5 : StyleSheet.hairlineWidth,
        },
      ]}
    >
      {/* Card header */}
      <View style={styles.cardHeader}>
        <View style={[styles.iconBadge, { backgroundColor: `${accentColor}18` }]}>
          {icon}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.planName, { color: c.textPrimary }]}>{title}</Text>
          <Text style={[styles.planPrice, { color: accentColor }]}>{price}</Text>
        </View>
        {isCurrentPlan && (
          <View style={[styles.currentBadge, { backgroundColor: `${accentColor}18` }]}>
            <Text style={[styles.currentBadgeText, { color: accentColor }]}>✓</Text>
          </View>
        )}
      </View>

      {/* Description */}
      <Text style={[styles.planDescription, { color: c.textSecondary }]}>{description}</Text>

      {/* Features */}
      <View style={styles.featureList}>
        {features.map((f) => (
          <View key={f} style={styles.featureRow}>
            <IconCheck size={14} color={accentColor} strokeWidth={2.5} style={{ marginTop: 1 }} />
            <Text style={[styles.featureText, { color: c.textSecondary }]}>{f}</Text>
          </View>
        ))}
      </View>

      {/* CTA */}
      <Pressable
        onPress={onCta}
        disabled={!onCta}
        style={({ pressed }) => [
          styles.cta,
          {
            backgroundColor: isCurrentPlan
              ? c.bgElevated
              : highlighted
              ? palette.brand
              : c.bgElevated,
            opacity: pressed ? 0.75 : 1,
          },
        ]}
        accessibilityRole="button"
      >
        <Text
          style={[
            styles.ctaText,
            {
              color: isCurrentPlan
                ? c.textSecondary
                : highlighted
                ? '#fff'
                : c.textSecondary,
            },
          ]}
        >
          {ctaLabel}
        </Text>
        {comingSoonLabel && !isCurrentPlan && (
          <Text style={[styles.ctaBadge, { color: highlighted ? 'rgba(255,255,255,0.7)' : c.textTertiary }]}>
            {' · '}{comingSoonLabel}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 16,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 4,
  },
  card: {
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planName: {
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 20,
  },
  planPrice: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  currentBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentBadgeText: {
    fontSize: 14,
    fontWeight: '700',
  },
  planDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  featureList: {
    gap: 8,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  featureText: {
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  cta: {
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginTop: 4,
  },
  ctaText: {
    fontSize: 14,
    fontWeight: '700',
  },
  ctaBadge: {
    fontSize: 13,
    fontWeight: '500',
  },
});
