"use client";

/**
 * JChat 3.0 — QR Code Generator Modal (Task 2.8)
 *
 * Renders a full-size QR preview for a chat room deep-link, with download
 * (PNG/SVG/PDF) and share (Copy link, Web Share API, Print) actions.
 *
 * QR color strategy
 * ─────────────────
 * The dark modules use the room's chat theme accent color (sourced from
 * getChatTheme). The light modules are always #ffffff so the code scans
 * reliably. These literal color strings are passed directly to the `qrcode`
 * library — the library cannot consume CSS custom properties.
 *
 * Pro logo embedding
 * ──────────────────
 * When business.plan === 'pro' and business.logo_url is set, the logo is
 * rendered as an absolutely-positioned <img> over the center of the QR SVG.
 * This is a visual overlay only — the QR uses errorCorrectionLevel "H" (30 %
 * redundancy) so the center modules can be obscured without breaking scanning.
 * TODO: crop/resize the logo to a circle for a cleaner appearance.
 */

import {
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import {
  IconDownload,
  IconCopy,
  IconShare,
  IconPrinter,
  IconX,
  IconCheck,
} from "@tabler/icons-react";
import { getChatTheme } from "@/constants/chatThemes";
import {
  roomUrl,
  generateQrSvg,
  downloadQrPng,
  downloadQrSvg,
  downloadQrPdf,
} from "@/services/qr";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QRModalRoom {
  slug: string;
  name: string;
  chat_theme_id: number;
  /** If this room is a sub-room, supply the parent's slug. */
  parent_slug?: string;
  /** True when this is the main (root) room of the venue. */
  is_main?: boolean;
}

export interface QRModalBusiness {
  slug: string;
  logo_url?: string | null;
  plan: string;
}

export interface QRModalProps {
  room: QRModalRoom;
  business: QRModalBusiness;
  open: boolean;
  onClose: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeFilename(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

// ─── Component ────────────────────────────────────────────────────────────────

export function QRModal({ room, business, open, onClose }: QRModalProps) {
  const theme = getChatTheme(room.chat_theme_id);
  const accentColor = theme.accent;

  const isSubRoom = Boolean(room.parent_slug);
  const isPro = business.plan === "pro";

  const deepLink = roomUrl(business.slug, room.slug, room.parent_slug);
  const filename = safeFilename(`${business.slug}-${room.slug}-qr`);

  const [svgContent, setSvgContent] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Regenerate SVG preview whenever the room/accent changes or modal opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    generateQrSvg(deepLink, { color: accentColor }).then((svg) => {
      if (!cancelled) setSvgContent(svg);
    });
    return () => { cancelled = true; };
  }, [open, deepLink, accentColor]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const backdropRef = useRef<HTMLDivElement>(null);
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === backdropRef.current) onClose();
    },
    [onClose]
  );

  // ── Actions ──────────────────────────────────────────────────────────────

  const handleDownloadPng = async () => {
    setIsGenerating(true);
    try {
      await downloadQrPng(deepLink, filename, { color: accentColor });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadSvg = async () => {
    setIsGenerating(true);
    try {
      await downloadQrSvg(deepLink, filename, { color: accentColor });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadPdf = async () => {
    setIsGenerating(true);
    try {
      await downloadQrPdf(deepLink, filename, room.name, { color: accentColor });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(deepLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text from a temporary textarea
      const el = document.createElement("textarea");
      el.value = deepLink;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.focus();
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join ${room.name} on JChat`,
          url: deepLink,
        });
      } catch {
        // User cancelled or share failed — fall back to copy
        await handleCopyLink();
      }
    } else {
      // Web Share API not available — fall back to copy
      await handleCopyLink();
    }
  };

  const handlePrint = () => {
    const printWindow = window.open("", "_blank", "width=600,height=700");
    if (!printWindow) return;
    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>${room.name} — JChat QR Code</title>
  <style>
    body { margin: 0; display: flex; flex-direction: column; align-items: center;
           justify-content: center; min-height: 100vh; font-family: sans-serif; }
    h1   { font-size: 18px; margin-bottom: 16px; }
    img  { width: 300px; height: 300px; }
    p    { font-size: 11px; color: #666; margin-top: 12px; word-break: break-all;
           max-width: 300px; text-align: center; }
  </style>
</head>
<body>
  <h1>${room.name}</h1>
  <div>${svgContent}</div>
  <p>${deepLink}</p>
</body>
</html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  if (!open) return null;

  return (
    /* Backdrop */
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={`QR code for ${room.name}`}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(4px)",
      }}
    >
      {/* Modal card */}
      <div
        style={{
          background: "var(--db-bg-surface)",
          border: "1px solid var(--db-border)",
          borderRadius: "16px",
          width: "min(480px, 92vw)",
          padding: "28px 24px 24px",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
          position: "relative",
          boxShadow: "0 24px 48px rgba(0,0,0,0.4)",
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close QR modal"
          style={{
            position: "absolute",
            top: "16px",
            right: "16px",
            background: "var(--db-bg-elevated)",
            border: "1px solid var(--db-border)",
            borderRadius: "8px",
            width: "32px",
            height: "32px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--db-text-secondary)",
          }}
        >
          <IconX size={16} stroke={1.8} />
        </button>

        {/* Header */}
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: "18px",
              fontWeight: 700,
              color: "var(--db-text-primary)",
              lineHeight: 1.3,
            }}
          >
            {room.name}
          </h2>

          {/* Sub-room note */}
          {isSubRoom && (
            <p
              style={{
                margin: "6px 0 0",
                fontSize: "12px",
                color: "var(--db-text-secondary)",
                lineHeight: 1.4,
              }}
            >
              Scanning enters Main Room + [{room.name}] simultaneously
            </p>
          )}
        </div>

        {/* QR preview */}
        <div
          style={{
            position: "relative",
            alignSelf: "center",
            width: "240px",
            height: "240px",
            borderRadius: "12px",
            overflow: "hidden",
            background: "#ffffff",
            boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
          }}
        >
          {svgContent ? (
            <div
              aria-label="QR code preview"
              /* The SVG string from the qrcode library already contains a
                 white background rect — we render it directly into the DOM. */
              dangerouslySetInnerHTML={{ __html: svgContent }}
              style={{ width: "100%", height: "100%" }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#999",
                fontSize: "13px",
              }}
            >
              Generating…
            </div>
          )}

          {/* Pro: center logo overlay
              Uses errorCorrectionLevel "H" (30 % redundancy) — the center
              ~22 % of the QR is the safest region to obscure.
              TODO: clip logo to circle for cleaner appearance. */}
          {isPro && business.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={business.logo_url}
              alt={`${business.slug} logo`}
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: "48px",
                height: "48px",
                objectFit: "cover",
                borderRadius: "8px",
                border: "3px solid #ffffff",
                background: "#ffffff",
              }}
            />
          )}
        </div>

        {/* URL display */}
        <p
          style={{
            margin: 0,
            fontSize: "11px",
            color: "var(--db-text-tertiary)",
            textAlign: "center",
            wordBreak: "break-all",
            lineHeight: 1.5,
          }}
        >
          {deepLink}
        </p>

        {/* ── Download row ─────────────────────────────────────────────────── */}
        <div>
          <p
            style={{
              margin: "0 0 8px",
              fontSize: "11px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--db-text-tertiary)",
            }}
          >
            Download
          </p>
          <div style={{ display: "flex", gap: "8px" }}>
            {(
              [
                { label: "PNG", action: handleDownloadPng },
                { label: "SVG", action: handleDownloadSvg },
                { label: "PDF (A4)", action: handleDownloadPdf },
              ] as const
            ).map(({ label, action }) => (
              <button
                key={label}
                onClick={action}
                disabled={isGenerating}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  padding: "9px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--db-border)",
                  background: "var(--db-bg-elevated)",
                  color: "var(--db-text-primary)",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: isGenerating ? "wait" : "pointer",
                  opacity: isGenerating ? 0.6 : 1,
                  transition: "background 0.15s",
                }}
              >
                <IconDownload size={14} stroke={1.8} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Share row ─────────────────────────────────────────────────────── */}
        <div>
          <p
            style={{
              margin: "0 0 8px",
              fontSize: "11px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--db-text-tertiary)",
            }}
          >
            Share
          </p>
          <div style={{ display: "flex", gap: "8px" }}>
            {/* Copy link */}
            <button
              onClick={handleCopyLink}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                padding: "9px 12px",
                borderRadius: "8px",
                border: copied
                  ? "1px solid var(--db-success)"
                  : "1px solid var(--db-border)",
                background: copied
                  ? "rgba(34,197,94,0.1)"
                  : "var(--db-bg-elevated)",
                color: copied ? "var(--db-success)" : "var(--db-text-primary)",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
                transition: "background 0.15s, border-color 0.15s, color 0.15s",
              }}
            >
              {copied ? (
                <IconCheck size={14} stroke={2} />
              ) : (
                <IconCopy size={14} stroke={1.8} />
              )}
              {copied ? "Copied!" : "Copy link"}
            </button>

            {/* Share (Web Share API) */}
            <button
              onClick={handleShare}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                padding: "9px 12px",
                borderRadius: "8px",
                border: "1px solid var(--db-border)",
                background: "var(--db-bg-elevated)",
                color: "var(--db-text-primary)",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
                transition: "background 0.15s",
              }}
            >
              <IconShare size={14} stroke={1.8} />
              Share
            </button>

            {/* Print */}
            <button
              onClick={handlePrint}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                padding: "9px 12px",
                borderRadius: "8px",
                border: "1px solid var(--db-border)",
                background: "var(--db-bg-elevated)",
                color: "var(--db-text-primary)",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
                transition: "background 0.15s",
              }}
            >
              <IconPrinter size={14} stroke={1.8} />
              Print
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
