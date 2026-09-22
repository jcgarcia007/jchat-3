"use client";

import { useRouter } from "next/navigation";

export default function LegalLangToggle() {
  const router = useRouter();

  function switchTo(locale: "en" | "es") {
    document.cookie = `jchat-lang=${locale}; path=/; max-age=31536000; SameSite=Lax`;
    router.refresh();
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", fontWeight: 700 }}>
      <button
        onClick={() => switchTo("en")}
        style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280", padding: "2px 6px", fontWeight: 700, fontSize: "12px" }}
      >
        EN
      </button>
      <span style={{ color: "#D1D5DB" }}>|</span>
      <button
        onClick={() => switchTo("es")}
        style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280", padding: "2px 6px", fontWeight: 700, fontSize: "12px" }}
      >
        ES
      </button>
    </div>
  );
}
