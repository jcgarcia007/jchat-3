/**
 * JChat 3.0 — WebNoVenueScreen (web only): the root screen of a signed-in person on the web.
 * The web is for being INSIDE a venue's chat (reached by scanning a table / venue QR); it has no tabs, no map and
 * no "Nearby". Outside a chat this screen says how to get back in: scan the QR with the phone's camera.
 *   - "Saliste de {local}" right after leaving a venue (route param leftBusinessName), else "Entra a un chat".
 *   - Descargar la app → the store of the browser's platform (utils/storeLink + constants/appLinks).
 *   - Mi perfil → the profile.
 *   - Re-entering: the entry QR / link is consumed once (EntryBridge) and the entry gate's "Cancelar" lands here, so the
 *     last entry of this visit is remembered in the tab (utils/reenterEntry) or derived from a <local>.jchat.cloud host.
 *     With one, the screen offers "Entrar al chat de {local}" (savePendingEntry: EntryBridge consumes it as always, same
 *     gate, same geofence) and "Ver el menú" (the MenuSheet of the chat, no chat entered; hidden without a public menu).
 *     Without one the screen is exactly as before.
 */

import React, { useCallback, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { IconDownload, IconLogin2, IconQrcode, IconToolsKitchen2, IconUser } from '@tabler/icons-react-native';

import type { MainStackParamList } from '../../navigation/AppNavigator';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { supabase } from '../../services/supabase';
import { resolveEntry, savePendingEntry } from '../../services/venueEntry';
import type { EntryTarget } from '../../utils/entryUrl';
import { chooseEntryToOffer, describeOffer, recallEntry } from '../../utils/reenterEntry';
import { detectStorePlatform, storeLinkFor } from '../../utils/storeLink';
import { publicMenuUrl, venueMenuTarget, type VenueMenuTarget } from '../../utils/venueMenuTarget';

interface EntryOffer {
  target: EntryTarget;
  /** Resolved venue name (public RPC); null until it arrives or when it fails ("este local"). */
  name: string | null;
  slug: string | null;
  menu: VenueMenuTarget;
}

export default function WebNoVenueScreen(): React.ReactElement {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation('common');
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<{ Tabs: { leftBusinessName?: string } | undefined }, 'Tabs'>>();
  const leftBusinessName = route.params?.leftBusinessName?.trim() || null;

  const [offer, setOffer] = useState<EntryOffer | null>(null);
  const [entering, setEntering] = useState(false);

  // Offer to re-enter whenever the screen is focused (it stays mounted under the chat, so Cancelar lands here again).
  useFocusEffect(
    useCallback(() => {
      setEntering(false);
      const target = chooseEntryToOffer({ remembered: recallEntry(), href: typeof window !== 'undefined' ? window.location?.href : null });
      if (!target) {
        setOffer(null);
        return undefined;
      }
      setOffer({ target, name: null, slug: null, menu: { kind: 'none' } });
      let cancelled = false;
      void (async () => {
        try {
          const entry = await resolveEntry(target);
          if (cancelled || !entry) return;
          setOffer((o) => (o ? { ...o, name: entry.businessName, slug: entry.businessSlug } : o));
          const { data } = await supabase.from('businesses').select('menu_mode, external_menu_url').eq('slug', entry.businessSlug).maybeSingle();
          if (cancelled) return;
          const row = data as { menu_mode: string | null; external_menu_url: string | null } | null;
          const menu = venueMenuTarget({ platform: 'web', menuMode: row?.menu_mode, slug: entry.businessSlug, externalUrl: row?.external_menu_url });
          setOffer((o) => (o ? { ...o, menu } : o));
        } catch {
          /* name stays generic, no menu button: the enter button still works */
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const enterVenue = useCallback(async () => {
    if (!offer || entering) return;
    setEntering(true);
    await savePendingEntry(offer.target); // EntryBridge consumes it: same gate, same geofence
    setTimeout(() => setEntering(false), 1500);
  }, [offer, entering]);

  const openMenu = useCallback(() => {
    if (!offer) return;
    if (offer.menu.kind === 'web-sheet' && offer.menu.url && offer.slug) {
      navigation.navigate('MenuSheet', { url: offer.menu.url, openUrl: publicMenuUrl(offer.slug), businessName: offer.name ?? undefined });
    } else if (offer.menu.kind === 'external' && offer.menu.url) {
      void Linking.openURL(offer.menu.url);
    }
  }, [navigation, offer]);

  const downloadApp = useCallback(() => {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    const url = storeLinkFor(detectStorePlatform(nav?.userAgent ?? '', nav?.maxTouchPoints ?? 0));
    void Linking.openURL(url);
  }, []);

  const openProfile = useCallback(() => {
    navigation.navigate('ProfileSheet');
  }, [navigation]);

  const names = offer ? describeOffer(offer.target, { resolved: offer.name }) : null;
  const venueLabel = names?.businessName ?? null;
  const showMenu = !!offer && (offer.menu.kind === 'web-sheet' || offer.menu.kind === 'external');
  // With an entry on offer the download / profile buttons step back to the secondary look.
  const downloadStyle = offer ? styles.secondary : styles.primary;

  return (
    <View testID="web-no-venue" style={[styles.root, { backgroundColor: c.bgBase, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.content}>
        {venueLabel ? (
          <Text testID="web-venue-name" accessibilityRole="header" style={[styles.venueName, { color: c.textSecondary }]}>
            {venueLabel}
          </Text>
        ) : null}
        <View style={[styles.iconWrap, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>
          <IconQrcode size={44} color={palette.brand} />
        </View>
        <Text accessibilityRole="header" style={[styles.title, { color: c.textPrimary }]}>
          {leftBusinessName ? t('webShell.leftVenue', { business: leftBusinessName }) : t('webShell.joinTitle')}
        </Text>
        <Text style={[styles.body, { color: c.textSecondary }]}>{t('webShell.scanHint')}</Text>

        {offer ? (
          <Pressable
            testID="web-enter-venue"
            onPress={() => void enterVenue()}
            disabled={entering}
            accessibilityRole="button"
            style={({ pressed }) => [styles.primary, { backgroundColor: palette.brandFill, opacity: entering ? 0.6 : pressed ? 0.85 : 1 }]}
          >
            <IconLogin2 size={20} color={palette.onBrand} />
            <Text style={[styles.primaryLabel, { color: palette.onBrand }]}>
              {leftBusinessName
                ? venueLabel ? t('webShell.reenterVenue', { business: venueLabel }) : t('webShell.reenterThisVenue')
                : venueLabel ? t('webShell.enterVenue', { business: venueLabel }) : t('webShell.enterThisVenue')}
            </Text>
          </Pressable>
        ) : null}

        {showMenu ? (
          <Pressable
            testID="web-view-menu"
            onPress={openMenu}
            accessibilityRole="button"
            style={({ pressed }) => [styles.secondary, { borderColor: c.borderSubtle, backgroundColor: c.bgSurface, opacity: pressed ? 0.85 : 1 }]}
          >
            <IconToolsKitchen2 size={20} color={c.textPrimary} />
            <Text style={[styles.secondaryLabel, { color: c.textPrimary }]}>{t('webShell.viewMenu')}</Text>
          </Pressable>
        ) : null}

        <Pressable
          testID="web-download-app"
          onPress={downloadApp}
          accessibilityRole="button"
          style={({ pressed }) =>
            offer
              ? [downloadStyle, { borderColor: c.borderSubtle, backgroundColor: c.bgSurface, opacity: pressed ? 0.85 : 1 }]
              : [downloadStyle, { backgroundColor: palette.brandFill, opacity: pressed ? 0.85 : 1 }]
          }
        >
          <IconDownload size={20} color={offer ? c.textPrimary : palette.onBrand} />
          <Text style={[offer ? styles.secondaryLabel : styles.primaryLabel, { color: offer ? c.textPrimary : palette.onBrand }]}>{t('webShell.downloadApp')}</Text>
        </Pressable>

        <Pressable
          testID="web-my-profile"
          onPress={openProfile}
          accessibilityRole="button"
          style={({ pressed }) => [styles.secondary, { borderColor: c.borderSubtle, backgroundColor: c.bgSurface, opacity: pressed ? 0.85 : 1 }]}
        >
          <IconUser size={20} color={c.textPrimary} />
          <Text style={[styles.secondaryLabel, { color: c.textPrimary }]}>{t('webShell.myProfile')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 24 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  iconWrap: { width: 88, height: 88, borderRadius: 44, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  venueName: { fontSize: 15, fontWeight: '700', textAlign: 'center', letterSpacing: 0.2 },
  title: { fontSize: 24, fontWeight: '800', textAlign: 'center' },
  body: { fontSize: 16, lineHeight: 23, textAlign: 'center', maxWidth: 360, marginBottom: 8 },
  primary: { minHeight: 52, alignSelf: 'center', maxWidth: 360, width: '100%', borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  primaryLabel: { fontSize: 16, fontWeight: '700' },
  secondary: { minHeight: 52, alignSelf: 'center', maxWidth: 360, width: '100%', borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  secondaryLabel: { fontSize: 16, fontWeight: '600' },
});
