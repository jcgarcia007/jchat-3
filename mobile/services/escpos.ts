/**
 * JChat 3.0 — ESC/POS byte generator
 *
 * Builds a Uint8Array ticket from the JSON returned by get_public_receipt().
 * Designed for standard 80mm and 58mm thermal printers at 203 DPI, Font A.
 *
 * Column widths (Font A, 203 DPI — industry standard):
 *   80 mm → 48 columns
 *   58 mm → 32 columns
 *
 * ESC/POS references used:
 *   ESC @      (1B 40)        — Printer reset
 *   ESC a n    (1B 61 n)      — Alignment: 0=left 1=center 2=right
 *   ESC E n    (1B 45 n)      — Bold: 0=off 1=on
 *   GS ! n     (1D 21 n)      — Char size: 0x00=normal 0x11=2x height+width
 *   LF         (0A)           — Line feed / print
 *   ESC J n    (1B 4A n)      — Feed n dot lines (1 dot ≈ 0.125 mm)
 *   GS V n     (1D 56 00)     — Paper cut (full)
 *   GS ( k     (1D 28 6B ...) — QR code commands (model 2, size 3, level L)
 */

// ─── Public receipt shape (from get_public_receipt RPC) ───────────────────────

export interface PublicReceiptItem {
  name: string;
  qty: number;
  price_cents: number;
  options?: Array<{ name?: string; value?: string } | string> | null;
  special_instructions?: string | null;
}

export interface PublicReceipt {
  business: {
    name: string;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    phone?: string | null;
  };
  payment: {
    amount_cents: number;
    subtotal_cents: number;
    tax_cents: number;
    tip_cents: number;
    card_brand?: string | null;
    card_last4?: string | null;
    created_at: string;
  };
  table_label?: string | null;
  items: PublicReceiptItem[];
}

// ─── Low-level ESC/POS primitives ────────────────────────────────────────────

const ESC = 0x1B;
const GS  = 0x1D;
const LF  = 0x0A;

function bytes(...vals: number[]): Uint8Array { return new Uint8Array(vals); }
function lf(): Uint8Array { return bytes(LF); }
function reset(): Uint8Array { return bytes(ESC, 0x40); }
function cut(): Uint8Array { return bytes(GS, 0x56, 0x00); }
function feed(dots: number): Uint8Array { return bytes(ESC, 0x4A, dots & 0xFF); }
function align(a: 'left' | 'center' | 'right'): Uint8Array {
  return bytes(ESC, 0x61, a === 'left' ? 0 : a === 'center' ? 1 : 2);
}
function bold(on: boolean): Uint8Array { return bytes(ESC, 0x45, on ? 1 : 0); }
function doubleSize(on: boolean): Uint8Array { return bytes(GS, 0x21, on ? 0x11 : 0x00); }

/**
 * Encode a string to ESC/POS code page 0 (PC437 / IBM437).
 * Diacritics are transliterated to their ASCII base for compatibility —
 * thermal printers vary widely in their code page support and this is the
 * most portable approach for Spanish menu names on a receipt.
 */
function enc(s: string): Uint8Array {
  const normalized = s
    .normalize('NFD')                        // decompose accented chars
    .replace(/[̀-ͯ]/g, '')         // strip combining diacritics
    .replace(/[^\x00-\xFF]/g, '?');          // replace remaining non-latin1
  const out = new Uint8Array(normalized.length);
  for (let i = 0; i < normalized.length; i++) {
    out[i] = normalized.charCodeAt(i) & 0xFF;
  }
  return out;
}

/** Concatenate an arbitrary number of Uint8Arrays. */
function concat(...parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) { out.set(p, offset); offset += p.length; }
  return out;
}

// ─── Layout helpers ──────────────────────────────────────────────────────────

const PRICE_COL = 8; // "$XXX.XX" — enough for any reasonable price

/** Format cents as "$X.XX" (right-justified in PRICE_COL chars). */
function fmtPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`.padStart(PRICE_COL);
}

/** Format cents as "$X.XX" left-aligned (for sub-totals label+value pair). */
function fmtPriceRaw(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Two-column line: left text + right text that together fill `cols` characters.
 * Truncates left text if it would overflow.
 */
function twoCol(left: string, right: string, cols: number): string {
  const rightLen = right.length;
  const maxLeft  = cols - rightLen - 1;
  const l = left.length > maxLeft ? left.slice(0, maxLeft) : left.padEnd(maxLeft);
  return l + ' ' + right;
}

/** Left label + right value in `cols` columns. */
function labelValue(label: string, value: string, cols: number): string {
  return twoCol(label, value, cols);
}

/** Separator line of dashes filling `cols` columns. */
function separator(cols: number): string { return '-'.repeat(cols); }

// ─── QR code command builder ──────────────────────────────────────────────────

/**
 * Build the ESC/POS QR code command sequence for a given URL.
 * Uses QR Model 2, module size 3, error correction L.
 * Silently omitted by printers that don't support GS(k — receipt remains valid.
 */
function buildQR(url: string): Uint8Array {
  const data = enc(url);
  const dataLen = data.length + 3; // +3 for cn, fn, m bytes in store cmd
  const pL = dataLen & 0xFF;
  const pH = (dataLen >> 8) & 0xFF;

  return concat(
    // Set model: model 2
    bytes(GS, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00),
    // Set module size (3 = ~3mm per cell, readable at arm's length)
    bytes(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x03),
    // Set error correction level: L
    bytes(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x4C),
    // Store data
    bytes(GS, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30),
    data,
    // Print stored QR
    bytes(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30),
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a complete ESC/POS receipt buffer from a get_public_receipt() response.
 *
 * @param receipt    — JSON returned by the Supabase RPC
 * @param receiptCode — the short code used in the QR URL (e.g. "ABCD12")
 * @param widthMm    — paper width in mm; only 80 and 58 are tested
 * @returns Uint8Array ready to write to a TCP socket on port 9100
 */
export function buildReceiptEscPos(
  receipt: PublicReceipt,
  receiptCode: string,
  widthMm: number = 80,
): Uint8Array {
  const cols = widthMm <= 58 ? 32 : 48;
  const biz  = receipt.business;
  const pay  = receipt.payment;

  // ── Date ────────────────────────────────────────────────────────────────────
  const date = pay.created_at
    ? new Date(pay.created_at).toLocaleDateString('en-US', {
        year: 'numeric', month: '2-digit', day: '2-digit',
      })
    : '';

  // ── Business header ─────────────────────────────────────────────────────────
  const header: Uint8Array[] = [
    reset(),
    align('center'),
    doubleSize(true), bold(true),
    enc(biz.name), lf(),
    doubleSize(false), bold(false),
  ];
  if (biz.address) { header.push(enc(biz.address), lf()); }
  const cityLine = [biz.city, biz.state].filter(Boolean).join(', ');
  if (cityLine) { header.push(enc(cityLine), lf()); }
  if (biz.phone) { header.push(enc(biz.phone), lf()); }
  header.push(lf());

  // ── Order info ──────────────────────────────────────────────────────────────
  const tableLabel = receipt.table_label ?? '';
  const shortCode  = receiptCode.toUpperCase().slice(0, 8);

  const orderInfo: Uint8Array[] = [
    align('left'),
    enc(separator(cols)), lf(),
  ];
  if (tableLabel) {
    orderInfo.push(enc(twoCol(tableLabel, date, cols)), lf());
  } else {
    orderInfo.push(enc(date.padEnd(cols)), lf());
  }
  orderInfo.push(enc(`Recibo: #${shortCode}`), lf());
  orderInfo.push(enc(separator(cols)), lf());

  // ── Items ───────────────────────────────────────────────────────────────────
  const items: Uint8Array[] = [];
  for (const item of receipt.items) {
    // Main line: "2x Tacos al Pastor    $12.00"
    const namePart = `${item.qty}x ${item.name}`;
    const price    = fmtPrice(item.price_cents * item.qty);
    items.push(enc(twoCol(namePart, price, cols)), lf());

    // Options (modifiers)
    if (Array.isArray(item.options)) {
      for (const opt of item.options) {
        const optText = typeof opt === 'string'
          ? opt
          : [opt.name, opt.value].filter(Boolean).join(': ');
        if (optText) {
          items.push(enc(`  + ${optText}`.slice(0, cols)), lf());
        }
      }
    }

    // Special instructions
    if (item.special_instructions) {
      items.push(enc(`  * ${item.special_instructions}`.slice(0, cols)), lf());
    }
  }

  // ── Totals ──────────────────────────────────────────────────────────────────
  // Mirror the digital receipt (Modern.tsx) exactly:
  //   Subtotal — always visible (same as digital)
  //   Impuesto — always visible (same as digital)
  //   Propina  — only when > 0 (digital hides it at 0 too)
  //   TOTAL    = amount_cents (base) + tip_cents — matches what was charged
  //
  // NOTE: subtotal_cents from get_public_receipt may appear larger than
  // amount_cents (e.g. 11100 vs 1800) in some real receipts — this is a
  // data question in get_public_receipt, not fixed here. Both printed and
  // digital receipts read the same source, so they will always match.
  const grandTotal = pay.amount_cents + pay.tip_cents;

  const totals: Uint8Array[] = [
    enc(separator(cols)), lf(),
  ];

  // Subtotal — always (mirrors digital)
  totals.push(enc(labelValue('Subtotal', fmtPriceRaw(pay.subtotal_cents), cols)), lf());
  // Impuesto — always (mirrors digital)
  totals.push(enc(labelValue('Impuesto', fmtPriceRaw(pay.tax_cents), cols)), lf());
  // Propina — only when charged (mirrors digital)
  if (pay.tip_cents > 0) {
    totals.push(enc(labelValue('Propina', fmtPriceRaw(pay.tip_cents), cols)), lf());
  }

  // TOTAL in double size + bold — grandTotal = base + propina
  totals.push(
    doubleSize(true), bold(true),
    enc(labelValue('TOTAL', fmtPriceRaw(grandTotal), cols)), lf(),
    doubleSize(false), bold(false),
    enc(separator(cols)), lf(),
  );

  // ── Payment confirmation ─────────────────────────────────────────────────────
  const confirmation: Uint8Array[] = [
    align('center'),
    bold(true),
    enc('PAGADO'), lf(),
    bold(false),
  ];

  if (pay.card_brand && pay.card_last4) {
    const cardLine = `${pay.card_brand.toUpperCase()} **** ${pay.card_last4}`;
    confirmation.push(enc(cardLine), lf());
  }

  confirmation.push(lf());

  // ── QR code ─────────────────────────────────────────────────────────────────
  const receiptUrl = `https://jchat.cloud/r/${receiptCode}`;
  const qr: Uint8Array[] = [
    buildQR(receiptUrl),
    lf(),
    enc('Escanea para ver tu recibo digital'), lf(),
    enc(receiptUrl.slice(0, cols)), lf(),
    lf(),
  ];

  // ── Footer ──────────────────────────────────────────────────────────────────
  const footer: Uint8Array[] = [
    enc('Gracias por su visita'), lf(),
    enc('jchat.cloud'), lf(),
    lf(),
    feed(40),   // ~5mm blank space before cut
    cut(),
  ];

  return concat(
    ...header,
    ...orderInfo,
    ...items,
    ...totals,
    ...confirmation,
    ...qr,
    ...footer,
  );
}
