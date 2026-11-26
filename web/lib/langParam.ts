/** `?lang=es|en` of a URL: only those two values count; anything else is ignored. */
export type LangParam = 'es' | 'en';

export const LANG_COOKIE = 'jchat-lang';
export const LANG_COOKIE_MAX_AGE = 31536000;

export function parseLangParam(value: string | null | undefined): LangParam | null {
  return value === 'es' || value === 'en' ? value : null;
}
