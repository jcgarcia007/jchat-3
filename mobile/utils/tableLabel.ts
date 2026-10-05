/**
 * "Table X" without duplicating the word: venues often name their tables "Mesa 3" / "Table 3"
 * already, so prefixing again would read "Mesa Mesa 3". If the label starts with Mesa/Table it is
 * shown as is; otherwise `format` adds the prefix.
 */

const TABLE_WORD = /^\s*(mesa|table)\b/i;

export function startsWithTableWord(label: string): boolean {
  return TABLE_WORD.test(label);
}

export function tableText(label: string, format: (label: string) => string): string {
  return startsWithTableWord(label) ? label.trim() : format(label.trim());
}
