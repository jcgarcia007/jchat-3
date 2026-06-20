/**
 * JChat 3.0 — PaymentSuccessScreen (Task 3.7)
 *
 * Shown after a successful Stripe payment. Animates a green checkmark in,
 * displays order details, optionally prompts the user to save their card,
 * and provides a "Back to chat" primary action.
 *
 * Route params:
 *   orderNumber     — e.g. "#J-00123"
 *   businessName    — display name of the business
 *   orderType       — 'table' | 'counter' | 'gift'
 *   roomId?         — if present, "Back to chat" navigates to ChatRoom
 *   cardAlreadySaved? — when true the save-card prompt is suppressed
 *
 * ── Notes ─────────────────────────────────────────────────────────────────────
 * - Animation: RN Animated scale+opacity spring on the checkmark circle.
 * - Save card: calls saveCard(user.id) via the SetupIntent Edge Function path.
 *   The server presents a Stripe PaymentSheet configured for card-only setup.
 * - Confirmation email: sent server-side by a Supabase Edge Function that
 *   listens for the payment_intent.succeeded webhook event.
 *   // TODO(server): confirmation email Edge Function
 *
 * Colors: useThemeColors() + palette — NO hardcoded hex.
 * Icons: @tabler/icons-react-native.
 * // TODO(i18n)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { IconCheck } from '@tabler/icons-react-native';

import { useAuth } from '../../context/AuthContext';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { saveCard } from '../../services/stripe';
import type { MainStackParamList } from '../../navigation/AppNavigator';

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * PaymentSuccess is registered in AppNavigator as a MainStack screen.
 * Until that registration happens the type is inlined here so tsc is happy
 * with the generic cast used in useNavigation / useRoute.
 */
type PaymentSuccessParams = {
  orderNumber: string;
  businessName: string;
  orderType: string;
  roomId?: string;
  cardAlreadySaved?: boolean;
};

/**
 * We extend MainStackParamList locally so that tsc resolves the types
 * for the screens we *do* navigate to (ChatRoom / goBack).
 * The 'PaymentSuccess' entry itself is unknown to the navigator until
 * the route is registered — use a generic cast where needed.
 */
type ExtendedParamList = MainStackParamList & {
  PaymentSuccess: PaymentSuccessParams;
};

type PaymentSuccessRoute = RouteProp<ExtendedParamList, 'PaymentSuccess'>;
type PaymentSuccessNav = NativeStackNavigationProp<ExtendedParamList, 'PaymentSuccess'>;

// ── Save-card prompt states ────────────────────────────────────────────────────

type SaveCardState = 'idle' | 'done_saved' | 'done_dismissed' | 'done_error';

// ── Component ─────────────────────────────────────────────────────────────────

export default function PaymentSuccessScreen() {
  const c = useThemeColors();
  const { user } = useAuth();
  const navigation = useNavigation<PaymentSuccessNav>();
  const route = useRoute<PaymentSuccessRoute>();

  const { orderNumber, businessName, orderType, roomId, cardAlreadySaved } =
    route.params;

  // ── Animation setup ──────────────────────────────────────────────────────────
  // The checkmark circle enters with a spring: starts invisible + small,
  // springs to full opacity + full scale.
  const animScale = useRef(new Animated.Value(0)).current;
  const animOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(animScale, {
        toValue: 1,
        tension: 60,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(animOpacity, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }),
    ]).start();
  }, [animScale, animOpacity]);

  // ── Save-card state ──────────────────────────────────────────────────────────
  // `isSaving` is kept separate from `saveState` so that TypeScript does not
  // narrow `saveState` to 'idle' inside JSX branches that gate on it, which
  // would make comparisons like `saveState === 'saving'` unreachable.
  const [saveState, setSaveState] = useState<SaveCardState>('idle');
  const [isSaving, setIsSaving] = useState(false);
  const showSavePrompt = !cardAlreadySaved && saveState === 'idle';

  const handleSaveCard = useCallback(async () => {
    if (!user?.id) return;
    setIsSaving(true);
    const result = await saveCard(user.id);
    setIsSaving(false);
    if (result.ok) {
      setSaveState('done_saved');
    } else {
      // Treat Canceled the same as dismissed — user chose not to save
      if (result.code === 'Canceled') {
        setSaveState('done_dismissed');
      } else {
        setSaveState('done_error');
      }
    }
  }, [user?.id]);

  const handleDismissSavePrompt = useCallback(() => {
    setSaveState('done_dismissed');
  }, []);

  // ── Navigation ───────────────────────────────────────────────────────────────
  const handleBackToChat = useCallback(() => {
    if (roomId) {
      // Cast: ChatRoom is in MainStackParamList and takes { id: string }
      (navigation as NativeStackNavigationProp<MainStackParamList>).navigate(
        'ChatRoom',
        { id: roomId },
      );
    } else {
      navigation.goBack();
    }
  }, [navigation, roomId]);

  // ── Styles (dynamic) ─────────────────────────────────────────────────────────
  const styles = makeStyles(c);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: c.bgBase }]}>
      <View style={styles.container}>

        {/* ── Animated checkmark ────────────────────────────────────────── */}
        <Animated.View
          style={[
            styles.checkCircle,
            { transform: [{ scale: animScale }], opacity: animOpacity },
          ]}
        >
          <IconCheck
            size={40}
            color={palette.bgSurfaceLight}
            strokeWidth={3}
          />
        </Animated.View>

        {/* ── Title ─────────────────────────────────────────────────────── */}
        <Text style={[styles.title, { color: c.textPrimary }]}>
          {/* TODO(i18n) */}
          Payment confirmed!
        </Text>

        {/* ── Order details card ────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>
          {/* Order number — displayed prominently */}
          <Text style={[styles.orderNumberLabel, { color: c.textSecondary }]}>
            {/* TODO(i18n) */}
            Order number
          </Text>
          <Text style={[styles.orderNumber, { color: c.textPrimary }]}>
            {orderNumber}
          </Text>

          <View style={[styles.divider, { backgroundColor: c.borderSubtle }]} />

          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: c.textSecondary }]}>
              {/* TODO(i18n) */}
              Business
            </Text>
            <Text style={[styles.detailValue, { color: c.textPrimary }]}>
              {businessName}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: c.textSecondary }]}>
              {/* TODO(i18n) */}
              Order type
            </Text>
            <Text style={[styles.detailValue, { color: c.textPrimary }]}>
              {/* Capitalise first letter for display */}
              {orderType.charAt(0).toUpperCase() + orderType.slice(1)}
            </Text>
          </View>
        </View>

        {/* ── Confirmation email note ───────────────────────────────────── */}
        <Text style={[styles.emailNote, { color: c.textTertiary }]}>
          {/* TODO(i18n) */}
          {/* TODO(server): confirmation email Edge Function */}
          A confirmation email will be sent to you shortly.
        </Text>

        {/* ── Save-card prompt ──────────────────────────────────────────── */}
        {showSavePrompt && (
          <View style={[styles.savePrompt, { backgroundColor: c.bgSurface, borderColor: c.borderSubtle }]}>
            <Text style={[styles.savePromptTitle, { color: c.textPrimary }]}>
              {/* TODO(i18n) */}
              Save card for faster checkout?
            </Text>
            <View style={styles.savePromptButtons}>
              <Pressable
                style={[styles.saveBtn, styles.saveBtnPrimary, { backgroundColor: c.brand }]}
                onPress={handleSaveCard}
                disabled={isSaving}
                accessibilityLabel="Save card"
                accessibilityRole="button"
              >
                <Text style={styles.saveBtnPrimaryText}>
                  {/* TODO(i18n) */}
                  {isSaving ? 'Saving…' : 'Save card'}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.saveBtn, styles.saveBtnSecondary, { borderColor: c.borderSubtle }]}
                onPress={handleDismissSavePrompt}
                disabled={isSaving}
                accessibilityLabel="Not now"
                accessibilityRole="button"
              >
                <Text style={[styles.saveBtnSecondaryText, { color: c.textSecondary }]}>
                  {/* TODO(i18n) */}
                  Not now
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* ── Save-card result feedback ──────────────────────────────────── */}
        {saveState === 'done_saved' && (
          <Text style={[styles.saveResultText, { color: palette.success }]}>
            {/* TODO(i18n) */}
            Card saved for future checkouts.
          </Text>
        )}
        {saveState === 'done_error' && (
          <Text style={[styles.saveResultText, { color: palette.danger }]}>
            {/* TODO(i18n) */}
            Could not save card. You can try again from your profile settings.
          </Text>
        )}

        {/* ── Back to chat (primary CTA) ────────────────────────────────── */}
        <Pressable
          style={[styles.backBtn, { backgroundColor: c.brand }]}
          onPress={handleBackToChat}
          accessibilityLabel={roomId ? 'Back to chat' : 'Done'}
          accessibilityRole="button"
        >
          <Text style={styles.backBtnText}>
            {/* TODO(i18n) */}
            {roomId ? 'Back to chat' : 'Done'}
          </Text>
        </Pressable>

      </View>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(c: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
    },
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
      gap: 20,
    },

    // Checkmark circle
    checkCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: palette.success,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },

    // Title
    title: {
      fontSize: 26,
      fontWeight: '700',
      textAlign: 'center',
      letterSpacing: -0.3,
    },

    // Order details card
    card: {
      width: '100%',
      borderRadius: 16,
      borderWidth: 1,
      paddingHorizontal: 20,
      paddingVertical: 18,
      gap: 10,
    },
    orderNumberLabel: {
      fontSize: 12,
      fontWeight: '500',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    orderNumber: {
      fontSize: 28,
      fontWeight: '800',
      letterSpacing: -0.5,
    },
    divider: {
      height: 1,
      marginVertical: 4,
    },
    detailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    detailLabel: {
      fontSize: 14,
    },
    detailValue: {
      fontSize: 14,
      fontWeight: '600',
    },

    // Email note
    emailNote: {
      fontSize: 13,
      textAlign: 'center',
    },

    // Save-card prompt
    savePrompt: {
      width: '100%',
      borderRadius: 16,
      borderWidth: 1,
      paddingHorizontal: 20,
      paddingVertical: 18,
      gap: 14,
    },
    savePromptTitle: {
      fontSize: 15,
      fontWeight: '600',
      textAlign: 'center',
    },
    savePromptButtons: {
      flexDirection: 'row',
      gap: 10,
    },
    saveBtn: {
      flex: 1,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveBtnPrimary: {
      // backgroundColor set inline via c.brand
    },
    saveBtnPrimaryText: {
      color: palette.bgSurfaceLight,
      fontSize: 15,
      fontWeight: '600',
    },
    saveBtnSecondary: {
      borderWidth: 1,
    },
    saveBtnSecondaryText: {
      fontSize: 15,
      fontWeight: '500',
    },

    // Save result feedback
    saveResultText: {
      fontSize: 13,
      textAlign: 'center',
    },

    // Back to chat CTA
    backBtn: {
      width: '100%',
      height: 52,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
    },
    backBtnText: {
      color: palette.bgSurfaceLight,
      fontSize: 16,
      fontWeight: '700',
    },
  });
}
