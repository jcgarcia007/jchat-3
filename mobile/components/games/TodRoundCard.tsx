/**
 * JChat 3.0 — Truth or Dare: the round card in the venue chat (message type 'tod_round').
 *
 * Title, category (color + icon + short description), "Cartas de JChat", who started it, the "Ronda oficial · <local>" seal,
 * a live countdown from metadata.expires_at, the Truth / Dare / Random buttons, "Juega cada 5 min" and the player count.
 * After the venue-wide cooldown the buttons turn into "Vuelve en 4:58". The creator sees "Cerrar" instead of the buttons.
 * A round that is no longer active (or whose time ran out) shows "Terminada" and the count only.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconStar } from '@tabler/icons-react-native';

import type { ChatTheme } from '../../theme/chatThemes';
import { palette } from '../../theme/tokens';
import { formatClock, parseRoundMeta, useTodCooldown, useTodNow } from '../../services/tod';
import type { TodChoice } from '../../services/tod';
import { TOD_CATEGORY_META } from './todCategories';
import { useTodChat } from './TodChatProvider';

interface Props {
  metadata: Record<string, unknown>;
  theme: ChatTheme;
  /** The viewer started this round. */
  isOwn: boolean;
  creatorName: string;
}

const CHOICES: TodChoice[] = ['truth', 'dare', 'random'];

export function TodRoundCard({ metadata, theme, isOwn, creatorName }: Props) {
  const { t } = useTranslation('tod');
  const game = useTodChat();
  const cooldown = useTodCooldown(game.businessId);
  const meta = parseRoundMeta(metadata);
  const running = meta?.status === 'active';
  const now = useTodNow(running);
  if (!meta) return null;

  const cat = TOD_CATEGORY_META[meta.category];
  const remaining = Math.max(0, Math.ceil((Date.parse(meta.expires_at) - now) / 1000));
  const active = running && remaining > 0;
  const categoryName = t(`category.${meta.category}.name`);

  return (
    <View
      style={[styles.card, { backgroundColor: theme.bubbleInBg, borderColor: cat.color }]}
      accessibilityLabel={`${t('title')}. ${categoryName}`}
    >
      <View style={[styles.band, { backgroundColor: cat.color }]}>
        <cat.Icon size={18} color={cat.onColor} />
        <Text style={[styles.bandTitle, { color: cat.onColor }]} accessibilityRole="header">
          {t('title')}
        </Text>
      </View>

      {meta.official ? (
        <View style={[styles.seal, { backgroundColor: palette.gold }]}>
          <IconStar size={14} color={palette.onBrand} />
          <Text style={styles.sealText}>{t('official', { business: game.businessName })}</Text>
        </View>
      ) : null}

      <View style={styles.body}>
        <View style={styles.categoryRow}>
          <View style={[styles.categoryIcon, { backgroundColor: cat.color }]}>
            <cat.Icon size={28} color={cat.onColor} />
          </View>
          <View style={styles.categoryText}>
            <Text style={[styles.categoryName, { color: theme.bubbleInText }]}>{categoryName}</Text>
            <Text style={[styles.categoryDesc, { color: theme.tabInactive }]}>{t(`category.${meta.category}.desc`)}</Text>
          </View>
        </View>

        <Text style={[styles.meta, { color: theme.tabInactive }]}>
          {t('fromJChat')} · {t('startedBy', { name: creatorName })}
        </Text>

        {active ? (
          <Text style={[styles.timer, { color: theme.bubbleInText }]}>
            {t('timeLeft', { time: formatClock(remaining) })}
          </Text>
        ) : (
          <Text style={[styles.ended, { color: theme.tabInactive }]}>{t('ended')}</Text>
        )}

        {active && isOwn ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('closeA11y')}
            disabled={game.busy}
            onPress={() => game.closeRound(meta.round_id)}
            style={[styles.closeBtn, { borderColor: cat.color, opacity: game.busy ? 0.5 : 1 }]}
          >
            <Text style={[styles.closeText, { color: theme.bubbleInText }]}>{t('close')}</Text>
          </Pressable>
        ) : null}

        {active && !isOwn ? (
          cooldown > 0 ? (
            <View
              style={[styles.cooldown, { borderColor: theme.border }]}
              accessible
              accessibilityRole="text"
              accessibilityLabel={t('cooldownBtn', { time: formatClock(cooldown) })}
            >
              <Text style={[styles.cooldownText, { color: theme.tabInactive }]}>
                {t('cooldownBtn', { time: formatClock(cooldown) })}
              </Text>
            </View>
          ) : (
            <View style={styles.choices}>
              {CHOICES.map((choice) => (
                <Pressable
                  key={choice}
                  accessibilityRole="button"
                  accessibilityLabel={t('playA11y', { choice: t(`choice.${choice}`), category: categoryName })}
                  accessibilityState={{ disabled: game.busy }}
                  disabled={game.busy}
                  onPress={() => game.play(meta.round_id, choice, meta.category)}
                  style={[styles.choiceBtn, { backgroundColor: cat.color, opacity: game.busy ? 0.6 : 1 }]}
                >
                  <Text style={[styles.choiceText, { color: cat.onColor }]} numberOfLines={1}>
                    {t(`choice.${choice}`)}
                    {choice === 'random' ? ' 🎲' : ''}
                  </Text>
                </Pressable>
              ))}
            </View>
          )
        ) : null}

        <Text style={[styles.footer, { color: theme.tabInactive }]}>
          {active ? `${t('playEvery')} · ` : ''}
          {t('played', { count: meta.plays })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: 300, maxWidth: '100%', borderRadius: 18, borderWidth: 2, overflow: 'hidden' },
  band: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 8 },
  bandTitle: { fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },
  seal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: 8 },
  sealText: { color: palette.onBrand, fontSize: 12, fontWeight: '800' },
  body: { padding: 14, gap: 10 },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  categoryIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  categoryText: { flex: 1, gap: 2 },
  categoryName: { fontSize: 22, fontWeight: '900' },
  categoryDesc: { fontSize: 13 },
  meta: { fontSize: 12 },
  timer: { fontSize: 15, fontWeight: '800' },
  ended: { fontSize: 15, fontWeight: '800' },
  choices: { flexDirection: 'row', gap: 8 },
  choiceBtn: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  choiceText: { fontSize: 14, fontWeight: '800' },
  cooldown: { minHeight: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cooldownText: { fontSize: 15, fontWeight: '700' },
  closeBtn: { minHeight: 44, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 15, fontWeight: '700' },
  footer: { fontSize: 12 },
});
