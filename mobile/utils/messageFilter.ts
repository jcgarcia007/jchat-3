/**
 * JChat 3.0 — client-side filter for grave insults (ES/EN).
 *
 * Applied BEFORE sending in the venue chat, DMs and comments. It only blocks severe abuse (slurs, threats,
 * "kill yourself" style messages); common swear words and everyday words are NOT blocked, and matching is by whole
 * word so "class" or "Scunthorpe" never trip it. The server enforces the same idea in
 * supabase/migrations/pending/211_message_filter.sql so the filter cannot be skipped from a modified client.
 *
 * KEEP IDENTICAL to web/lib/messageFilter.ts (scripts/check-message-filter-sync.mjs compares them).
 * All terms are written already normalized: lower case, no accents, letters only.
 */

/** Single words (after normalization). */
const WORDS: readonly string[] = [
  // EN — slurs and degrading abuse
  'nigger', 'niggers', 'faggot', 'faggots', 'kike', 'kikes', 'spic', 'spics', 'chink', 'chinks', 'gook', 'gooks',
  'wetback', 'wetbacks', 'tranny', 'trannies', 'retard', 'retards', 'retarded', 'cunt', 'cunts',
  'motherfucker', 'motherfuckers', 'cocksucker', 'cocksuckers', 'whore', 'whores', 'slut', 'sluts', 'kys',
  // ES — insultos graves y discriminación
  'hdp', 'hijueputa', 'hijoeputa', 'hijodeputa', 'maricon', 'maricones', 'mongolico', 'mongolica', 'subnormal',
  'subnormales', 'sudaca', 'sudacas', 'matate', 'suicidate',
];

/** Phrases (words joined by single spaces, after normalization). */
const PHRASES: readonly string[] = [
  // EN
  'kill yourself', 'kill urself', 'go kill yourself', 'i will kill you', 'i am going to kill you', 'i will rape you',
  'i hope you die',
  // ES
  'hijo de puta', 'hijos de puta', 'hija de puta', 'la puta que te pario', 'retrasado mental', 'te voy a matar',
  'te voy a violar', 'ojala te mueras', 'negro de mierda', 'moro de mierda', 'maldito negro',
];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's' };

/** lower case, no accents, leetspeak undone, only a–z and single spaces, runs of 3+ equal letters collapsed. */
export function normalizeForFilter(input: string): string {
  const lowered = input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  let out = '';
  for (const ch of lowered) out += LEET[ch] ?? ch;
  out = out.replace(/(.)\1{2,}/g, '$1').replace(/[^a-z]+/g, ' ').trim();
  // "n i g g e r" → "nigger": glue runs of single letters (3 or more) into one word.
  const tokens = out.split(' ');
  const glued: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i].length === 1) {
      let j = i;
      while (j < tokens.length && tokens[j].length === 1) j += 1;
      if (j - i >= 3) {
        glued.push(tokens.slice(i, j).join(''));
        i = j - 1;
        continue;
      }
    }
    glued.push(tokens[i]);
  }
  return glued.join(' ');
}

const WORD_SET = new Set(WORDS);

export interface FilterResult {
  allowed: boolean;
  /** The normalized term that matched (for logs only — never show it to the user). */
  term?: string;
}

/** `allowed:false` when the text contains a grave insult/threat. Empty text is allowed. */
export function checkMessage(text: string): FilterResult {
  if (!text) return { allowed: true };
  const normalized = normalizeForFilter(text);
  if (!normalized) return { allowed: true };
  for (const word of normalized.split(' ')) {
    if (WORD_SET.has(word)) return { allowed: false, term: word };
  }
  const padded = ` ${normalized} `;
  for (const phrase of PHRASES) {
    if (padded.includes(` ${phrase} `)) return { allowed: false, term: phrase };
  }
  return { allowed: true };
}
