/**
 * JChat 3.0 — Match home (Fase D1)
 *
 * Entry screen of Match for a venue. In D1 it shows the presence state (verifying / denied /
 * active), the QR option to activate instantly, and "Leave the venue". The swipe deck (D3)
 * renders in the `active` branch.
 *
 * Presence comes from the shared store, fed by the chat screen's heartbeat — the chat stays
 * mounted underneath this screen, so check-ins keep running while Match is open.
 */

import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { IconArrowLeft, IconHeartHandshake, IconLogout, IconQrcode, IconUserCircle } from '@tabler/icons-react-native';

import type { MainStackParamList } from '../../navigation/AppNavigator';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { MatchQrScanner } from '../../components/match/MatchQrScanner';
import { MatchDeckSection } from '../../components/match/MatchDeckSection';
import { matchCheckInWithQr, useMatchPresenceState } from '../../services/matchPresence';
import { confirmLeaveVenue } from '../../utils/matchLeave';
import { useAuth } from '../../context/AuthContext';
import { useRequireMatchPresence } from '../../hooks/useRequireMatchPresence';
import { fetchMyInterestKeys } from '../../services/matchProfile';
import { hasSkippedInterestsQuiz } from '../../services/match';

type Nav = NativeStackNavigationProp<MainStackParamList, 'MatchHome'>;

/** Deny reasons for which scanning the venue QR can still unlock Match. */
const QR_CAN_HELP = new Set(['invalid_qr', 'location_required', 'outside_radius', 'impossible_travel', 'no_geofence']);

export default function MatchHomeScreen() {
  const c = useThemeColors();
  const { t } = useTranslation('match');
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<MainStackParamList, 'MatchHome'>>();
  const presence = useMatchPresenceState();
  useRequireMatchPresence(params.businessId, 'present');
  const [scannerOpen, setScannerOpen] = useState(false);
  const { user } = useAuth();
  const quizOfferedRef = useRef(false);

  // First time in Match without interests → offer the quiz once per visit (unless skipped before).
  useFocusEffect(
    useCallback(() => {
      if (presence.status !== 'active' || !user?.id || quizOfferedRef.current) return;
      quizOfferedRef.current = true;
      void Promise.all([fetchMyInterestKeys(user.id), hasSkippedInterestsQuiz()])
        .then(([keys, skipped]) => {
          if (keys.length === 0 && !skipped) navigation.navigate('MatchInterests', { firstTime: true });
        })
        .catch(() => undefined);
    }, [presence.status, user?.id, navigation]),
  );

  const handleToken = useCallback((token: string) => {
    setScannerOpen(false);
    void matchCheckInWithQr(token);
  }, []);

  const handleLeave = useCallback(() => {
    confirmLeaveVenue({
      businessId: params.businessId,
      businessName: params.businessName ?? '',
      // Leaving the venue also leaves its chat: back to the tabs.
      onLeft: () => navigation.navigate('Tabs'),
    });
  }, [navigation, params.businessId, params.businessName]);

  const denied = presence.status === 'denied';
  // Match activates instantly with the chat's GPS reading: 'checking' is just the call in flight.
  const checking = presence.status === 'idle' || presence.status === 'checking';
  // 'pending' only with a mocked location → the venue QR is the way in.
  const pending = presence.status === 'pending';
  const deniedKey = denied
    ? (presence.reason && `presence.denied.${presence.reason}`) || 'presence.denied.default'
    : null;
  const showQrButton = pending || (denied && !!presence.reason && QR_CAN_HELP.has(presence.reason));

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
          onPress={() => navigation.navigate('MatchActivity', { businessId: params.businessId, businessName: params.businessName })}
          accessibilityRole="button"
          accessibilityLabel={t('home.myActivity')}
          hitSlop={10}
          style={styles.iconBtn}
        >
          <IconHeartHandshake size={22} color={c.textPrimary} />
        </Pressable>
        <Pressable
          onPress={() => navigation.navigate('MatchMyProfile')}
          accessibilityRole="button"
          accessibilityLabel={t('home.myProfile')}
          hitSlop={10}
          style={styles.iconBtn}
        >
          <IconUserCircle size={22} color={c.textPrimary} />
        </Pressable>
        <Pressable
          onPress={handleLeave}
          accessibilityRole="button"
          accessibilityLabel={t('leave.button')}
          hitSlop={10}
          style={styles.iconBtn}
        >
          <IconLogout size={22} color={c.danger} />
        </Pressable>
      </View>

      <View style={styles.body}>
        {checking && (
          <View style={styles.block}>
            <ActivityIndicator color={c.brand} />
          </View>
        )}

        {pending && (
          <View style={styles.block}>
            <Text style={[styles.message, { color: c.textPrimary }]}>{t('presence.mocked')}</Text>
          </View>
        )}

        {denied && deniedKey && (
          <View style={styles.block}>
            <Text style={[styles.message, { color: c.textPrimary }]}>{t(deniedKey)}</Text>
          </View>
        )}

        {presence.status === 'active' && (
          <MatchDeckSection
            businessId={params.businessId}
            onMatch={(card, result) =>
              navigation.navigate('MatchItsAMatch', {
                businessId: params.businessId,
                businessName: params.businessName,
                other: card,
                conversationId: result.conversation_id,
                matchId: result.match_id,
              })
            }
            onOpenProfile={(card) =>
              navigation.navigate('MatchProfile', {
                businessId: params.businessId,
                userId: card.id,
                businessName: params.businessName,
                card,
              })
            }
          />
        )}

        {presence.error && !denied && (
          <Text style={[styles.hint, { color: c.warning }]}>{t('presence.error')}</Text>
        )}

        {showQrButton && (
          <Pressable
            onPress={() => setScannerOpen(true)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.qrBtn, { backgroundColor: c.brand, opacity: pressed ? 0.85 : 1 }]}
          >
            <IconQrcode size={20} color={palette.onBrand} />
            <Text style={[styles.qrBtnText, { color: palette.onBrand }]}>{t('presence.scanQr')}</Text>
          </Pressable>
        )}
      </View>

      <MatchQrScanner visible={scannerOpen} onToken={handleToken} onClose={() => setScannerOpen(false)} />
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
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, gap: 20 },
  block: { alignItems: 'center', gap: 12 },
  message: { fontSize: 17, fontWeight: '600', textAlign: 'center', lineHeight: 24 },
  hint: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  qrBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 22,
    borderRadius: 14,
  },
  qrBtnText: { fontSize: 16, fontWeight: '700' },
});
