/**
 * JChat 3.0 — Landing page pública (/).
 *
 * Presenta el producto social a usuarios nuevos.
 * Auth: /auth/login · /auth/register (existentes, no se tocan).
 * Bilingüe via next-intl (cookie jchat-lang, namespace "landing").
 * Tokens: GLOBAL (--bg-*, --text-*, --color-*). NO --db-* (dashboard only).
 */

"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  IconMapPin,
  IconMessageCircle,
  IconUsers,
  IconArrowRight,
  IconBrandApple,
  IconBrandGooglePlay,
} from "@tabler/icons-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";

// ── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const t = useTranslations("landing");

  // Features computed from translations (type-safe, no template literal keys)
  const features = [
    {
      key: "map",
      title: t("features.map.title"),
      description: t("features.map.description"),
      icon: <IconMapPin size={28} />,
      accent: "var(--color-brand)",
    },
    {
      key: "chat",
      title: t("features.chat.title"),
      description: t("features.chat.description"),
      icon: <IconMessageCircle size={28} />,
      accent: "var(--color-success)",
    },
    {
      key: "groups",
      title: t("features.groups.title"),
      description: t("features.groups.description"),
      icon: <IconUsers size={28} />,
      accent: "var(--color-gold)",
    },
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-base)",
        color: "var(--text-primary)",
        fontFamily: "var(--font-geist-sans, system-ui, sans-serif)",
      }}
    >
      {/* ── Nav ────────────────────────────────────────────────────────── */}
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 24px",
          borderBottom: "1px solid var(--border-subtle)",
          position: "sticky",
          top: 0,
          background: "var(--bg-base)",
          zIndex: 10,
        }}
      >
        <span style={{ fontSize: "20px", fontWeight: 800, color: "var(--color-brand)" }}>
          JChat
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <LanguageSwitcher />
          <Link
            href="/auth/login"
            style={{
              padding: "8px 18px",
              borderRadius: "8px",
              border: "1px solid var(--border-subtle)",
              background: "transparent",
              color: "var(--text-primary)",
              fontSize: "13px",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            {t("nav.signIn")}
          </Link>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section
        style={{
          textAlign: "center",
          padding: "80px 24px 64px",
          maxWidth: "680px",
          margin: "0 auto",
        }}
      >
        {/* Pill */}
        <div
          style={{
            display: "inline-block",
            padding: "5px 14px",
            borderRadius: "100px",
            border: "1px solid rgba(92,124,250,0.3)",
            background: "rgba(92,124,250,0.1)",
            color: "var(--color-brand)",
            fontSize: "12px",
            fontWeight: 600,
            letterSpacing: "0.02em",
            marginBottom: "24px",
          }}
        >
          {t("hero.pill")}
        </div>

        {/* H1 */}
        <h1
          style={{
            fontSize: "clamp(32px, 6vw, 52px)",
            fontWeight: 800,
            lineHeight: 1.1,
            margin: "0 0 20px",
            letterSpacing: "-0.02em",
          }}
        >
          {t("hero.title")}
        </h1>

        {/* Subtitle */}
        <p
          style={{
            fontSize: "17px",
            color: "var(--text-secondary)",
            lineHeight: 1.6,
            margin: "0 0 36px",
          }}
        >
          {t("hero.subtitle")}
        </p>

        {/* CTAs */}
        <div
          style={{
            display: "flex",
            gap: "12px",
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <Link
            href="/auth/register"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "13px 28px",
              borderRadius: "10px",
              background: "var(--color-brand)",
              color: "#fff",
              fontSize: "15px",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            {t("hero.createAccount")}
            <IconArrowRight size={16} />
          </Link>

          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "13px 24px",
              borderRadius: "10px",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-secondary)",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            <IconBrandApple size={16} />
            <IconBrandGooglePlay size={16} />
            {t("hero.downloadApp")}
          </div>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────────── */}
      <section
        style={{
          padding: "0 24px 80px",
          maxWidth: "960px",
          margin: "0 auto",
        }}
      >
        <p
          style={{
            textAlign: "center",
            fontSize: "12px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--text-tertiary)",
            margin: "0 0 28px",
          }}
        >
          {t("features.title")}
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "16px",
          }}
        >
          {features.map((feat) => (
            <div
              key={feat.key}
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "16px",
                padding: "28px 24px",
              }}
            >
              <div
                style={{
                  width: "52px",
                  height: "52px",
                  borderRadius: "14px",
                  background: `color-mix(in srgb, ${feat.accent} 12%, transparent)`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: feat.accent,
                  marginBottom: "18px",
                }}
              >
                {feat.icon}
              </div>
              <h3 style={{ fontSize: "17px", fontWeight: 700, margin: "0 0 8px" }}>
                {feat.title}
              </h3>
              <p
                style={{
                  fontSize: "14px",
                  color: "var(--text-secondary)",
                  lineHeight: 1.6,
                  margin: 0,
                }}
              >
                {feat.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Social tagline ─────────────────────────────────────────────── */}
      <section
        style={{
          padding: "48px 24px",
          textAlign: "center",
          background: "var(--bg-surface)",
          borderTop: "1px solid var(--border-subtle)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <h2 style={{ fontSize: "24px", fontWeight: 700, margin: "0 0 10px" }}>
          {t("social.title")}
        </h2>
        <p style={{ fontSize: "16px", color: "var(--text-secondary)", margin: "0 0 28px" }}>
          {t("social.body")}
        </p>
        <Link
          href="/pricing"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "11px 24px",
            borderRadius: "9px",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-primary)",
            fontSize: "14px",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          {t("pricing.cta")}
          <IconArrowRight size={15} />
        </Link>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer
        style={{
          padding: "32px 24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "12px",
          color: "var(--text-tertiary)",
          fontSize: "13px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span>{t("footer.business")}</span>
          <Link
            href="/pricing#negocios"
            style={{
              color: "var(--color-brand)",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            {t("footer.businessLink")} →
          </Link>
        </div>
        <span>{t("footer.copyright")}</span>
      </footer>
    </div>
  );
}
