/** Loads one chapter of one manual in one language (content/help/<locale>/<manual>/<slug>.ts). Null when the slug is not in the manual. */

import { CHAPTERS, isManualId } from './manuals';
import type { HelpChapter, HelpLocale } from './types';

export async function loadChapter(locale: HelpLocale, manual: string, slug: string): Promise<HelpChapter | null> {
  if (!isManualId(manual) || !CHAPTERS[manual].includes(slug)) return null;
  try {
    const mod = (await import(`./${locale}/${manual}/${slug}`)) as { default: HelpChapter };
    return mod.default;
  } catch {
    return null;
  }
}

/** Every chapter of a manual, in order, in one language (the index and the previous / next links). */
export async function loadManual(locale: HelpLocale, manual: string): Promise<HelpChapter[]> {
  if (!isManualId(manual)) return [];
  const chapters = await Promise.all(CHAPTERS[manual].map((slug) => loadChapter(locale, manual, slug)));
  return chapters.filter((c): c is HelpChapter => c !== null);
}
