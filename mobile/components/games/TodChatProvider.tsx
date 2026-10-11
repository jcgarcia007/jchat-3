/**
 * JChat 3.0 — Truth or Dare: chat-side game controller.
 *
 * Wraps the venue chat. The round cards and results (rendered by MessageBubble) call `useTodChat()` instead of receiving
 * callbacks through the bubble: play (welcome → tod_draw → private card), close a round, applaud. It also owns the welcome
 * flow, the private card modal and the venue-wide cooldown. The server decides everything; this only shows the answers.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  TOD_COOLDOWN_SECONDS,
  applaudTod,
  closeTodRound,
  decideTod,
  drawTod,
  resetTodTermsCache,
  setTodCooldown,
  syncTodCards,
  todLocale,
  todReasonKey,
} from '../../services/tod';
import type { TodCategory, TodChoice, TodDrawOk } from '../../services/tod';
import { TodCardModal } from './TodCardModal';
import { useTodOnboarding } from './TodWelcome';
import { showAlert } from '../../utils/dialog';

export interface TodChatValue {
  businessId: string | null;
  businessName: string;
  userId: string | null;
  /** A draw / close is in flight (the card buttons dim). */
  busy: boolean;
  play: (roundId: string, choice: TodChoice, category: TodCategory) => void;
  closeRound: (roundId: string) => void;
  /** New applause count, or null when the server refused. */
  applaud: (drawId: string) => Promise<number | null>;
}

const noop = () => undefined;
const TodChatContext = createContext<TodChatValue>({
  businessId: null,
  businessName: '',
  userId: null,
  busy: false,
  play: noop,
  closeRound: noop,
  applaud: async () => null,
});

export const useTodChat = (): TodChatValue => useContext(TodChatContext);

interface ProviderProps {
  businessId: string | null;
  businessName: string;
  userId: string | null;
  /** The game is active at this venue (and the user did not turn games off): syncs the card cache. */
  enabled: boolean;
  children: React.ReactNode;
}

interface OpenDraw {
  draw: TodDrawOk;
  category: TodCategory;
}

export function TodChatProvider({ businessId, businessName, userId, enabled, children }: ProviderProps) {
  const { t, i18n } = useTranslation('tod');
  const locale = todLocale(i18n.language);
  const onboarding = useTodOnboarding();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<OpenDraw | null>(null);
  const busyRef = useRef(false);

  // Bring the cards of the user's language (only what changed since the last sync).
  useEffect(() => {
    if (enabled) void syncTodCards(locale);
  }, [enabled, locale]);

  const showReason = useCallback(
    (reason: string) => {
      showAlert(t('title'), t(todReasonKey(reason)));
    },
    [t],
  );

  const play = useCallback(
    (roundId: string, choice: TodChoice, category: TodCategory) => {
      if (busyRef.current || !businessId) return;
      busyRef.current = true;
      setBusy(true);
      void (async () => {
        try {
          if (!(await onboarding.ensure())) return;
          const res = await drawTod(roundId, choice);
          if (res.status === 'denied') {
            if (res.reason === 'terms_required') resetTodTermsCache();
            showReason(res.reason);
          } else if (res.status === 'cooldown') {
            setTodCooldown(businessId, res.seconds); // the server is the truth
          } else {
            // 'ok' = a new card (the venue cooldown starts now); 'pending' = a card was already drawn and not decided: show that one.
            if (res.status === 'ok') setTodCooldown(businessId, TOD_COOLDOWN_SECONDS);
            setOpen({ draw: res, category });
          }
        } finally {
          busyRef.current = false;
          setBusy(false);
        }
      })();
    },
    [businessId, onboarding, showReason],
  );

  const closeRound = useCallback(
    (roundId: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      void closeTodRound(roundId)
        .then((res) => {
          if (res.status === 'denied') showReason(res.reason);
        })
        .finally(() => {
          busyRef.current = false;
          setBusy(false);
        });
    },
    [showReason],
  );

  const applaud = useCallback(
    async (drawId: string): Promise<number | null> => {
      const res = await applaudTod(drawId);
      if (res.status === 'ok') return res.applause;
      if (res.status === 'denied') showReason(res.reason);
      return null;
    },
    [showReason],
  );

  const decide = useCallback(
    async (publish: boolean): Promise<boolean> => {
      if (!open) return true;
      const res = await decideTod(open.draw.draw_id, publish);
      if (res.status === 'ok') return true;
      showReason(res.reason);
      // The card cannot be used any more → close it. Other refusals (not in the venue, no network) keep it open to retry or pass.
      return res.reason === 'already_decided' || res.reason === 'not_found' || res.reason === 'draw_expired';
    },
    [open, showReason],
  );

  const value = useMemo<TodChatValue>(
    () => ({ businessId, businessName, userId, busy, play, closeRound, applaud }),
    [businessId, businessName, userId, busy, play, closeRound, applaud],
  );

  return (
    <TodChatContext.Provider value={value}>
      {children}
      {onboarding.element}
      {open ? (
        <TodCardModal
          key={open.draw.draw_id}
          draw={open.draw}
          fallbackCategory={open.category}
          onDecide={decide}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </TodChatContext.Provider>
  );
}
