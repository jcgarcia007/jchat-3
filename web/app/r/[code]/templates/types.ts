/**
 * Shared contract for all receipt templates.
 * The dispatcher (ReceiptView.tsx) resolves brand colors once and passes
 * them as props — individual templates never call receiptColor helpers.
 */
import type { PublicReceipt } from "../page";

export interface ReceiptTemplateProps {
  receipt:     PublicReceipt;
  brandColor:  string; // resolved via brandColorOrDefault()
  brandText:   string; // textOn(brandColor) — for text/icons ON the brand band
  accentColor: string; // accentOnWhite(brandColor) — for accents ON white bg
  code:        string; // receipt code, used by ReceiptPdfButton
}
