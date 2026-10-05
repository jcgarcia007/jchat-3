/**
 * "Table X" without duplicating the word: venues often name their tables "Mesa 3" / "Table 3" already,
 * so prefixing "Mesa"/"Table" again would read "Mesa Mesa 3". When the label already starts with
 * Mesa/Table it is shown as is; otherwise the caller's format adds the prefix.
 */

const TABLE_WORD = /^\s*(mesa|table)\b/i;

export function startsWithTableWord(label: string): boolean {
  return TABLE_WORD.test(label);
}

/** `format` builds the prefixed text (e.g. t("queueTableLabel", { label })); skipped if already prefixed. */
export function tableText(label: string, format: (label: string) => string): string {
  return startsWithTableWord(label) ? label.trim() : format(label.trim());
}
