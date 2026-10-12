/**
 * JChat 3.0 — what the DM inbox shows as the preview of a conversation's last message (pure).
 * dm_messages has no `type` column: a photo has media_url, a voice note has voice_url, a gift card has
 * gift_offer_id; their `body` is null, which used to make the inbox say "Aún no hay mensajes".
 */

export type DmPreviewKind = 'voice' | 'photo' | 'gift' | 'text' | 'none';

export interface DmPreviewSource {
  body?: string | null;
  media_url?: string | null;
  voice_url?: string | null;
  gift_offer_id?: string | null;
}

export function dmPreviewKind(message: DmPreviewSource | null | undefined): DmPreviewKind {
  if (!message) return 'none';
  if (message.voice_url) return 'voice';
  if (message.media_url) return 'photo';
  if (message.gift_offer_id) return 'gift';
  return message.body && message.body.trim().length > 0 ? 'text' : 'none';
}
