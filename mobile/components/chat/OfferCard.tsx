/**
 * JChat 3.0 — OfferCard (Task 2.6)
 *
 * In-chat card that surfaces a business offer inside the chat timeline or
 * as a pinned-message banner.
 *
 * Visual structure (top → bottom):
 *   ┌───────────────────────────────────────┐
 *   │  [Gradient header: brand → brandPurple]│
 *   │   Discount badge  |  countdown clock  │
 *   │   Title                               │
 *   │   Description (optional)              │
 *   ├───────────────────────────────────────┤
 *   │  Body area (bgSurface / theme.bg)     │
 *   │   Min-purchase note (optional)        │
 *   │   [Order now →]          [↗ Share]    │
 *   ├───────────────────────────────────────┤
 *   │  👑 Posted by Owner                   │
 *   └───────────────────────────────────────┘
 *
 * Notes:
 *   - Gradient uses palette.brand → palette.brandPurple (Design-System approved
 *     gradient stops). expo-linear-gradient is installed (v56).
 *   - Countdown updates every 30 s. Effect is cleaned up on unmount.
 *   - "Order now" calls the onOrderNow prop.
 *     TODO(Task 3.2): parent wires this to open menu filtered to the offer.
 *   - "Share" calls the onShare prop (or RN Share.share fallback).
 *   - Renders in both dark and light themes via useThemeColors().
 *     The gradient header stays branded regardless of theme.
 *   - Icons: @tabler/icons-react-native.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  IconCrown,
  IconShare,
  IconShoppingBag,
  IconTag,
} from '@tabler/icons-react-native';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import type { ThemeColors } from '../../theme/colors';
import type { ChatTheme } from '../../theme/chatThemes';
import type { OfferType } from './CreateOfferSheet';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Offer {
  id: string;
  title: string;
  discount: string | null;
  description: string | null;
  expires_at: string | null;
  type: OfferType | null;
  min_purchase_cents: number | null;
  /** Owner user id — used to show "Posted by Owner" tag. */
  created_by: string | null;
  business_id: string;
}

export interface OfferCardProps {
  offer: Offer;
  /** Chat-room theme (for body background tint). */
  theme: ChatTheme;
  /**
   * Called when the user taps "Order now".
   * TODO(Task 3.2): parent should open the menu filtered to this offer.
   */
  onOrderNow?: (offer: Offer) => void;
  /**
   * Optional custom share handler.
   * Falls back to RN Share.share with offer title + discount.
   */
  onShare?: (offer: Offer) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Format the remaining time until `expiresAt` as a compact string.
 * Returns null when the offer has already expired.
 */
function formatCountdown(expiresAt: string): string | null {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return null;

  const totalSecs = Math.floor(ms / 1000);
  const days  = Math.floor(totalSecs / 86400);
  const hours = Math.floor((totalSecs % 86400) / 3600);
  const mins  = Math.floor((totalSecs % 3600) / 60);
  const secs  = totalSecs % 60;

  if (days > 0)  return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0)  return `${mins}m ${secs}s`;
  return `${secs}s`;
}

// Returns an i18n key (resolved with t() at render) so this stays at module scope.
type OfferTypeKey =
  | 'offer.typeDiscount' | 'offer.typeBundle' | 'offer.typeHappyHour'
  | 'offer.typeFreeItem' | 'offer.typeGeneric';
function offerTypeLabelKey(type: OfferType | null): OfferTypeKey {
  switch (type) {
    case 'discount':   return 'offer.typeDiscount';
    case 'bundle':     return 'offer.typeBundle';
    case 'happy_hour': return 'offer.typeHappyHour';
    case 'free_item':  return 'offer.typeFreeItem';
    default:           return 'offer.typeGeneric';
  }
}

/** Returns just the formatted currency amount (e.g. "$5") or null. */
function formatMinPurchaseAmount(cents: number | null): string | null {
  if (!cents || cents <= 0) return null;
  const dollars = cents / 100;
  return `$${dollars % 1 === 0 ? dollars.toFixed(0) : dollars.toFixed(2)}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function OfferCard({
  offer,
  onOrderNow,
  onShare,
}: OfferCardProps) {
  const c = useThemeColors();
  const { t } = useTranslation('chat');
  const s = makeStyles(c);

  // ── Live countdown ──────────────────────────────────────────────────────────
  const [countdown, setCountdown] = useState<string | null>(
    offer.expires_at ? formatCountdown(offer.expires_at) : null,
  );
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!offer.expires_at) return;

    const tick = () => {
      const value = formatCountdown(offer.expires_at!);
      setCountdown(value);
      if (value === null && timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };

    tick();
    timerRef.current = setInterval(tick, 30_000);

    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [offer.expires_at]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleOrderNow = useCallback(() => {
    // TODO(Task 3.2): open menu filtered to offer
    onOrderNow?.(offer);
  }, [offer, onOrderNow]);

  const handleShare = useCallback(async () => {
    if (onShare) {
      onShare(offer);
      return;
    }
    // RN Share fallback
    const discount = offer.discount ? ` — ${offer.discount}` : '';
    await Share.share({
      message: `${offer.title}${discount}`,
      title: offer.title,
    });
  }, [offer, onShare]);

  // ── Expired state ───────────────────────────────────────────────────────────
  const isExpired = offer.expires_at !== null && countdown === null;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={[s.card, isExpired && s.cardExpired]}>

      {/* ── Gradient header ── */}
      <LinearGradient
        colors={[palette.brand, palette.brandPurple]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={s.gradientHeader}
      >
        {/* Type badge + countdown */}
        <View style={s.headerTopRow}>
          <View style={s.typeBadge}>
            <IconTag size={12} color={palette.brand} />
            <Text style={s.typeBadgeText}>
              {t(offerTypeLabelKey(offer.type))}
            </Text>
          </View>

          {offer.expires_at !== null && (
            <View style={s.countdownBadge}>
              <Text style={s.countdownText}>
                {isExpired
                  ? t('offer.expired')
                  : `⏱ ${countdown ?? '…'}`}
              </Text>
            </View>
          )}
        </View>

        {/* Discount amount */}
        {!!offer.discount && (
          <Text style={s.discountText}>{offer.discount}</Text>
        )}

        {/* Title */}
        <Text style={s.titleText} numberOfLines={2}>
          {offer.title}
        </Text>
      </LinearGradient>

      {/* ── Body ── */}
      <View style={s.body}>

        {/* Description */}
        {!!offer.description && (
          <Text style={s.descriptionText} numberOfLines={3}>
            {offer.description}
          </Text>
        )}

        {/* Min purchase note */}
        {!!formatMinPurchaseAmount(offer.min_purchase_cents) && (
          <Text style={s.minPurchaseText}>
            {t('offer.minPurchase', { amount: formatMinPurchaseAmount(offer.min_purchase_cents) })}
          </Text>
        )}

        {/* Action row: Order now + Share */}
        <View style={s.actionRow}>
          <Pressable
            onPress={handleOrderNow}
            disabled={isExpired}
            accessibilityRole="button"
            accessibilityLabel={t('offer.orderNow')}
            accessibilityState={{ disabled: isExpired }}
            style={({ pressed }) => [
              s.orderBtn,
              isExpired && s.orderBtnDisabled,
              pressed && !isExpired && s.orderBtnPressed,
            ]}
          >
            <IconShoppingBag size={15} color={c.bgSurface} style={{ marginRight: 6 }} />
            <Text style={s.orderBtnLabel}>{t('offer.orderNow')}</Text>
          </Pressable>

          <Pressable
            onPress={handleShare}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('offer.shareOffer')}
            style={({ pressed }) => [s.shareBtn, pressed && s.shareBtnPressed]}
          >
            <IconShare size={18} color={c.brand} />
          </Pressable>
        </View>
      </View>

      {/* ── Footer: Posted by Owner ── */}
      <View style={s.footer}>
        <IconCrown size={13} color={c.gold} />
        <Text style={s.footerText}>{t('offer.postedByOwner')}</Text>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    card: {
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: c.borderSubtle,
      backgroundColor: c.bgSurface,
      // Subtle elevation for in-chat context
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 6,
      elevation: 3,
      maxWidth: 340,
      alignSelf: 'flex-start',
    },
    cardExpired: {
      opacity: 0.55,
    },

    // ── Gradient header ──────────────────────────────────────────────────────
    gradientHeader: {
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 16,
      // brand → brandPurple gradient applied via LinearGradient colors prop
    },
    headerTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    typeBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(255,255,255,0.92)',
      borderRadius: 20,
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    typeBadgeText: {
      // Intentional: badge sits on white bg — use brand token, not hardcoded hex
      color: palette.brand,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.8,
    },
    countdownBadge: {
      backgroundColor: 'rgba(0,0,0,0.25)',
      borderRadius: 20,
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    countdownText: {
      color: '#ffffff',
      fontSize: 11,
      fontWeight: '700',
    },
    discountText: {
      color: '#ffffff',
      fontSize: 28,
      fontWeight: '900',
      letterSpacing: -0.5,
      marginBottom: 4,
    },
    titleText: {
      color: '#ffffff',
      fontSize: 15,
      fontWeight: '700',
      lineHeight: 20,
    },

    // ── Body ─────────────────────────────────────────────────────────────────
    body: {
      backgroundColor: c.bgSurface,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 12,
    },
    descriptionText: {
      color: c.textSecondary,
      fontSize: 13,
      lineHeight: 18,
      marginBottom: 8,
    },
    minPurchaseText: {
      color: c.textTertiary,
      fontSize: 12,
      marginBottom: 12,
    },
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    orderBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.brand,
      borderRadius: 10,
      paddingVertical: 10,
    },
    orderBtnDisabled: {
      opacity: 0.4,
    },
    orderBtnPressed: {
      opacity: 0.8,
    },
    orderBtnLabel: {
      color: c.bgSurface,
      fontSize: 14,
      fontWeight: '700',
    },
    shareBtn: {
      width: 40,
      height: 40,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: c.borderSubtle,
      alignItems: 'center',
      justifyContent: 'center',
    },
    shareBtnPressed: {
      backgroundColor: c.bgElevated,
    },

    // ── Footer ────────────────────────────────────────────────────────────────
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 16,
      paddingVertical: 9,
      borderTopWidth: 1,
      borderTopColor: c.borderSubtle,
      backgroundColor: c.bgElevated,
    },
    footerText: {
      color: c.textTertiary,
      fontSize: 11,
      fontWeight: '600',
    },
  });
}
