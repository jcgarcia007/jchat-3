"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

const COOKIE_NAME = "jchat-lang";
const LOCALES = ["en", "es"] as const;
type Locale = (typeof LOCALES)[number];

function setLocaleCookie(locale: Locale) {
  document.cookie = `${COOKIE_NAME}=${locale}; path=/; max-age=31536000; SameSite=Lax`;
}

/** Minimal language switcher — proves the next-intl pipeline renders end to end. */
export default function LanguageSwitcher() {
  const t = useTranslations("common");
  const router = useRouter();

  function switchTo(locale: Locale) {
    setLocaleCookie(locale);
    router.refresh();
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 12 }}>
      <span style={{ color: "var(--text-secondary)" }}>{t("language")}:</span>
      {LOCALES.map((locale) => (
        <button
          key={locale}
          onClick={() => switchTo(locale)}
          style={{
            border: "none",
            background: "none",
            padding: "2px 6px",
            cursor: "pointer",
            color: "var(--text-secondary)",
            fontWeight: 600,
            textTransform: "uppercase",
          }}
        >
          {locale}
        </button>
      ))}
    </div>
  );
}
