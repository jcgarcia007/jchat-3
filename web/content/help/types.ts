/**
 * Help center content (Fase 6). Each chapter is DATA: one file per language and chapter, `content/help/<es|en>/<users|business>/<slug>.ts`,
 * `export default` of a `HelpChapter`. One template (components/help/HelpChapter.tsx) paints them. Plain data only: no JSX, no imports.
 *
 * Text (`text`, list and step items, titles) accepts a tiny inline markup, see lib/helpInline.ts:
 *   **bold**            names of buttons, menus and fields, copied letter by letter from the app / web translation files
 *   [label](/path)      a link: an internal path (/privacy, /help/users/safety#reporting, …) or https://… / mailto:…
 */

export type HelpLocale = 'es' | 'en';
export type HelpManualId = 'users' | 'business';
export type HelpPlatform = 'ios' | 'android' | 'web';

export interface HelpImage {
  type: 'image';
  /** Public path, e.g. `/help/users/getting-started/create-account-es.webp` (the file must exist: a test checks it). */
  src: string;
  /** Alternative text in THIS language. */
  alt: string;
  platform: HelpPlatform;
  width: number;
  height: number;
}

export type HelpBlock =
  | { type: 'p'; text: string }
  /** A numbered list: ONE action per step. */
  | { type: 'steps'; items: string[] }
  | { type: 'list'; items: string[] }
  /** `important` = something that can go wrong or cost the person; `tip` = a shortcut. */
  | { type: 'note'; kind: 'important' | 'tip'; text: string }
  | HelpImage;

export interface HelpSection {
  /** Anchor id, the same in both languages (`/help/users/<chapter>#<id>`). */
  id: string;
  title: string;
  blocks: HelpBlock[];
}

export interface HelpChapter {
  /** Same as the file name and the URL slug. */
  id: string;
  title: string;
  /** One line for the manual index and the page description. */
  summary: string;
  /** "What you will achieve": the opening line of the chapter. */
  goal: string;
  sections: HelpSection[];
}
