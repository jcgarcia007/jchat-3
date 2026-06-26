/**
 * JChat 3.0 — QR Code Service (Task 2.8)
 *
 * Generates QR codes for room deep-links. All generation is done in the
 * browser via the `qrcode` npm package.
 *
 * Color notes
 * ───────────
 * The QR library requires literal color strings (hex/rgba) — CSS custom
 * properties are NOT accepted. Foreground defaults to #000000 for maximum
 * contrast; background is always #ffffff for reliable scanning.
 */

import QRCode from "qrcode";
import { jsPDF } from "jspdf";

// ─── URL helper ───────────────────────────────────────────────────────────────

/**
 * Canonical deep-link URL for a chat room via its QR token.
 * Uses /c/{qrToken} — the scheme implemented in Fase 1 (migration 026).
 * The token already encodes whether this is a main room or sub-room;
 * join_room_via_qr handles membership accumulation server-side.
 */
export function roomQrUrl(qrToken: string, origin?: string): string {
  const base =
    origin ??
    (typeof window !== "undefined"
      ? window.location.origin
      : "https://jchat-3.vercel.app");
  return `${base}/c/${qrToken}`;
}

// ─── QR generation options ────────────────────────────────────────────────────

export interface QrColorOpts {
  /**
   * Foreground (dark module) color. Must be a literal hex or rgba string —
   * CSS custom properties are NOT accepted here.
   * @default "#000000"
   */
  color?: string;
}

// ─── SVG ──────────────────────────────────────────────────────────────────────

/**
 * Returns the QR code as an SVG string.
 * Background is always white so the pattern scans on any surface.
 */
export async function generateQrSvg(
  url: string,
  opts: QrColorOpts = {}
): Promise<string> {
  const { color = "#000000" } = opts;
  return QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "H", // High — leaves room for center logo
    margin: 2,
    color: {
      dark: color,
      light: "#ffffff",
    },
  });
}

// ─── PNG data URL (with center logo) ─────────────────────────────────────────

/**
 * Returns a high-res PNG data URL (1024 × 1024 px) with a JChat logo
 * centered over the QR code, composed via <canvas>.
 *
 * Logo occupies ≈24% of the QR diameter — within the 30% safe zone that
 * errorCorrectionLevel "H" provides. Logo = white halo + brand-indigo circle
 * + "JC" initials.
 *
 * TODO: Replace the canvas-drawn placeholder with the real JChat logo asset
 *       (web/public/logo.png or similar) once the asset is available.
 *       Steps: load the logo image, draw it inside the white circle instead
 *       of the text, adjust padding to taste.
 */
export async function generateQrPngDataUrl(
  url: string,
  opts: QrColorOpts = {}
): Promise<string> {
  const { color = "#000000" } = opts;

  const rawDataUrl = await QRCode.toDataURL(url, {
    type: "image/png",
    width: 1024,
    errorCorrectionLevel: "H",
    margin: 2,
    color: {
      dark: color,
      light: "#ffffff",
    },
  });

  // No canvas in SSR — return plain QR
  if (typeof document === "undefined") return rawDataUrl;

  return new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const size = img.width; // 1024
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;

      // 1 — draw base QR
      ctx.drawImage(img, 0, 0);

      // 2 — center logo overlay (~24% diameter = well within 30% H-level safe zone)
      const cx = size / 2;
      const cy = size / 2;
      const logoR = Math.round(size * 0.12); // radius ≈ 123px

      // white halo so logo doesn't bleed into QR modules
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(cx, cy, logoR + 8, 0, Math.PI * 2);
      ctx.fill();

      // brand-indigo filled circle
      ctx.fillStyle = "#5C7CFA";
      ctx.beginPath();
      ctx.arc(cx, cy, logoR, 0, Math.PI * 2);
      ctx.fill();

      // "JC" initials (TODO: swap for real logo image)
      const fontSize = Math.round(logoR * 0.85);
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("JC", cx, cy + 2); // +2 for optical centering

      resolve(canvas.toDataURL("image/png"));
    };
    img.src = rawDataUrl;
  });
}

// ─── Browser download helpers ──────────────────────────────────────────────────

function triggerDownload(href: string, filename: string): void {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => document.body.removeChild(a), 100);
}

/** Generates a 1024 px PNG (with logo) and triggers a browser download. */
export async function downloadQrPng(
  url: string,
  filename: string,
  opts: QrColorOpts = {}
): Promise<void> {
  const dataUrl = await generateQrPngDataUrl(url, opts);
  triggerDownload(dataUrl, `${filename}.png`);
}

/** Generates an SVG and triggers a browser download. */
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
 * Generates a print-ready A4 PDF with the QR code (including logo) centered
 * on the page and triggers a browser download.
 *
 * Layout:
 *   • A4 portrait (210 × 297 mm)
 *   • Room name above the QR (bold, centered)
 *   • QR image: 160 × 160 mm, centered horizontally, starting at y = 60 mm
 *   • URL printed below in small text for manual entry
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
  const qrX = (pageWidth - qrSize) / 2; // 25 mm
  const qrY = 60;

  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text(roomName, pageWidth / 2, 45, { align: "center" });

  doc.addImage(pngDataUrl, "PNG", qrX, qrY, qrSize, qrSize);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(url, pageWidth / 2, qrY + qrSize + 8, { align: "center" });

  doc.save(`${filename}.pdf`);
}
