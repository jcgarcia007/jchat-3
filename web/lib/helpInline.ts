/**
 * Inline markup of the help center texts (content/help/types.ts): `**bold**` and `[label](target)`. Pure, no imports: runs in Node tests.
 * Nothing else is interpreted (no HTML), so a text can never inject markup; the template paints each segment as a React node.
 */

export type InlineSegment =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'link'; text: string; href: string; external: boolean };

const TOKEN = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

/** A link target that may be written in a text: an internal absolute path, or https:// / mailto:. */
export function isAllowedHref(href: string): boolean {
  return /^\/(?!\/)[A-Za-z0-9/_\-#?=&.%]*$/.test(href) || /^https:\/\/[^\s]+$/.test(href) || /^mailto:[^\s@]+@[^\s@]+$/.test(href);
}

export function parseInline(input: string): InlineSegment[] {
  const out: InlineSegment[] = [];
  let last = 0;
  for (const match of input.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) out.push({ type: 'text', text: input.slice(last, index) });
    if (match[1] !== undefined) {
      out.push({ type: 'bold', text: match[1] });
    } else if (isAllowedHref(match[3])) {
      out.push({ type: 'link', text: match[2], href: match[3], external: !match[3].startsWith('/') });
    } else {
      out.push({ type: 'text', text: match[0] }); // a target that is not allowed stays plain text
    }
    last = index + match[0].length;
  }
  if (last < input.length) out.push({ type: 'text', text: input.slice(last) });
  return out;
}

/** Every link target written in a text (for the link-check test). */
export function linkTargets(input: string): string[] {
  return parseInline(input).flatMap((s) => (s.type === 'link' ? [s.href] : []));
}

/** The text without markup (for the page description and the plain-text checks). */
export function stripInline(input: string): string {
  return parseInline(input)
    .map((s) => s.text)
    .join('');
}
