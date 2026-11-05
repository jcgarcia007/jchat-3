/**
 * JChat 3.0 — Login ("boleto" design).
 *
 * Night photo + paper ticket: "Continue with email" (opens the email step), Apple and Google through
 * the same browser OAuth flow as before (handleOAuth), and the link to create an account.
 * Fixed artwork: it does not follow light/dark mode (theme/ticket.ts).
 */

import React, { useCallback, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useNavigation } from '@react-navigation/native';
import { useRegistrationEntry } from '../../hooks/useRegistrationEntry';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { IconArrowRight, IconMail } from '@tabler/icons-react-native';

import { ticket } from '../../theme/ticket';
import { useLoginFonts } from '../../theme/loginFonts';
import { supabase, isSupabaseConfigured } from '../../services/supabase';
import { toUserMessage } from '../../utils/errors';
import type { AuthStackParamList } from '../../navigation/AppNavigator';
import { TicketPlaceholder, TicketShell } from '../../components/auth/TicketShell';
import { TicketHeader } from '../../components/auth/TicketHeader';
import { EntryVenueCard } from '../../components/auth/EntryVenueCard';
import { TicketPerforation } from '../../components/auth/TicketPerforation';
import { TicketTitle, useTicketCascade } from '../../components/auth/TicketReveal';
import { showAlert } from '../../utils/dialog';
import { readAuthCode } from '../../utils/authUrl';
import { AppleAuthSlot } from '../../components/auth/AppleAuthSlot';
import AppText from '../../components/common/AppText';
import { controlMinHeight, sectionGap, space } from '../../theme/spacing';

type LoginNav = NativeStackNavigationProp<AuthStackParamList, 'Login'>;

export default function LoginScreen() {
  const navigation = useNavigation<LoginNav>();
  const openRegistration = useRegistrationEntry(() => navigation.navigate('RegisterStep1'));
  const { t } = useTranslation('auth');
  const fontsReady = useLoginFonts();
  const [oauthBusy, setOauthBusy] = useState(false);
  // Entrance: the ticket rises and, while it is still moving, six blocks fade in one after another
  // (timings live in TicketShell / TicketReveal); the title sweeps in.
  const cascade = useTicketCascade(6, 1);
  const handleContentReady = useCallback(
    (reduceMotion: boolean) => (reduceMotion ? cascade.showAll() : cascade.start()),
    [cascade],
  );

  // ── Social OAuth (deep-link, M1) ───────────────────────────────────────────
  // signInWithOAuth({ redirectTo: jchat://auth/callback, skipBrowserRedirect })
  //   → openAuthSessionAsync abre el browser y captura el redirect de vuelta
  //   → PKCE: ?code=… → exchangeCodeForSession (los tokens en la URL ya no se aceptan: utils/authUrl.ts)
  //   → AuthContext.onAuthStateChange entra a la app.
  async function handleOAuth(provider: 'google' | 'apple') {
    if (!isSupabaseConfigured) {
      showAlert(t('login.alerts.notConfiguredTitle'), t('login.alerts.notConfiguredMessage'));
      return;
    }

    // Deep-link de retorno; debe coincidir con la Redirect URL registrada en Supabase.
    const redirectTo = Linking.createURL('auth/callback');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      // skipBrowserRedirect: abrimos data.url nosotros con openAuthSessionAsync para
      // capturar el retorno y cerrar el flujo dentro de la app.
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) {
      showAlert(t('login.alerts.signInErrorTitle'), toUserMessage(error, 'auth:login.alerts.signInErrorMessage'));
      return;
    }
    if (!data?.url) return;

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    // 'cancel' / 'dismiss' → el usuario cerró el navegador; sin error que reportar.
    if (result.type !== 'success' || !result.url) return;

    // PKCE: the browser returns `?code=…` (tokens in a URL are never accepted, see utils/authUrl.ts). Only this
    // device, which holds the code verifier, can exchange it.
    const code = readAuthCode(result.url);
    if (code) {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        showAlert(t('login.alerts.signInErrorTitle'), toUserMessage(exchangeError, 'auth:login.alerts.signInErrorMessage'));
      }
      return;
    }

    // Sin code: el texto del provider es crudo e inglés; mostrar el genérico traducido.
    showAlert(t('login.alerts.signInErrorTitle'), t('login.alerts.signInErrorMessage'));
  }

  async function runOAuth(provider: 'google' | 'apple') {
    if (oauthBusy) return;
    setOauthBusy(true);
    try {
      await handleOAuth(provider);
    } finally {
      setOauthBusy(false);
    }
  }

  if (!fontsReady) return <TicketPlaceholder />;

  return (
    <TicketShell entrance onContentReady={handleContentReady}>
      <Animated.View style={cascade.blockStyle(0)}>
        <TicketHeader />
        <EntryVenueCard variant="ticket" />
      </Animated.View>
      <Animated.View style={cascade.blockStyle(1)}>
        <TicketTitle text={t('ticket.title')} reveal={cascade.reveal} />
      </Animated.View>
      <Animated.View style={cascade.blockStyle(2)}>
        <AppText variant="body" family="text" color={ticket.ticketInkMuted} style={styles.subtitle}>
          {t('ticket.subtitle')}
        </AppText>
      </Animated.View>

      <Animated.View style={cascade.blockStyle(3)}>
      <Pressable
        onPress={() => navigation.navigate('LoginEmail')}
        style={styles.primary}
        accessibilityRole="button"
        accessibilityLabel={t('ticket.continueEmail')}
      >
        <IconMail size={22} color={ticket.ticketButtonText} strokeWidth={1.75} />
        <AppText variant="button" family="textXBold" color={ticket.ticketButtonText}>
          {t('ticket.continueEmail')}
        </AppText>
        <IconArrowRight size={22} color={ticket.ticketButtonText} strokeWidth={1.75} />
      </Pressable>
      </Animated.View>

      {/* Apple: the OFFICIAL native button on iOS (guideline 4.8 + HIG), as prominent as Google's; Android / web keep the
          browser OAuth button. TODO(official-social-buttons): the official Google "G" logo is still text-only. */}
      <Animated.View style={[styles.socialRow, cascade.blockStyle(4)]}>
        <AppleAuthSlot
          mode="signIn"
          surface="light" // the paper ticket is light in both themes
          disabled={oauthBusy}
          style={styles.socialOfficial}
          cornerRadius={14}
          onError={(message) => showAlert(t('login.alerts.signInErrorTitle'), message)}
          fallback={
            <Pressable
              onPress={() => void runOAuth('apple')}
              disabled={oauthBusy}
              style={[styles.social, oauthBusy && styles.socialBusy]}
              accessibilityRole="button"
              accessibilityLabel={t('login.appleA11y')}
            >
              <AppText variant="button" family="textBold" color={ticket.ticketInk}>{t('ticket.apple')}</AppText>
            </Pressable>
          }
        />
        <Pressable
          onPress={() => void runOAuth('google')}
          disabled={oauthBusy}
          style={[styles.social, oauthBusy && styles.socialBusy]}
          accessibilityRole="button"
          accessibilityLabel={t('login.googleA11y')}
        >
          <AppText variant="button" family="textBold" color={ticket.ticketInk}>{t('ticket.google')}</AppText>
        </Pressable>
      </Animated.View>

      {/* TODO(biometric-login): the "BIOMETRICS" divider + Face ID button go here once a real biometric
          sign-in exists (needs the session stored with expo-secure-store). Hidden until then: the
          old button could not sign anyone in. LockScreen is unrelated and untouched. */}

      <Animated.View style={cascade.blockStyle(5)}>
      <TicketPerforation />

      <View style={styles.newHere}>
        <AppText variant="body" family="text" color={ticket.ticketInkMuted}>{t('ticket.newHere')} </AppText>
        <Pressable
          onPress={openRegistration}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={t('ticket.createAccount')}
        >
          <AppText variant="body" family="textBold" color={ticket.ticketButton}>{t('ticket.createAccount')}</AppText>
        </Pressable>
      </View>
      </Animated.View>
    </TicketShell>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    marginTop: space.sm,
    marginBottom: sectionGap,
  },
  primary: {
    minHeight: 56,
    borderRadius: 14,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: ticket.ticketButton,
  },
  socialRow: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  social: {
    flex: 1,
    minHeight: 50, // = the official Apple button next to it
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ticket.ticketFieldBorder,
    backgroundColor: ticket.ticketField,
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialBusy: { opacity: 0.6 },
  // Apple's official button: same row slot and height as the Google button.
  socialOfficial: { flex: 1, height: 50 },
  newHere: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: controlMinHeight },
});
