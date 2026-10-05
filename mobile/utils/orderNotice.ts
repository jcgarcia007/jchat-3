/**
 * Order notices (migration 200): service_calls with type='order' created by order_notify_staff.
 * notes = "#<order_number> · <on_my_way|arrived|question>[ · <text>]". Parsing is defensive: anything
 * that doesn't match yields kind=null and the raw notes as text (same rules as the web dashboard).
 */

export type OrderNoticeKind = 'on_my_way' | 'arrived' | 'question';

export interface ParsedOrderNotice {
  orderNumber: string | null;
  kind: OrderNoticeKind | null;
  text: string | null;
}

const NOTICE_RE = /^\s*#?\s*(\d+)\s*[·|-]\s*(on_my_way|arrived|question)\s*(?:[·|-]\s*([\s\S]*))?$/i;

export function parseOrderNotice(notes: string | null | undefined): ParsedOrderNotice {
  const m = notes ? NOTICE_RE.exec(notes) : null;
  if (!m) return { orderNumber: null, kind: null, text: notes?.trim() || null };
  return {
    orderNumber: m[1] ?? null,
    kind: (m[2] ?? '').toLowerCase() as OrderNoticeKind,
    text: m[3]?.trim() || null,
  };
}
