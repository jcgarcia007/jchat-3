/**
 * JChat 3.0 — QR Code Service (Task 2.8 + Capa 2)
 *
 * Generates QR codes for room deep-links. All generation is done in the
 * browser via the `qrcode` (plain) and `qr-code-styling` (styled) packages.
 *
 * Color notes
 * ───────────
 * The QR library requires literal color strings (hex/rgba) — CSS custom
 * properties are NOT accepted. Foreground defaults to #000000 for maximum
 * contrast; background is always #ffffff for reliable scanning.
 *
 * Logo notes
 * ──────────
 * The center logo is a canvas-drawn placeholder (brand-indigo circle + "JC"
 * initials). TODO: replace with real JChat logo asset (web/public/logo.png)
 * once available. See generateLogoDataUrl() for instructions.
 */

import QRCode from "qrcode";
import { jsPDF } from "jspdf";

// ─── URL helper ───────────────────────────────────────────────────────────────

/**
 * Canonical deep-link URL for a chat room via its QR token.
 * Uses /c/{qrToken} — the scheme implemented in Fase 1 (migration 026).
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
   * Foreground (dark module) color. Must be a literal hex or rgba string.
   * @default "#000000"
   */
  color?: string;
}

// ─── Logo placeholder helper ───────────────────────────────────────────────────

/**
 * Generates a data URL of the JChat logo placeholder: brand-indigo circle
 * (#5C7CFA) with white "JC" text on a white square background.
 *
 * Returns null in non-browser environments (no canvas available).
 *
 * TODO: Replace the canvas drawing with a real logo image:
 *   1. Add the logo as web/public/logo.png
 *   2. Fetch it: `const resp = await fetch('/logo.png'); const blob = await resp.blob();`
 *   3. Convert: `return URL.createObjectURL(blob);` (or read as dataURL)
 *   4. Remove this canvas code.
 */
async function generateLogoDataUrl(): Promise<string | null> {
  if (typeof document === "undefined") return null;

  return new Promise<string>((resolve) => {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const cx = size / 2;
    const cy = size / 2;
    const r = Math.round(size * 0.44);

    // White square background (qr-code-styling clips to image bounds)
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);

    // Brand-indigo filled circle
    ctx.fillStyle = "#5C7CFA";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // "JC" initials
    const fontSize = Math.round(r * 0.85);
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("JC", cx, cy + 2);

    resolve(canvas.toDataURL("image/png"));
  });
}

// ─── Plain QR (square dots) with center logo ─────────────────────────────────

/**
 * Returns a high-res PNG data URL (1024 × 1024 px) with square dots and a
 * JChat logo composed via <canvas>.
 *
 * Logo occupies ≈24% of the QR diameter — within the 30% safe zone of
 * errorCorrectionLevel "H".
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

  const logoDataUrl = await generateLogoDataUrl();
  if (!logoDataUrl) return rawDataUrl;

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

      // 2 — center logo (~24% diameter = within 30% H-level safe zone)
      const logoImg = new Image();
      logoImg.onload = () => {
        const cx = size / 2;
        const cy = size / 2;
        const logoR = Math.round(size * 0.12); // radius ≈ 123px

        // white halo so logo doesn't bleed into QR modules
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(cx, cy, logoR + 8, 0, Math.PI * 2);
        ctx.fill();

        // draw logo image centered
        ctx.drawImage(
          logoImg,
          cx - logoR,
          cy - logoR,
          logoR * 2,
          logoR * 2
        );

        resolve(canvas.toDataURL("image/png"));
      };
      logoImg.src = logoDataUrl;
    };
    img.src = rawDataUrl;
  });
}

// ─── Styled QR (rounded dots, square finder patterns) with center logo ────────

/**
 * Returns a high-res PNG data URL (1024 × 1024 px) with rounded dots and a
 * JChat logo at the center, generated via qr-code-styling.
 *
 * Scannability rules:
 *   • Dots: "rounded" (fills ≥70% of each cell)
 *   • Finder patterns (cornersSquareOptions): "square" — conservative, must
 *     read as squares. The rounded aesthetic comes from the data dots only.
 *   • errorCorrectionLevel "H" — allows ≤30% data module loss; logo ≤25%.
 *   • Black (#000000) on white (#ffffff) — maximum contrast.
 *
 * Falls back to generateQrPngDataUrl() on SSR or if qr-code-styling fails.
 */
export async function generateStyledQrPngDataUrl(
  url: string,
  opts: QrColorOpts = {}
): Promise<string> {
  // SSR: qr-code-styling requires browser canvas
  if (typeof document === "undefined") {
    return generateQrPngDataUrl(url, opts);
  }

  try {
    const logoDataUrl = await generateLogoDataUrl();

    // Dynamic import keeps this DOM-heavy library out of the SSR bundle
    const { default: QRCodeStyling } = await import("qr-code-styling");

    const qr = new QRCodeStyling({
      width: 1024,
      height: 1024,
      data: url,
      qrOptions: { errorCorrectionLevel: "H" },
      dotsOptions: {
        type: "rounded",   // rounded dots — fills ≥70% of each cell
        color: "#000000",
      },
      cornersSquareOptions: {
        type: "square",    // conservative: finder patterns stay clearly square
        color: "#000000",
      },
      cornersDotOptions: {
        color: "#000000",
      },
      backgroundOptions: {
        color: "#ffffff",
      },
      ...(logoDataUrl && {
        image: logoDataUrl,
        imageOptions: {
          crossOrigin: "anonymous",
          margin: 8,
          imageSize: 0.25,  // logo ≤25% of QR width
          hideBackgroundDots: true,
        },
      }),
    });

    const raw = await qr.getRawData("png");
    // In the browser getRawData always yields a Blob; Buffer only in Node.js
    // (which can't reach here due to the typeof document guard above).
    if (!raw || !(raw instanceof Blob)) throw new Error("qr-code-styling: expected Blob");

    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(raw);
    });
  } catch {
    // Any failure (canvas unavailable, import error, etc.) → plain fallback
    return generateQrPngDataUrl(url, opts);
  }
}

// ─── SVG ──────────────────────────────────────────────────────────────────────

/**
 * Returns the QR code as an SVG string (square dots, no logo).
 * Background is always white so the pattern scans on any surface.
 */
export async function generateQrSvg(
  url: string,
  opts: QrColorOpts = {}
): Promise<string> {
  const { color = "#000000" } = opts;
  return QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "H",
    margin: 2,
    color: {
      dark: color,
      light: "#ffffff",
    },
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

/** Generates a 1024 px plain PNG (with logo) and triggers a browser download. */
export async function downloadQrPng(
  url: string,
  filename: string,
  opts: QrColorOpts = {}
): Promise<void> {
  const dataUrl = await generateQrPngDataUrl(url, opts);
  triggerDownload(dataUrl, `${filename}.png`);
}

/** Triggers a browser download of an already-generated PNG data URL. */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  triggerDownload(dataUrl, filename);
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
 * Generates a print-ready A4 PDF with the plain QR (square dots + logo)
 * and triggers a browser download.
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
  const qrX = (pageWidth - qrSize) / 2;
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

/**
 * Generates a styled A4 PDF with:
 *   • Business name (large, bold) at top
 *   • Room name (subtitle)
 *   • Styled QR code (rounded dots + logo) centered
 *   • "Escanea para entrar al chat" call-to-action below QR
 *   • URL in small text at bottom for manual entry
 *
 * The QR's internal quiet zone (4 modules) is preserved — text never
 * intrudes into the QR's white border area.
 */
export async function downloadStyledQrPdf(
  url: string,
  filename: string,
  businessName: string,
  roomName: string,
  opts: QrColorOpts = {}
): Promise<void> {
  const pngDataUrl = await generateStyledQrPngDataUrl(url, opts);

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const pageWidth = 210;
  const qrSize = 150;
  const qrX = (pageWidth - qrSize) / 2; // 30mm
  const qrY = 70;

  // Business name (large, bold)
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.text(businessName, pageWidth / 2, 40, { align: "center" });

  // Room name (subtitle)
  doc.setFontSize(14);
  doc.setFont("helvetica", "normal");
  doc.text(roomName, pageWidth / 2, 54, { align: "center" });

  // Styled QR (quiet zone is part of the PNG — text stays outside)
  doc.addImage(pngDataUrl, "PNG", qrX, qrY, qrSize, qrSize);

  // Call to action
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(
    "Escanea para entrar al chat",
    pageWidth / 2,
    qrY + qrSize + 14,
    { align: "center" }
  );

  // URL (small, for manual entry)
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(url, pageWidth / 2, qrY + qrSize + 24, { align: "center" });

  doc.save(`${filename}.pdf`);
}
