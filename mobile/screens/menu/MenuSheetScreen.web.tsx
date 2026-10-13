/**
 * JChat 3.0 — MenuSheetScreen (web): the venue's public menu in a SHEET over the chat (route `MenuSheet`, a
 * transparentModal, like ProfileSheet). The chat stays mounted behind it.
 *
 * The content is an <iframe> of https://jchat.cloud/m/<slug>?embed=1 (the site allows framing of /m/* by our own
 * domains only; the page keeps its own ordering and payment flow, including the table / pick-up logic). The sheet
 *   - listens for the menu's `postMessage` and accepts ONLY event.origin === MENU_FRAME_ORIGIN and the shape
 *     { type: 'jchat:menu', event: 'order_placed' } (utils/menuSheetMessage): then it closes and the chat shows
 *     "Pedido enviado";
 *   - shows "No se pudo cargar el menú" with Retry and "Abrir en otra pestaña" if the frame errors or has not loaded
 *     within 15 s;
 *   - while it is open, new chat messages count as unread (pill) and a DM shows a notice (same as the profile sheet).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Spinner } from '../../components/common/Spinner';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import WebView from 'react-native-webview';

import type { MainStackParamList } from '../../navigation/AppNavigator';
import { DmNotice } from '../../components/profile/DmNotice';
import { NewMessagesPill } from '../../components/profile/NewMessagesPill';
import { ProfileSheetFrame } from '../../components/profile/ProfileSheetFrame';
import { MENU_FRAME_ORIGIN } from '../../constants/appLinks';
import { useVenueSession } from '../../context/VenueSessionContext';
import { useIncomingDmNotice, type IncomingDmNotice } from '../../hooks/useIncomingDmNotice';
import { emitMenuOrderSent } from '../../services/menuEvents';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { parseMenuSheetMessage } from '../../utils/menuSheetMessage';

const LOAD_TIMEOUT_MS = 15_000;

export default function MenuSheetScreen(): React.ReactElement {
  const c = useThemeColors();
  const { t } = useTranslation('pos');
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { url, businessName, openUrl } = useRoute<RouteProp<MainStackParamList, 'MenuSheet'>>().params;
  const venue = useVenueSession();
  const { setChatCovered } = venue;
  const { notice, dismiss } = useIncomingDmNotice(true);

  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const closingRef = useRef(false);

  useEffect(() => {
    setChatCovered(true);
    return () => setChatCovered(false);
  }, [setChatCovered]);

  const close = useCallback(() => navigation.goBack(), [navigation]);

  // The menu reports an order: close the sheet and let the chat say "Pedido enviado".
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (parseMenuSheetMessage({ origin: event.origin, data: event.data }, MENU_FRAME_ORIGIN) !== 'order_placed') return;
      if (closingRef.current) return;
      closingRef.current = true;
      emitMenuOrderSent();
      navigation.goBack();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [navigation]);

  // A frame that never finishes loading (blocked, offline, wrong headers) must not spin forever.
  useEffect(() => {
    if (state !== 'loading') return undefined;
    const timer = setTimeout(() => setState((s) => (s === 'loading' ? 'error' : s)), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [state, attempt]);

  const retry = useCallback(() => {
    setState('loading');
    setAttempt((n) => n + 1);
  }, []);
  const openInTab = useCallback(() => void Linking.openURL(openUrl ?? url), [openUrl, url]);

  const openNotice = useCallback(
    (n: IncomingDmNotice) => {
      dismiss();
      navigation.navigate('DMs', { screen: 'DMChat', params: { conversationId: n.conversationId, otherUserId: n.senderId } });
    },
    [dismiss, navigation],
  );
  const unread = venue.session ? venue.unreadMessages : 0;

  return (
    <ProfileSheetFrame
      onClose={close}
      a11yLabel={t('menuSheet.frameTitle', { business: businessName ?? '' })}
      testIDBase="menu"
      overlay={
        <>
          {venue.session ? <NewMessagesPill count={unread} business={venue.session.businessName} onPress={close} /> : null}
          {notice ? <DmNotice notice={notice} extraTop={unread > 0 ? 44 : 0} onOpen={openNotice} onDismiss={dismiss} /> : null}
        </>
      }
    >
      <View style={styles.root} testID="menu-sheet-content">
        {state !== 'error' ? (
          <WebView
            key={attempt}
            source={{ uri: url }}
            title={t('menuSheet.frameTitle', { business: businessName ?? '' })}
            onLoadEnd={() => setState((s) => (s === 'loading' ? 'ready' : s))}
            onError={() => setState('error')}
            style={styles.frame}
          />
        ) : null}
        {state === 'loading' ? (
          <View style={styles.center} pointerEvents="none">
            <Spinner size="large" color={c.brandText} />
          </View>
        ) : null}
        {state === 'error' ? (
          <View style={styles.center} testID="menu-sheet-error">
            <Text style={[styles.errorTitle, { color: c.textPrimary }]}>{t('menuSheet.loadError')}</Text>
            <Pressable testID="menu-sheet-retry" onPress={retry} accessibilityRole="button" style={[styles.primary, { backgroundColor: palette.brandFill }]}>
              <Text style={[styles.primaryLabel, { color: palette.onBrand }]}>{t('menuSheet.retry')}</Text>
            </Pressable>
            <Pressable testID="menu-sheet-open-tab" onPress={openInTab} accessibilityRole="button" style={styles.secondary}>
              <Text style={[styles.secondaryLabel, { color: c.brandText }]}>{t('menuSheet.openInTab')}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </ProfileSheetFrame>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  frame: { flex: 1 },
  center: { ...StyleSheet.absoluteFill as object, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  errorTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  primary: { minHeight: 48, minWidth: 200, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  primaryLabel: { fontSize: 15, fontWeight: '700' },
  secondary: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  secondaryLabel: { fontSize: 15, fontWeight: '600' },
});
