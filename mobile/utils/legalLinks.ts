/**
 * Legal / support pages of jchat.cloud (privacy, terms, safety, contact, support). The site picks its language from the browser, so
 * the app passes its own: `?lang=es` or `?lang=en` (anything that is not Spanish is English, as in the rest of the app).
 */
export type LegalPage = 'privacy' | 'terms' | 'safety' | 'contact' | 'support';

const LEGAL_BASE_URL = 'https://jchat.cloud';

export function legalUrl(page: LegalPage, language: string | null | undefined): string {
  const lang = language?.toLowerCase().startsWith('es') ? 'es' : 'en';
  return `${LEGAL_BASE_URL}/${page}?lang=${lang}`;
}
