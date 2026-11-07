"use client";

/**
 * JChat 3.0 — /download. Destino del QR de escritorio, del botón de la bienvenida en celular y
 * de DOWNLOAD_PAGE_URL de la app. Mientras APP_STORES_LIVE sea false NO redirige ni enlaza a ninguna
 * tienda (la app no está publicada). Con true: en iOS/Android redirige a la tienda (user agent SOLO
 * en el cliente, tras montar); en escritorio muestra botones y QR.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { IconMessageCircle2, IconArrowRight } from "@tabler/icons-react";
import {
  APP_STORES_LIVE,
  APP_STORE_URL,
  PLAY_STORE_URL,
  detectStorePlatform,
  type StorePlatform,
} from "@/lib/appLinks";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { DownloadQr, StoreButtons } from "@/components/download/StoreButtons";

export default function DownloadPage() {
  const t = useTranslations("download");
  const [platform, setPlatform] = useState<StorePlatform | null>(null);

  useEffect(() => {
    if (!APP_STORES_LIVE) return;
    const detected = detectStorePlatform(navigator.userAgent, navigator.maxTouchPoints);
    setPlatform(detected);
    if (detected === "ios") window.location.replace(APP_STORE_URL);
    else if (detected === "android") window.location.replace(PLAY_STORE_URL);
  }, []);

  const storeHref = platform === "ios" ? APP_STORE_URL : PLAY_STORE_URL;
  const redirecting = APP_STORES_LIVE && (platform === "ios" || platform === "android");
  const benefits = [t("b1"), t("b2"), t("b3"), t("b4")];

  return (
    <div style={{ minHeight: "100vh", position: "relative", overflow: "hidden", background: "var(--land-bg)", color: "var(--land-text)" }}>
      <div
        aria-hidden
        style={{ position: "absolute", top: -120, right: -80, width: 380, height: 380, borderRadius: "50%", background: "rgb(var(--land-peach-rgb) / .16)", filter: "blur(80px)", pointerEvents: "none" }}
      />
      <div
        aria-hidden
        style={{ position: "absolute", bottom: -120, left: -80, width: 380, height: 380, borderRadius: "50%", background: "rgb(var(--land-mint-rgb) / .16)", filter: "blur(80px)", pointerEvents: "none" }}
      />

      <header
        style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", maxWidth: 960, margin: "0 auto", padding: "20px 16px" }}
      >
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit", minHeight: 44 }}>
          <span
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 10, background: "linear-gradient(135deg, var(--land-peach), var(--land-peach-dark))", color: "var(--on-brand)" }}
          >
            <IconMessageCircle2 size={18} aria-hidden />
          </span>
          <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-.02em" }}>JChat</span>
        </Link>
        <LanguageSwitcher variant="pills" />
      </header>

      <main style={{ position: "relative", maxWidth: 560, margin: "0 auto", padding: "24px 16px 64px" }}>
        <div
          style={{ background: "var(--land-glass)", border: "1px solid rgb(var(--ink-rgb) / .07)", borderRadius: 24, boxShadow: "var(--land-shadow)", padding: 28 }}
        >
          <h1 style={{ fontFamily: "var(--font-grotesk), system-ui, sans-serif", fontSize: 32, fontWeight: 700, letterSpacing: "-.04em", margin: "0 0 10px" }}>
            {t("title")}
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.55, color: "var(--land-sub)", margin: "0 0 16px" }}>{t("body")}</p>
          <ul style={{ margin: "0 0 24px", paddingLeft: 20, display: "grid", gap: 6, fontSize: 14, color: "var(--land-sub)" }}>
            {benefits.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>

          {!APP_STORES_LIVE && (
            <>
              <p style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px" }}>{t("soonTitle")}</p>
              <StoreButtons minHeight={48} />
              <Link
                href="/"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44, marginTop: 16, color: "var(--land-peach)", fontWeight: 600, fontSize: 14 }}
              >
                {t("useWeb")}
                <IconArrowRight size={16} aria-hidden />
              </Link>
            </>
          )}

          {redirecting && (
            <p role="status" style={{ fontSize: 15, margin: 0 }}>
              {t("opening")}{" "}
              <a href={storeHref} style={{ color: "var(--land-peach)", fontWeight: 600 }}>
                {t("openManually")}
              </a>
            </p>
          )}

          {APP_STORES_LIVE && platform === "desktop" && (
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <DownloadQr size={112} />
              <StoreButtons minHeight={48} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
