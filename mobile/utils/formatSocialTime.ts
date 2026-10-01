import type { TFunction } from 'i18next';

/** Hermes-safe relative time for conversation and notification timestamps. */
export function formatSocialTime(
  iso: string | null,
  language: string,
  translate: TFunction<'social'>,
): string {
  if (!iso) return '';

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);

  const elapsedMs = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 1) return translate('messages.time.now');
  if (minutes < 60) return translate('messages.time.minutes', { count: minutes });

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return translate('messages.time.hours', { count: hours });

  const days = Math.floor(hours / 24);
  if (days <= 7) return translate('messages.time.days', { count: days });

  try {
    return new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short' }).format(date);
  } catch {
    return iso.slice(0, 10);
  }
}
