// Price formatting — moved verbatim from MenuPageClient.

export function fmtPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
