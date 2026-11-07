"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

const COOKIE_NAME = "jchat-lang";
const LOCALES = ["en", "es"] as const;
type Locale = (typeof LOCALES)[number];

function setLocaleCookie(locale: Locale) {
  document.cookie = `${COOKIE_NAME}=${locale}; path=/; max-age=31536000; SameSite=Lax`;
}

/** Minimal language switcher — proves the next-intl pipeline renders end to end. */
export default function LanguageSwitcher({ variant = "text" }: { variant?: "text" | "pills" }) {
  const t = useTranslations("common");
  const router = useRouter();
  const current = useLocale();

  function switchTo(locale: Locale) {
    setLocaleCookie(locale);
    router.refresh();
  }

  if (variant === "pills") {
    return (
      <div role="group" aria-label={t("language")} style={{ display: "inline-flex", gap: 4 }}>
        {LOCALES.map((locale) => {
          const active = locale === current;
          return (
            <button
              key={locale}
              type="button"
              onClick={() => switchTo(locale)}
              aria-pressed={active}
              style={{
                minWidth: 44,
                minHeight: 34,
                padding: "0 12px",
                borderRadius: 999,
                border: "none",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 700,
                textTransform: "uppercase",
                background: active ? "var(--gray-900)" : "transparent",
                color: active ? "var(--on-brand)" : "var(--text-secondary)",
              }}
            >
              {locale}
            </button>
          );
        })}
      </div>
    );
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
