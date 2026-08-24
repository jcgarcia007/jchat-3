/**
 * ReceiptView — dispatcher.
 *
 * Resolves brand colors ONCE and routes to the correct template component
 * based on business.receipt_template_id. Falls back to "modern" for any
 * unknown or missing template id (safe default).
 *
 * DESIGN RULE: This is a public page — NO theme tokens (var(--...)).
 * Templates use hardcoded hex from shared/C + colorScheme:"light" on root.
 */

import type { PublicReceipt } from "./page";
import { brandColorOrDefault, textOn, accentOnWhite } from "@/lib/receiptColor";
import { ReceiptNotFound } from "./templates/shared";
import ModernReceipt  from "./templates/Modern";
import TicketReceipt  from "./templates/Ticket";
import MinimalReceipt from "./templates/Minimal";
import ElegantReceipt from "./templates/Elegant";

interface Props {
  receipt: PublicReceipt | null;
  code:    string;
}

export default function ReceiptView({ receipt, code }: Props) {
  if (!receipt) return <ReceiptNotFound />;

  // Brand color — computed ONCE here; templates receive ready-to-use values
  const brandColor  = brandColorOrDefault(receipt.business.receipt_brand_color);
  const brandText   = textOn(brandColor);      // for text ON brandColor bg
  const accentColor = accentOnWhite(brandColor); // for accents ON white bg

  const props = { receipt, brandColor, brandText, accentColor, code };

  const templateId = receipt.business.receipt_template_id ?? "modern";

  switch (templateId) {
    case "ticket":  return <TicketReceipt  {...props} />;
    case "minimal": return <MinimalReceipt {...props} />;
    case "elegant": return <ElegantReceipt {...props} />;
    default:        return <ModernReceipt  {...props} />; // "modern" + safe fallback
  }
}
