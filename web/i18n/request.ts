import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";

// Cookie-based, SIN [locale] en la URL (decisión del plan: docs/PLAN_i18n.md).
// Orden: cookie `jchat-lang` (la elige el usuario con el LanguageSwitcher) → cabecera
// Accept-Language (cualquier `es*` → es) → 'en'.
const COOKIE_NAME = "jchat-lang";
const DEFAULT_LOCALE = "en";
const SUPPORTED_LOCALES = ["en", "es"] as const;
type Locale = (typeof SUPPORTED_LOCALES)[number];

function isSupportedLocale(value: string | undefined): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}

/** Best supported language from an Accept-Language header (q-weighted; any `es*` is Spanish). */
function fromAcceptLanguage(header: string | null): Locale | null {
  if (!header) return null;
  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { tag: tag.toLowerCase(), q: q ? Number.parseFloat(q.slice(2)) : 1 };
    })
    .filter((entry) => entry.tag && Number.isFinite(entry.q) && entry.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const { tag } of ranked) {
    if (tag === "es" || tag.startsWith("es-")) return "es";
    if (tag === "en" || tag.startsWith("en-")) return "en";
  }
  return null;
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(COOKIE_NAME)?.value;
  const locale: Locale = isSupportedLocale(cookieLocale)
    ? cookieLocale
    : (fromAcceptLanguage((await headers()).get("accept-language")) ?? DEFAULT_LOCALE);

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
