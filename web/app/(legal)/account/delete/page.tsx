import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { DeleteAccountClient } from "./DeleteAccountClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return {
    title: t("legal.accountDelete.title"),
    description: t("legal.accountDelete.description"),
    // This is the URL given to Google Play (Data safety → account deletion): it must be public and indexable.
    robots: { index: true, follow: true },
  };
}

const H1: React.CSSProperties = { fontSize: "28px", fontWeight: 800, color: "var(--gray-900)", marginBottom: "6px", letterSpacing: "-0.5px" };
const H2: React.CSSProperties = { fontSize: "18px", fontWeight: 700, margin: "28px 0 10px", color: "var(--gray-900)" };
const P: React.CSSProperties = { lineHeight: "1.7", marginTop: 0, marginBottom: "14px", color: "var(--gray-700)" };
const UL: React.CSSProperties = { lineHeight: "1.8", paddingLeft: "20px", marginTop: 0, marginBottom: "14px", color: "var(--gray-700)" };
const LINK: React.CSSProperties = { color: "var(--color-brand)", textDecoration: "underline" };

/**
 * /account/delete — PUBLIC page (Google Play "account deletion URL"). The explanation is rendered on the server, so it is there
 * for everybody (and for crawlers) with no session and no JavaScript; <DeleteAccountClient/> adds the action: sign in (no session)
 * or delete (session).
 */
export default async function AccountDeletePage() {
  const t = await getTranslations("accountDelete");
  return (
    <>
      <h1 style={H1}>{t("title")}</h1>
      <p style={P}>{t("intro")}</p>

      <h2 id="how" style={H2}>{t("stepsTitle")}</h2>
      <ol style={UL}>
        <li>{t("step1")}</li>
        <li>{t("step2")}</li>
        <li>{t("step3")}</li>
      </ol>

      <h2 id="deleted" style={H2}>{t("whatTitle")}</h2>
      <ul style={UL}>
        <li>{t("what1")}</li>
        <li>{t("what2")}</li>
        <li>{t("what3")}</li>
        <li>{t("what4")}</li>
      </ul>

      <h2 id="kept" style={H2}>{t("keepTitle")}</h2>
      <ul style={UL}>
        <li>{t("keep1")}</li>
        <li>{t("keep2")}</li>
        <li>{t("keep3")}</li>
        <li>{t("keep4")}</li>
      </ul>

      <p style={P}>{t("irreversible")}</p>
      <p style={P}>{t("ownerNote")}</p>
      <p style={{ ...P, marginBottom: "28px" }}>
        {t("contactLine")} <a href="mailto:soporte@jchat.cloud" style={LINK}>soporte@jchat.cloud</a> · <Link href="/contact" style={LINK}>{t("contact")}</Link>
      </p>

      <DeleteAccountClient />
    </>
  );
}
