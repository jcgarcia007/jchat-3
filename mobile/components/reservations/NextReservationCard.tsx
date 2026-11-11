/**
 * JChat 3.0 — NextReservationCard (M3): "Your next reservation".
 *
 * Sits on top of Nearby and of My reservations while the signed-in customer has a pending or confirmed reservation that has not expired
 * (hooks/useNextReservation; it leaves 2 h after its time). Shows the venue, when (the venue's calendar and clock), how many people,
 * the status with a coloured dot and the request chips, and four actions: directions (the phone's maps app), view the venue (its chat),
 * cancel (two steps: a confirmation first) and, once the build has a calendar module, add to calendar (CALENDAR_BUTTON_ENABLED, off).
 * One accessible region with the whole text as its label; every button is at least controlMinHeight tall; text uses the type standard.
 */

import React, { useCallback, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { IconBuildingStore, IconMapPin } from '@tabler/icons-react-native';

import AppText from '../common/AppText';
import { Spinner } from '../common/Spinner';
import type { MainStackParamList } from '../../navigation/AppNavigator';
import { useAuth } from '../../context/AuthContext';
import { useNextReservation } from '../../hooks/useNextReservation';
import { reservationBusiness, type MyReservationRow } from '../../services/reservations';
import { resolveMainRoomId } from '../../services/businesses';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { controlMinHeight, space } from '../../theme/spacing';
import { confirm } from '../../utils/dialog';
import { colorIndex, initials } from '../../utils/mapPin';
import { directionsUrl, nextWhenLabel } from '../../utils/nextReservation';
import { parseRequests, type FlowLocale } from '../../utils/reservationFlow';
import { statusLabelKey, statusTone } from '../../utils/reservationStatus';

/** "Add to calendar" needs a native calendar module, which arrives with the next build. Off until then; the card never shows the button. */
export const CALENDAR_BUTTON_ENABLED = false;

const AVATAR_COLORS = [palette.brand, palette.brandPurple, palette.success, palette.gold];

type Nav = NativeStackNavigationProp<MainStackParamList>;

export interface NextReservationCardProps {
  /** A list on the same screen that must reload when the reservation changes on the server (My reservations). */
  onChange?: () => void;
}

export default function NextReservationCard({ onChange }: NextReservationCardProps): React.ReactElement | null {
  const c = useThemeColors();
  const { t, i18n } = useTranslation('reservations');
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const { next, more, nowMs, cancel } = useNextReservation(user?.id ?? null, onChange);
  const [busy, setBusy] = useState<'cancel' | 'venue' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const locale: FlowLocale = i18n.language?.startsWith('en') ? 'en' : 'es';

  const askToCancel = useCallback(async (row: MyReservationRow) => {
    const business = reservationBusiness(row);
    const name = business.name || t('venueFallback');
    const when = nextWhenLabel(row.reserved_at, business.timezone, Date.now(), locale, { today: t('next.today'), tomorrow: t('next.tomorrow') });
    const accepted = await confirm(
      t('confirmCancelTitle'),
      t('confirmCancelBody', { business: name, when }),
      { confirmText: t('cancelButton'), cancelText: t('keep'), destructive: true },
    );
    if (!accepted) return;
    setBusy('cancel');
    setError(null);
    try {
      await cancel(row.id);
    } catch (e) {
      console.warn('[next-reservation] cancel error:', e);
      setError(t('cancelError'));
    } finally {
      setBusy(null);
    }
  }, [cancel, locale, t]);

  const openDirections = useCallback(async (row: MyReservationRow) => {
    const business = reservationBusiness(row);
    const url = directionsUrl(business.lat, business.lng);
    setError(null);
    try {
      if (!url) throw new Error('no_coordinates');
      await Linking.openURL(url);
    } catch (e) {
      console.warn('[next-reservation] directions error:', e);
      setError(t('next.directionsError'));
    }
  }, [t]);

  const openVenue = useCallback(async (row: MyReservationRow) => {
    setBusy('venue');
    setError(null);
    try {
      const roomId = await resolveMainRoomId(row.business_id);
      if (roomId) navigation.navigate('ChatRoom', { id: roomId });
    } catch (e) {
      console.warn('[next-reservation] venue error:', e);
    } finally {
      setBusy(null);
    }
  }, [navigation]);

  if (!next) return null;

  const business = reservationBusiness(next);
  const name = business.name || t('venueFallback');
  const when = nextWhenLabel(next.reserved_at, business.timezone, nowMs, locale, { today: t('next.today'), tomorrow: t('next.tomorrow') });
  const people = t('people', { count: next.party_size });
  const statusText = t(statusLabelKey(next.status));
  const tone = statusTone(next.status);
  const dot = tone === 'success' ? c.success : c.warning;
  const parsed = parseRequests(next.special_requests);
  const requests = parsed.keys.map((k) => t(`request.${k}`));
  const hasDirections = directionsUrl(business.lat, business.lng) !== null;
  const label = `${t('next.a11y', { business: name, when, people, status: statusText })}${requests.length > 0 ? `, ${t('requestsLabel')}: ${requests.join(', ')}` : ''}${more > 0 ? `, ${t('next.more', { count: more })}` : ''}`;

  return (
    <View style={[styles.card, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>
      <View accessible accessibilityRole="summary" accessibilityLabel={label} style={styles.body}>
        <AppText variant="label" color={c.textSecondary}>{t('next.title')}</AppText>
        <View style={styles.top}>
          {business.logoUrl ? (
            <Image source={{ uri: business.logoUrl }} style={styles.avatar} contentFit="cover" accessible={false} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: AVATAR_COLORS[colorIndex(next.business_id, AVATAR_COLORS.length)] }]}>
              <AppText variant="compact" color={palette.onBrand}>{initials(name)}</AppText>
            </View>
          )}
          <View style={styles.main}>
            <AppText variant="headline" numberOfLines={1}>{name}</AppText>
            <AppText variant="body" color={c.textPrimary}>{when}</AppText>
            <View style={styles.statusRow}>
              <View style={[styles.dot, { backgroundColor: dot }]} />
              <AppText variant="compact" color={c.textSecondary}>{`${people} · ${statusText}`}</AppText>
            </View>
          </View>
        </View>
        {requests.length > 0 ? (
          <View style={styles.chips}>
            {requests.map((text) => (
              <View key={text} style={[styles.chip, { borderColor: c.borderSubtle, backgroundColor: c.bgElevated }]}>
                <AppText variant="caption" color={c.textSecondary}>{text}</AppText>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      {error ? <AppText variant="compact" color={c.dangerText} accessibilityLiveRegion="polite">{error}</AppText> : null}

      <View style={styles.actions}>
        {hasDirections ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('next.directionsA11y', { business: name })}
            onPress={() => { void openDirections(next); }}
            style={({ pressed }) => [styles.btn, { backgroundColor: c.brandFill, opacity: pressed ? 0.8 : 1 }]}
          >
            <IconMapPin size={18} color={palette.onBrand} />
            <AppText variant="button" color={palette.onBrand}>{t('next.directions')}</AppText>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('next.viewVenueA11y', { business: name })}
          accessibilityState={{ busy: busy === 'venue' }}
          disabled={busy !== null}
          onPress={() => { void openVenue(next); }}
          style={({ pressed }) => [styles.btn, styles.btnOutline, { borderColor: c.borderSubtle, opacity: pressed || busy === 'venue' ? 0.7 : 1 }]}
        >
          <IconBuildingStore size={18} color={c.textPrimary} />
          <AppText variant="button">{t('next.viewVenue')}</AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('cancelA11y', { business: name })}
          accessibilityState={{ busy: busy === 'cancel', disabled: busy !== null }}
          disabled={busy !== null}
          onPress={() => { void askToCancel(next); }}
          style={({ pressed }) => [styles.btn, styles.btnOutline, { borderColor: c.danger, opacity: pressed || busy === 'cancel' ? 0.7 : 1 }]}
        >
          {busy === 'cancel' ? <Spinner color={c.dangerText} size="small" /> : <AppText variant="button" color={c.dangerText}>{t('next.cancel')}</AppText>}
        </Pressable>
      </View>

      {more > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('next.moreA11y')}
          onPress={() => navigation.navigate('MyReservations')}
          style={styles.more}
        >
          <AppText variant="compact" color={c.brandText}>{t('next.more', { count: more })}</AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, gap: space.md, marginBottom: space.md, padding: space.lg },
  body: { gap: space.sm },
  top: { alignItems: 'center', flexDirection: 'row', gap: space.md },
  avatar: { borderRadius: 24, height: 48, width: 48 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  main: { flex: 1, gap: space.xs },
  statusRow: { alignItems: 'center', flexDirection: 'row', gap: space.sm },
  dot: { borderRadius: 5, height: 10, width: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: space.md, paddingVertical: space.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  btn: { alignItems: 'center', borderRadius: 12, flexDirection: 'row', gap: space.sm, justifyContent: 'center', minHeight: controlMinHeight, paddingHorizontal: space.lg },
  btnOutline: { borderWidth: 1 },
  more: { alignItems: 'center', justifyContent: 'center', minHeight: controlMinHeight },
});
