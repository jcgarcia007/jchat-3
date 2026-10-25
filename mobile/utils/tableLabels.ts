/**
 * JChat 3.0 — table labels of a venue ("T1", "Mesa 5"...), pure helpers for the gift accept sheet.
 *
 * sortTableLabels mirrors the ordering of the server function venue_table_labels (migration 241), so the list reads the same
 * even if it ever arrives unsorted: first the number the label contains (the first 9 digits of its first run of digits), then the
 * text. T1, T2, ..., T9, T10 — not T1, T10, T2. Labels with no number go last.
 */

const FIRST_NUMBER = /\d{1,9}/;
const PREFIX = /^(mesa|table|t)\s*/;

function numberOf(label: string): number {
  const m = FIRST_NUMBER.exec(label);
  return m ? Number(m[0]) : Number.POSITIVE_INFINITY;
}

/** Natural order, without mutating the input. */
export function sortTableLabels(labels: readonly string[]): string[] {
  return [...labels].sort((a, b) => {
    const na = numberOf(a);
    const nb = numberOf(b);
    if (na !== nb) return na < nb ? -1 : 1; // (Infinity === Infinity: two labels without a number fall through to the text)
    const la = a.toLowerCase();
    const lb = b.toLowerCase();
    if (la !== lb) return la < lb ? -1 : 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

/** "7", "T7", "t 7", "mesa 7" and "Table7" all name the same table: drop a mesa / table / t prefix (the server does the same). */
export function normalizeTableLabel(label: string): string {
  return label.trim().toLowerCase().replace(PREFIX, '');
}

/**
 * The table to preselect: the only one when the venue has one, else the table the person entered through (the session's table
 * label) when it is in the list. null = nothing to preselect.
 */
export function defaultTableLabel(labels: readonly string[], sessionLabel?: string | null): string | null {
  if (labels.length === 1) return labels[0];
  const raw = sessionLabel?.trim().toLowerCase() ?? '';
  if (!raw) return null;
  return labels.find((l) => l.trim().toLowerCase() === raw) ?? labels.find((l) => normalizeTableLabel(l) === normalizeTableLabel(raw)) ?? null;
}
