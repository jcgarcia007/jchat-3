/**
 * JChat 3.0 — Login "boleto" tokens.
 *
 * The login is fixed artwork (approved design): it does NOT follow light/dark mode, so these
 * values are theme-independent. Components must use these names, never hex literals.
 */

export const ticket = {
  /** Screen background below the photo. */
  ticketBg: '#0A0E1C',
  /** The paper of the ticket. */
  ticketPaper: '#F3EFE7',
  /** Primary text on the paper (title, labels). */
  ticketInk: '#14110F',
  /** Secondary text on the paper (subtitle, hints) — ≥ 4.5:1 on ticketPaper. */
  ticketInkMuted: '#5A554C',
  /** Dotted perforation line and its notches' outline. */
  ticketPerforation: '#B9B1A1',
  /** Accent used by the logo "J", the title dot and links. */
  brandAccent: '#4263EB',
  /** Main call-to-action button. */
  ticketButton: '#3B5BDB',
  ticketButtonText: '#FFFFFF',
  /** Apple / Google buttons and input fields on the paper. */
  ticketField: '#FFFFFF',
  ticketFieldBorder: '#CFC8B8',
  /** ES · EN pill over the photo. */
  ticketPillBg: 'rgba(10,14,28,0.62)',
  ticketPillBorder: 'rgba(255,255,255,0.35)',
  ticketPillText: '#FFFFFF',
  ticketPillActiveBg: '#FFFFFF',
  ticketPillActiveText: '#0A0E1C',
  /** Shadow under the ticket. */
  ticketShadow: '#000000',
  /** Soft scrim at the bottom of the photo so the ticket edge reads against it. */
  ticketPhotoFade: 'rgba(10,14,28,0)',
  /** Error text on the paper (≥ 4.5:1). */
  ticketError: '#B3261E',
} as const;

export type TicketToken = keyof typeof ticket;
