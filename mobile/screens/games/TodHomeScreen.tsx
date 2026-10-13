/**
 * JChat 3.0 — Truth or Dare: "Publicar tarjeta".
 *
 * Opened from the Games row of the venue chat. First time: the welcome (rules + "Acepto y jugar") and the tutorial run
 * before anything else; the ⓘ icon reopens the rules. The user picks one of the categories active at the venue (tod_settings,
 * or all five) and the card is published in the room they were in (tod_create_round). Every refusal of the server has its own
 * translated text; the 5-minute publish cooldown shows a live countdown. On success the screen closes and the card is in the chat.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Spinner } from '../../components/common/Spinner';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { IconArrowLeft, IconInfoCircle } from '@tabler/icons-react-native';

import type { MainStackParamList } from '../../navigation/AppNavigator';
import { useThemeColors } from '../../theme/colors';
import { useTodOnboarding } from '../../components/games/TodWelcome';
import { TOD_CATEGORY_META } from '../../components/games/todCategories';
import {
  TOD_COOLDOWN_SECONDS,
  createTodRound,
  fetchTodCategories,
  formatClock,
  resetTodTermsCache,
  setTodCooldown,
  syncTodCards,
  todLocale,
  todReasonKey,
  useTodCooldown,
} from '../../services/tod';
import type { TodCategory } from '../../services/tod';

type Nav = NativeStackNavigationProp<MainStackParamList, 'TodHome'>;

export default function TodHomeScreen() {
  const c = useThemeColors();
  const { t, i18n } = useTranslation('tod');
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<MainStackParamList, 'TodHome'>>();
  const onboarding = useTodOnboarding();
  const [categories, setCategories] = useState<TodCategory[] | null>(null);
  const [publishing, setPublishing] = useState<TodCategory | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // The publish cooldown is its own 5-minute clock (separate from the card-drawing one), kept per venue.
  const publishKey = `${params.businessId}:publish`;
  const cooldown = useTodCooldown(publishKey);

  // Welcome / rules first (once), then the categories; the card cache is brought up to date when Games opens.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const accepted = await onboarding.ensure();
      if (!alive) return;
      if (!accepted) {
        navigation.goBack();
        return;
      }
      void syncTodCards(todLocale(i18n.language));
      const list = await fetchTodCategories(params.businessId);
      if (alive) setCategories(list);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per opening
  }, [params.businessId]);

  const publish = useCallback(
    async (category: TodCategory) => {
      if (publishing || cooldown > 0) return;
      setPublishing(category);
      setMessage(null);
      try {
        const res = await createTodRound(params.roomId, category);
        if (res.status === 'ok') {
          setTodCooldown(publishKey, TOD_COOLDOWN_SECONDS);
          navigation.goBack(); // the card arrives in the chat through Realtime
          return;
        }
        if (res.status === 'cooldown') {
          setTodCooldown(publishKey, res.seconds); // the server is the truth
          return;
        }
        if (res.reason === 'terms_required') resetTodTermsCache();
        setMessage(t(todReasonKey(res.reason)));
      } finally {
        setPublishing(null);
      }
    },
    [publishing, cooldown, params.roomId, publishKey, navigation, t],
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bgBase }]}>
      <View style={[styles.header, { borderBottomColor: c.borderSubtle }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('home.back')}
          hitSlop={10}
          style={styles.iconBtn}
        >
          <IconArrowLeft size={22} color={c.textPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: c.textPrimary }]} accessibilityRole="header">
          {t('home.title')}
        </Text>
        <Pressable
          onPress={onboarding.showRules}
          accessibilityRole="button"
          accessibilityLabel={t('home.rules')}
          hitSlop={10}
          style={styles.iconBtn}
        >
          <IconInfoCircle size={22} color={c.textPrimary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.subtitle, { color: c.textSecondary }]}>{t('home.subtitle')}</Text>

        {cooldown > 0 ? (
          <View style={[styles.banner, { backgroundColor: c.bgElevated, borderColor: c.borderSubtle }]} accessibilityRole="alert">
            <Text style={[styles.bannerText, { color: c.textPrimary }]}>
              {t('home.cooldown', { time: formatClock(cooldown) })}
            </Text>
          </View>
        ) : null}
        {message ? (
          <View style={[styles.banner, { backgroundColor: c.bgElevated, borderColor: c.danger }]} accessibilityRole="alert">
            <Text style={[styles.bannerText, { color: c.dangerText }]}>{message}</Text>
          </View>
        ) : null}

        {categories == null ? (
          <View style={styles.loading}>
            <Spinner color={c.brandText} />
            <Text style={[styles.loadingText, { color: c.textSecondary }]}>{t('home.loading')}</Text>
          </View>
        ) : (
          categories.map((category) => {
            const cat = TOD_CATEGORY_META[category];
            const name = t(`category.${category}.name`);
            const busy = publishing === category;
            const disabled = publishing !== null || cooldown > 0;
            return (
              <Pressable
                key={category}
                accessibilityRole="button"
                accessibilityLabel={t('home.categoryA11y', { name })}
                accessibilityState={{ disabled, busy }}
                disabled={disabled}
                onPress={() => void publish(category)}
                style={[styles.row, { backgroundColor: c.bgSurface, borderColor: cat.color, opacity: disabled && !busy ? 0.55 : 1 }]}
              >
                <View style={[styles.rowIcon, { backgroundColor: cat.color }]}>
                  <cat.Icon size={26} color={cat.onColor} />
                </View>
                <View style={styles.rowText}>
                  <Text style={[styles.rowName, { color: c.textPrimary }]}>{name}</Text>
                  <Text style={[styles.rowDesc, { color: c.textSecondary }]}>{t(`category.${category}.desc`)}</Text>
                </View>
                {busy ? <Spinner color={cat.color} /> : null}
              </Pressable>
            );
          })
        )}
      </ScrollView>
      {onboarding.element}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700' },
  content: { padding: 16, gap: 12 },
  subtitle: { fontSize: 15, lineHeight: 21 },
  banner: { borderRadius: 12, borderWidth: 1, padding: 12 },
  bannerText: { fontSize: 14, fontWeight: '600' },
  loading: { alignItems: 'center', gap: 10, paddingVertical: 30 },
  loadingText: { fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 16, borderWidth: 2, padding: 14, minHeight: 72 },
  rowIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 2 },
  rowName: { fontSize: 18, fontWeight: '800' },
  rowDesc: { fontSize: 13 },
});
