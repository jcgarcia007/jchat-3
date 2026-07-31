import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { IconArrowLeft } from '@tabler/icons-react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import WebView from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { useAuth } from '../../context/AuthContext';
import { initAndPresentPaymentSheet } from '../../services/stripe';
import type { OrderPayload } from '../../services/stripe';
import { DEFAULT_TAX_RATE } from '../../services/tax';
import type { MainStackParamList } from '../../navigation/AppNavigator';

type WebRoute = RouteProp<MainStackParamList, 'MenuWebPreview'>;
type WebNav = NativeStackNavigationProp<MainStackParamList, 'MenuWebPreview'>;

// Shape of the postMessage the web sends when the user taps "Continuar al pago"
// in app mode. Must match what web/app/m/[slug]/MenuPageClient.tsx sends.
interface CheckoutMessage {
  type: 'CHECKOUT';
  businessId: string;
  roomId: string | null;
  items: {
    menuItemId: string;
    name: string;
    qty: number;
    priceCents: number;
    options: { size: string | null; extras: string[]; modifiers: { g: string; c: string[] }[] };
    specialInstructions: string | null;
  }[];
}

function makeDemoOrderNumber(): string {
  return `#J-${String(Math.floor(Math.random() * 99999) + 1).padStart(5, '0')}`;
}

function makeIdempotencyKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function MenuWebPreviewScreen() {
  const c = useThemeColors();
  const navigation = useNavigation<WebNav>();
  const route = useRoute<WebRoute>();
  const { slug, businessName, businessId, roomId } = route.params;
  const { user } = useAuth();

  // WebView state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  // Payment processing state
  const [payProcessing, setPayProcessing] = useState(false);
  const payingRef = useRef(false); // prevents double-trigger

  // ?app=1 signals the web to skip its own payment flow; ?room= passes the roomId.
  const uri = `https://jchat.cloud/m/${slug}?app=1${roomId ? `&room=${encodeURIComponent(roomId)}` : ''}`;

  const handleRetry = useCallback(() => {
    setError(false);
    setRetryKey((k) => k + 1);
  }, []);

  // ── Checkout bridge ─────────────────────────────────────────────────────────

  const handleCheckout = useCallback(async (msg: CheckoutMessage) => {
    // Guard: one payment at a time
    if (payingRef.current) return;

    // R4 — verify the businessId from the message matches this screen's context.
    // Without this check, a malicious page could target a different business.
    if (msg.businessId !== businessId) {
      Alert.alert(
        'Error de seguridad',
        'El negocio del pedido no coincide. Por favor vuelve al menú.',
      );
      return;
    }

    // userId ALWAYS from the native Supabase session — never from the message.
    const userId = user?.id;
    if (!userId) {
      Alert.alert(
        'Sesión requerida',
        'Necesitas iniciar sesión para pagar.',
      );
      return;
    }

    // Compute totals client-side (server recalculates everything; these are hints only).
    const subtotalCents = msg.items.reduce((s, i) => s + i.priceCents * i.qty, 0);
    const taxCents = Math.round(subtotalCents * DEFAULT_TAX_RATE);
    const tipCents = 0;
    const totalCents = subtotalCents + taxCents + tipCents;
    const orderType = msg.roomId ? 'table' : 'counter';

    const payload: OrderPayload = {
      businessId,
      userId,
      roomId: msg.roomId,
      orderType,
      subtotalCents,
      taxCents,
      tipCents,
      discountCents: 0,
      totalCents,
      idempotencyKey: makeIdempotencyKey(),
      items: msg.items.map((i) => ({
        menuItemId: i.menuItemId,
        name: i.name,
        qty: i.qty,
        priceCents: i.priceCents,
        options: i.options as Record<string, unknown>,
        specialInstructions: i.specialInstructions,
      })),
    };

    payingRef.current = true;
    setPayProcessing(true);
    try {
      const result = await initAndPresentPaymentSheet(payload);
      if (result.ok) {
        navigation.navigate('PaymentSuccess', {
          orderNumber: makeDemoOrderNumber(),
          businessName: businessName ?? 'Restaurante',
          orderType,
          roomId: msg.roomId ?? undefined,
          cardAlreadySaved: false,
        });
      } else if (result.code !== 'Canceled') {
        Alert.alert(
          'Error en el pago',
          result.message || 'No se pudo procesar el pago. Inténtalo de nuevo.',
        );
      }
    } finally {
      setPayProcessing(false);
      payingRef.current = false;
    }
  }, [businessId, businessName, user?.id, navigation]);

  const handleMessage = useCallback((e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data) as { type?: string };
      if (msg.type === 'CHECKOUT') {
        void handleCheckout(msg as CheckoutMessage);
      }
    } catch {
      // Malformed message — ignore silently
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
          {businessName ?? 'Vista web (beta)'}
        </Text>
        {/* Spacer to keep title centered */}
        <View style={styles.btn} />
      </View>

      {/* Content */}
      {error ? (
        <View style={[styles.center, { backgroundColor: c.bgBase }]}>
          <Text style={[styles.errorText, { color: c.textSecondary }]}>
            No se pudo cargar el menú.
          </Text>
          <Pressable
            onPress={handleRetry}
            style={[styles.retryBtn, { backgroundColor: palette.brand }]}
          >
            <Text style={styles.retryBtnText}>Reintentar</Text>
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
          />
          {loading && (
            <View style={[styles.loadingOverlay, { backgroundColor: c.bgBase }]}>
              <ActivityIndicator size="large" color={palette.brand} />
            </View>
          )}
        </View>
      )}

      {/* Payment processing overlay */}
      <Modal transparent animationType="fade" visible={payProcessing} statusBarTranslucent>
        <View style={styles.payOverlayBg}>
          <View style={[styles.payOverlayCard, { backgroundColor: c.bgElevated }]}>
            <ActivityIndicator size="large" color={palette.brand} />
            <Text style={[styles.payOverlayText, { color: c.textPrimary }]}>
              Procesando pago…
            </Text>
          </View>
        </View>
      </Modal>
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
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payOverlayBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  payOverlayCard: {
    borderRadius: 20,
    paddingHorizontal: 40,
    paddingVertical: 36,
    alignItems: 'center',
    gap: 14,
    minWidth: 220,
  },
  payOverlayText: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
});
