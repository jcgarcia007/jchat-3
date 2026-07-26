import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

// Cookie-based, SIN [locale] en la URL (decisión del plan: docs/PLAN_i18n.md).
// Las URLs no cambian; el locale se detecta por esta cookie, con 'en' de fallback.
const COOKIE_NAME = "jchat-lang";
const DEFAULT_LOCALE = "en"; // TODO: cambiar aquí si el default deja de ser inglés
const SUPPORTED_LOCALES = ["en", "es"] as const;
type Locale = (typeof SUPPORTED_LOCALES)[number];

function isSupportedLocale(value: string | undefined): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(COOKIE_NAME)?.value;
  const locale = isSupportedLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
