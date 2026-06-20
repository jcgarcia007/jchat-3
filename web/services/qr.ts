/**
 * JChat 3.0 — QR Code Service (Task 2.8)
 *
 * Generates QR codes for room deep-links. All generation is done in the
 * browser via the `qrcode` npm package.
 *
 * Color notes
 * ───────────
 * The QR library (`qrcode`) requires literal color strings (hex or rgba) in
 * its options — it does not understand CSS custom properties. We therefore
 * accept a `color` string (the room's theme accent, e.g. "#378add") as a
 * parameter and pass it directly to the library. White (#ffffff) is used as
 * the light/background module color so the code scans reliably on any surface.
 * Callers should source `color` from `getChatTheme(chat_theme_id).accent`.
 */

import QRCode from "qrcode";
import { jsPDF } from "jspdf";

// ─── URL helpers ─────────────────────────────────────────────────────────────

/**
 * Canonical deep-link URL for a room.
 *
 * Main room:  https://jchat.app/r/{businessSlug}/{roomSlug}
 * Sub-room:   https://jchat.app/r/{businessSlug}/{mainSlug}/{subSlug}
 *             (scanning a sub-room QR enters both the main room and the
 *              sub-room simultaneously — the URL encodes the full path)
 */
export function roomUrl(
  businessSlug: string,
  roomSlug: string,
  /** If this is a sub-room, pass the parent main-room slug here. */
  parentSlug?: string
): string {
  if (parentSlug) {
    return `https://jchat.app/r/${businessSlug}/${parentSlug}/${roomSlug}`;
  }
  return `https://jchat.app/r/${businessSlug}/${roomSlug}`;
}

// ─── QR generation options ───────────────────────────────────────────────────

export interface QrColorOpts {
  /**
   * Foreground (dark module) color. Must be a literal hex or rgba string —
   * CSS custom properties are NOT accepted here.
   * Typically: getChatTheme(room.chat_theme_id).accent
   * @default "#000000"
   */
  color?: string;
}

// ─── SVG ─────────────────────────────────────────────────────────────────────

/**
 * Returns the QR code as an SVG string.
 * Foreground uses the room accent color; background is always white so the
 * pattern is scannable regardless of dashboard theme.
 */
export async function generateQrSvg(
  url: string,
  opts: QrColorOpts = {}
): Promise<string> {
  const { color = "#000000" } = opts;
  return QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "H", // High — leaves room for a center logo
    margin: 2,
    color: {
      dark: color,
      light: "#ffffff", // white background for reliable scanning
    },
  });
}

// ─── PNG data URL ─────────────────────────────────────────────────────────────

/**
 * Returns a high-res PNG data URL (≥ 1024 × 1024 px).
 * Suitable for direct use in <img> tags and for embedding in PDF.
 */
export async function generateQrPngDataUrl(
  url: string,
  opts: QrColorOpts = {}
): Promise<string> {
  const { color = "#000000" } = opts;
  return QRCode.toDataURL(url, {
    type: "image/png",
    width: 1024,
    errorCorrectionLevel: "H",
    margin: 2,
    color: {
      dark: color,
      light: "#ffffff",
    },
  });
}

// ─── Browser download helpers ─────────────────────────────────────────────────

function triggerDownload(href: string, filename: string): void {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  // Clean up after the browser has had a chance to initiate the download
  setTimeout(() => document.body.removeChild(a), 100);
}

/**
 * Generates a 1024 px PNG and triggers a browser download.
 */
export async function downloadQrPng(
  url: string,
  filename: string,
  opts: QrColorOpts = {}
): Promise<void> {
  const dataUrl = await generateQrPngDataUrl(url, opts);
  triggerDownload(dataUrl, `${filename}.png`);
}

/**
 * Generates an SVG and triggers a browser download.
 */
export async function downloadQrSvg(
  url: string,
  filename: string,
  opts: QrColorOpts = {}
): Promise<void> {
  const svg = await generateQrSvg(url, opts);
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  triggerDownload(objectUrl, `${filename}.svg`);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

/**
 * Generates a print-ready A4 PDF with the QR code centered on the page and
 * triggers a browser download.
 *
 * Layout:
 *   • A4 portrait (210 × 297 mm)
 *   • QR image: 160 × 160 mm, centered horizontally, starting at y = 60 mm
 *   • Room name printed above the QR in a clean sans-serif style
 *   • URL printed below the QR in small text for manual entry
 */
export async function downloadQrPdf(
  url: string,
  filename: string,
  roomName: string,
  opts: QrColorOpts = {}
): Promise<void> {
  const pngDataUrl = await generateQrPngDataUrl(url, opts);

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const pageWidth = 210;
  const qrSize = 160;
  const qrX = (pageWidth - qrSize) / 2; // = 25 mm
  const qrY = 60;

  // Room name header
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text(roomName, pageWidth / 2, 45, { align: "center" });

  // QR image (PNG embedded at 1024 px, rendered at 160 × 160 mm)
  doc.addImage(pngDataUrl, "PNG", qrX, qrY, qrSize, qrSize);

  // URL footer below QR
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(url, pageWidth / 2, qrY + qrSize + 8, { align: "center" });

  doc.save(`${filename}.pdf`);
}
