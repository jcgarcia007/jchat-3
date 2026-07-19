/**
 * Tab / order money semantics — the ONE place the "open ≠ debt" rule lives.
 *
 * Extracted from the dashboard's TableDetailPanel so the waiter terminal reuses
 * the exact same labels and totals instead of reimplementing them (B6.3a). The
 * rule (D-55): a tab's "open" state does NOT mean unpaid — a CUSTOMER tap is
 * prepaid the moment they order, so an open customer tab is already settled.
 * Only an OPEN WAITER tap (postpay) is money still owed.
 *
 * Pure functions only — no React, no Supabase — so both the dashboard drawer and
 * the tablet terminal can import them.
 */

export type TabKind = "customer" | "waiter";
export type TabStatus = "open" | "paid" | "closed";

export const money = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" });
export const fmtCents = (cents: number) => money.format((cents ?? 0) / 100);

export function kindLabel(kind: TabKind): string {
  return kind === "customer" ? "Cliente" : "Mesero";
}

// Status meaning depends on the tab kind. "open" = still at the table, NOT debt.
export function tabStatusLabel(kind: TabKind, status: TabStatus): string {
  if (kind === "customer") {
    return status === "open" ? "Pagado · en mesa" : status === "paid" ? "Pagado" : "Cerrado";
  }
  return status === "open" ? "Por cobrar" : status === "paid" ? "Cobrado" : "Cerrado";
}

/** A tab is real debt only when a waiter created it (postpay) and it's still open. */
export function isTabDebt(t: { kind: TabKind; status: TabStatus }): boolean {
  return t.kind === "waiter" && t.status === "open";
}

/** Already collected: prepaid customer tabs (any state) + waiter tabs marked paid. */
export function isTabCollected(t: { kind: TabKind; status: TabStatus }): boolean {
  return t.kind === "customer" || (t.kind === "waiter" && t.status === "paid");
}

/** Best-effort flatten of an order_item's options jsonb into a short label. */
export function modifierLabels(options: unknown): string {
  if (!options || typeof options !== "object") return "";
  const labels: string[] = [];
  try {
    for (const v of Object.values(options as Record<string, unknown>)) {
      if (Array.isArray(v)) {
        for (const entry of v) {
          if (entry && typeof entry === "object" && "label" in entry) {
            const l = (entry as { label?: unknown }).label;
            if (typeof l === "string") labels.push(l);
          }
        }
      }
    }
  } catch {
    return "";
  }
  return labels.join(", ");
}
