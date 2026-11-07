"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { IconBrandAppstore, IconBrandGooglePlay } from "@tabler/icons-react";
import { APP_STORES_LIVE, APP_STORE_URL, DOWNLOAD_URL, PLAY_STORE_URL } from "@/lib/appLinks";

/** QR (SVG from the shared services/qr.ts helper, loaded lazily) that points to jchat.cloud/download. */
export function DownloadQr({ size }: { size: number }) {
  const t = useTranslations("authPages.welcome");
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("@/services/qr").then(async ({ generateQrSvg }) => {
      const svg = await generateQrSvg(DOWNLOAD_URL);
      if (!cancelled) setSrc(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: 12,
        background: "rgb(var(--white-rgb))",
        border: "1px solid var(--gray-200)",
        overflow: "hidden",
      }}
    >
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={t("qrAlt")} aria-label={t("qrAlt")} width={size} height={size} style={{ display: "block" }} />
      )}
    </div>
  );
}

/** "App Store" + "Google Play" buttons. Disabled (never an <a> to a store) until APP_STORES_LIVE. */
export function StoreButtons({ minHeight = 44 }: { minHeight?: number }) {
  const t = useTranslations("authPages.welcome");
  const stores = [
    { key: "ios", label: t("appStore"), href: APP_STORE_URL, Icon: IconBrandAppstore },
    { key: "android", label: t("playStore"), href: PLAY_STORE_URL, Icon: IconBrandGooglePlay },
  ];
  const base: React.CSSProperties = {
    minHeight,
    padding: "0 16px",
    borderRadius: 12,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    fontSize: 14,
    fontWeight: 600,
    whiteSpace: "nowrap",
    textDecoration: "none",
    border: "none",
  };
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {stores.map((store) =>
        APP_STORES_LIVE ? (
          <a
            key={store.key}
            href={store.href}
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...base, background: "var(--gray-900)", color: "var(--on-brand)" }}
          >
            <store.Icon size={18} aria-hidden />
            {store.label}
          </a>
        ) : (
          <button
            key={store.key}
            type="button"
            disabled
            style={{ ...base, background: "var(--gray-200)", color: "var(--land-sub)", cursor: "not-allowed" }}
          >
            <store.Icon size={18} aria-hidden />
            {store.label}
          </button>
        ),
      )}
    </div>
  );
}
