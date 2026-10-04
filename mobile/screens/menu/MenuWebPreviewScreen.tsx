import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconArrowLeft } from '@tabler/icons-react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import WebView from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import type { CartModifierSelection } from '../../context/CartContext';
import type { MenuItem, MenuOptionChoice } from '../../services/menu';
import type { MainStackParamList } from '../../navigation/AppNavigator';

type WebRoute = RouteProp<MainStackParamList, 'MenuWebPreview'>;
type WebNav = NativeStackNavigationProp<MainStackParamList, 'MenuWebPreview'>;

/** The WebView may only navigate inside our own domain. */
const WEB_ORIGIN_WHITELIST = ['https://jchat.cloud', 'https://*.jchat.cloud'];

// What the web sends when the user taps "Continuar al pago" in app mode
// (web/app/m/[slug]/MenuPageClient.tsx). It is UNTRUSTED input: validated before use.
interface CheckoutLine {
  menuItemId: string;
  name: string;
  qty: number;
  priceCents: number;
  size: string | null;
  extras: string[];
  modifiers: { g: string; c: string[] }[];
  specialInstructions: string | null;
}

interface CheckoutMessage {
  businessId: string;
  roomId: string | null;
  items: CheckoutLine[];
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

/** Returns the message only if it has exactly the shape the cart needs; otherwise null. */
function parseCheckoutMessage(raw: unknown): CheckoutMessage | null {
  if (!isObject(raw) || raw.type !== 'CHECKOUT') return null;
  if (typeof raw.businessId !== 'string' || !raw.businessId) return null;
  if (raw.roomId !== null && raw.roomId !== undefined && typeof raw.roomId !== 'string') return null;
  if (!Array.isArray(raw.items) || raw.items.length === 0 || raw.items.length > 100) return null;

  const items: CheckoutLine[] = [];
  for (const entry of raw.items) {
    if (!isObject(entry)) return null;
    const { menuItemId, name, qty, priceCents, options, specialInstructions } = entry;
    if (typeof menuItemId !== 'string' || !menuItemId) return null;
    if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1 || qty > 99) return null;
    // The price is display-only on the way in: the server re-prices everything.
    const unitPrice = typeof priceCents === 'number' && Number.isFinite(priceCents) && priceCents >= 0 ? priceCents : 0;
    const opts = isObject(options) ? options : {};
    const modifiers: { g: string; c: string[] }[] = [];
    if (Array.isArray(opts.modifiers)) {
      for (const m of opts.modifiers) {
        if (!isObject(m) || typeof m.g !== 'string' || !isStringArray(m.c)) return null;
        modifiers.push({ g: m.g, c: m.c });
      }
    }
    if (opts.extras !== undefined && !isStringArray(opts.extras)) return null;
    if (opts.size !== undefined && opts.size !== null && typeof opts.size !== 'string') return null;
    items.push({
      menuItemId,
      name: typeof name === 'string' ? name : '',
      qty,
      priceCents: unitPrice,
      size: typeof opts.size === 'string' ? opts.size : null,
      extras: (opts.extras as string[] | undefined) ?? [],
      modifiers,
      specialInstructions: typeof specialInstructions === 'string' ? specialInstructions : null,
    });
  }
  return { businessId: raw.businessId, roomId: (raw.roomId as string | null | undefined) ?? null, items };
}

/** Minimal MenuItem for a cart line built from the web: Checkout re-prices from the server. */
function menuItemFromWeb(line: CheckoutLine, businessId: string): MenuItem {
  return {
    id: line.menuItemId, category_id: '', business_id: businessId, name: line.name || '—',
    description: null, price_cents: line.priceCents, photo_url: null, image_url: null,
    staff_details: null, staff_details_alt: null, dietary_tags: [], id_required: false, badge: null,
    is_available: true, is_published: true, stock_count: null, options: {}, sort: 0, has_modifiers: false,
  };
}

export default function MenuWebPreviewScreen() {
  const c = useThemeColors();
  const { t } = useTranslation('pos');
  const navigation = useNavigation<WebNav>();
  const route = useRoute<WebRoute>();
  const { slug, businessName, businessId, roomId } = route.params;
  const { user } = useAuth();
  const cart = useCart();

  // WebView state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const handedOffRef = useRef(false); // prevents a double hand-off to Checkout

  // ?app=1 signals the web to skip its own payment flow; ?room= passes the roomId.
  const uri = `https://jchat.cloud/m/${slug}?app=1${roomId ? `&room=${encodeURIComponent(roomId)}` : ''}`;

  const handleRetry = useCallback(() => {
    setError(false);
    setRetryKey((k) => k + 1);
  }, []);

  // ── Checkout bridge ─────────────────────────────────────────────────────────
  // The app does not compute or charge here: the web's lines go into the cart and the
  // native Checkout screen asks the server for the real quote.

  const handleCheckout = useCallback((msg: CheckoutMessage) => {
    if (handedOffRef.current) return;

    // R4 — the message must be for THIS screen's business and room. A page that was navigated
    // elsewhere (or tampered with) can't target another business.
    if (msg.businessId !== businessId || (msg.roomId ?? null) !== (roomId ?? null)) {
      Alert.alert(t('webPreview.securityTitle'), t('webPreview.securityMessage'));
      return;
    }
    // Who pays is ALWAYS the native session — never anything from the page.
    if (!user?.id) {
      Alert.alert(t('webPreview.signInTitle'), t('webPreview.signInMessage'));
      return;
    }

    handedOffRef.current = true;
    cart.clear();
    cart.setContext(businessId, roomId ?? null);
    cart.setOrderType(roomId ? 'table' : 'counter');
    for (const line of msg.items) {
      const size: MenuOptionChoice | null = line.size ? { label: line.size, price_cents: 0 } : null;
      const extras: MenuOptionChoice[] = line.extras.map((label) => ({ label, price_cents: 0 }));
      const modifierSelections: CartModifierSelection[] = line.modifiers.map((m) => ({
        groupId: m.g,
        groupLabel: '',
        choices: m.c.map((label) => ({ label, price_cents: 0 })),
      }));
      cart.addLine({
        item: menuItemFromWeb(line, businessId),
        qty: line.qty,
        size,
        extras,
        modifierSelections,
        specialInstructions: line.specialInstructions ?? undefined,
        unitPriceCents: line.priceCents,
      });
    }
    navigation.navigate('Checkout');
    // Allow a new hand-off if the user comes back to the menu.
    setTimeout(() => { handedOffRef.current = false; }, 1000);
  }, [businessId, roomId, user?.id, cart, navigation, t]);

  const handleMessage = useCallback((e: WebViewMessageEvent) => {
    let raw: unknown;
    try {
      raw = JSON.parse(e.nativeEvent.data);
    } catch {
      return; // not JSON — ignore
    }
    const msg = parseCheckoutMessage(raw);
    if (msg) handleCheckout(msg);
    else if (isObject(raw) && raw.type === 'CHECKOUT') {
      console.warn('[menu-web] rejected a malformed CHECKOUT message');
    }
  }, [handleCheckout]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bgBase }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: c.bgSurface, borderBottomColor: c.borderSubtle }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.btn, { opacity: pressed ? 0.6 : 1 }]}
          accessibilityRole="button"
          hitSlop={8}
        >
          <IconArrowLeft size={24} color={c.textPrimary} strokeWidth={2} />
        </Pressable>
        <Text style={[styles.title, { color: c.textPrimary }]} numberOfLines={1}>
          {businessName ?? t('webPreview.menuTitle')}
        </Text>
        {/* Spacer to keep title centered */}
        <View style={styles.btn} />
      </View>

      {/* Content */}
      {error ? (
        <View style={[styles.center, { backgroundColor: c.bgBase }]}>
          <Text style={[styles.errorText, { color: c.textSecondary }]}>
            {t('webPreview.loadError')}
          </Text>
          <Pressable
            onPress={handleRetry}
            style={[styles.retryBtn, { backgroundColor: palette.brand }]}
          >
            <Text style={styles.retryBtnText}>{t('webPreview.retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <WebView
            key={retryKey}
            source={{ uri }}
            style={{ flex: 1 }}
            onLoadStart={() => { setLoading(true); setError(false); }}
            onLoadEnd={() => setLoading(false)}
            onError={() => { setLoading(false); setError(true); }}
            onMessage={handleMessage}
            originWhitelist={WEB_ORIGIN_WHITELIST}
            onShouldStartLoadWithRequest={(request) => /^https:\/\/([a-z0-9-]+\.)*jchat\.cloud(\/|$|\?)/i.test(request.url) || request.url === 'about:blank'}
          />
          {loading && (
            <View style={[styles.loadingOverlay, { backgroundColor: c.bgBase }]}>
              <ActivityIndicator size="large" color={palette.brand} />
            </View>
          )}
        </View>
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 4,
  },
  btn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 16, fontWeight: '600', textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  errorText: { fontSize: 15 },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  retryBtnText: { color: palette.bgSurfaceLight, fontWeight: '700', fontSize: 14 },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
