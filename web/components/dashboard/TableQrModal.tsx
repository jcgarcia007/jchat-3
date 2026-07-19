"use client";

/**
 * Per-table QR modal (Mesas/Taps B5). Renders the /t/{token} QR with download
 * (PNG/SVG/PDF), copy-link and print. QR generation reuses @/services/qr — no
 * reimplementation. Tokens: --db-* only.
 */

import { useEffect, useState } from "react";
import { IconX, IconDownload, IconCopy, IconCheck, IconPrinter, IconMessageCircle } from "@tabler/icons-react";
import {
  tableQrUrl,
  generateQrSvg,
  downloadQrPng,
  downloadQrSvg,
  downloadQrPdf,
} from "@/services/qr";

export interface QrTable {
  id: string;
  label: string;
  qr_token: string;
  room_id: string | null;
}

export function TableQrModal({ table, onClose }: { table: QrTable; onClose: () => void }) {
  const url = tableQrUrl(table.qr_token);
  const [svg, setSvg] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    void generateQrSvg(url).then((s) => {
      if (active) setSvg(s);
    });
    return () => {
      active = false;
    };
  }, [url]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const filename = `mesa-${table.label}`.replace(/\s+/g, "-").toLowerCase();

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be blocked — ignore
    }
  }

  function print() {
    const w = window.open("", "_blank", "width=480,height=640");
    if (!w) return;
    w.document.write(
      `<!doctype html><title>${table.label}</title><body style="margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:system-ui"><h2>Mesa ${table.label}</h2><div style="width:320px">${svg}</div><script>window.onload=function(){window.print()}</script></body>`,
    );
    w.document.close();
  }

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`QR de la mesa ${table.label}`}
        style={{
          width: "100%",
          maxWidth: "380px",
          background: "var(--db-bg-surface)",
          border: "1px solid var(--db-border)",
          borderRadius: "16px",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: "16px", fontWeight: 800, color: "var(--db-text-primary)" }}>Mesa {table.label}</div>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={iconBtn}>
            <IconX size={18} />
          </button>
        </div>

        <div
          aria-label="Código QR"
          style={{ background: "#ffffff", borderRadius: "12px", padding: "16px", display: "flex", justifyContent: "center" }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />

        {table.room_id && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--db-text-secondary)" }}>
            <IconMessageCircle size={16} />
            Al escanear también entra al chat de esta mesa.
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          <button type="button" onClick={() => void downloadQrPng(url, filename)} style={btn}>
            <IconDownload size={15} /> PNG
          </button>
          <button type="button" onClick={() => void downloadQrSvg(url, filename)} style={btn}>
            <IconDownload size={15} /> SVG
          </button>
          <button type="button" onClick={() => void downloadQrPdf(url, filename, `Mesa ${table.label}`)} style={btn}>
            <IconDownload size={15} /> PDF
          </button>
          <button type="button" onClick={print} style={btn}>
            <IconPrinter size={15} /> Imprimir
          </button>
          <button type="button" onClick={() => void copyLink()} style={btn}>
            {copied ? <IconCheck size={15} /> : <IconCopy size={15} />} {copied ? "Copiado" : "Copiar"}
          </button>
        </div>
      </div>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "32px",
  height: "32px",
  borderRadius: "8px",
  border: "1px solid var(--db-border)",
  background: "var(--db-bg-base)",
  color: "var(--db-text-primary)",
  cursor: "pointer",
};

const btn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  padding: "8px 12px",
  borderRadius: "8px",
  border: "1px solid var(--db-border)",
  background: "transparent",
  color: "var(--db-text-primary)",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
};
