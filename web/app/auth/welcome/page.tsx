"use client";

/**
 * JChat 3.0 — Bienvenida post-registro.
 * Arregla el bucle: antes el registro empujaba a /dashboard y el gate de plan
 * rebotaba al usuario nuevo (regular) de vuelta a /auth/register?upgrade=1.
 * Dos caminos del mismo nivel: "Tengo un negocio" (planes) y "Quiero usar la app" (descarga).
 * Si YA tiene plan de negocio vigente, se salta esta pantalla y va al panel.
 * La zona de descarga cambia por CSS (hover/pointer), nunca por user agent: así no rompe la hidratación.
 * Look: paleta de jchat.cloud (--land-*), igual que el registro. Textos: next-intl `authPages.welcome`.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion, useReducedMotion } from "framer-motion";
import {
  IconCheck,
  IconLoader2,
  IconBuildingStore,
  IconDeviceMobile,
  IconArrowRight,
  IconMessageCircle2,
  IconReceipt2,
  IconBrandAppstore,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { APP_STORES_LIVE, DOWNLOAD_PATH } from "@/lib/appLinks";
import { BUSINESS_PLANS_HREF } from "@/lib/plans";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import AuthSplitLayout from "@/components/auth/AuthSplitLayout";
import { DownloadQr, StoreButtons } from "@/components/download/StoreButtons";

const EASE = [0.16, 1, 0.3, 1] as const;

// Teal más oscuro que --land-teal (#0EA5A0 da 2.85:1 sobre el fondo mint de la píldora; este da 5.14:1, AA).
const PILL_TEAL = "#0F766E";

const WELCOME_CSS = `
  .wl-h1 { font-family: var(--font-grotesk), system-ui, sans-serif; font-size: 32px; font-weight: 700; letter-spacing: -.04em; line-height: 1.12; margin: 0 0 10px; }
  .wl-gtext {
    background: linear-gradient(135deg, var(--land-peach) 0%, var(--land-rose) 45%, var(--color-brand) 90%);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
  }
  [data-brand="tabpos"] .auth-col .wl-gtext { background: none; -webkit-text-fill-color: currentColor; }
  main.auth-col { align-items: flex-start; }
  .auth-col > .wl-card { margin: auto; }
  .wl-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
  .wl-path { display: flex; flex-direction: column; transition: transform .2s ease; }
  @media (hover: hover) and (pointer: fine) { .wl-path:hover { transform: translateY(-4px); } }
  .wl-dl-touch { display: none; }
  .wl-dl-pointer { display: block; }
  @media (hover: none) and (pointer: coarse) {
    .wl-dl-touch { display: block; }
    .wl-dl-pointer { display: none; }
  }
  @media (prefers-reduced-motion: reduce) { .wl-path { transition: none; } .wl-path:hover { transform: none; } }
`;

const pillBase: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 12px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
};

export default function WelcomePage() {
  const router = useRouter();
  const t = useTranslations("authPages.welcome");
  const reduce = useReducedMotion();
  const [name, setName] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isSupabaseConfigured) {
        if (!cancelled) setChecking(false);
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/auth/login");
        return;
      }
      const { data: profile } = await supabase
        .from("users")
        .select("display_name, username, plan, plan_status, plan_trial_end")
        .eq("id", user.id)
        .single();
      if (cancelled) return;

      setName(profile?.display_name ?? profile?.username ?? null);

      // Misma regla que el gate del dashboard (D-69): una prueba vencida no cuenta.
      // Aquí es solo una comodidad de navegación, NO una barrera de seguridad —
      // la barrera real vive en web/app/dashboard/layout.tsx.
      const trialExpired =
        profile?.plan_status === "trialing" &&
        profile?.plan_trial_end != null &&
        new Date(profile.plan_trial_end) <= new Date();
      const hasBusinessPlan =
        (profile?.plan === "business" || profile?.plan === "pro") &&
        (profile?.plan_status === "active" || profile?.plan_status === "trialing") &&
        !trialExpired;

      if (hasBusinessPlan) {
        router.replace("/dashboard");
        return;
      }
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (checking) {
    return (
      <AuthSplitLayout>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
          <IconLoader2 size={28} className="spin" style={{ color: "var(--color-brand)" }} />
        </div>
      </AuthSplitLayout>
    );
  }

  const firstName = name?.trim().split(/\s+/)[0] ?? "";
  const stage = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 16 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.7, ease: EASE, delay },
        };

  const bizFeatures = [
    { text: t("bizF1"), color: "var(--land-peach)" },
    { text: t("bizF2"), color: "var(--land-mint)" },
    { text: t("bizF3"), color: "var(--land-sky)" },
    { text: t("bizF4"), color: "var(--land-lavender)" },
  ];
  const appBenefits = [
    { title: t("appB1Title"), body: t("appB1Body"), bg: "var(--land-tint-peach)" },
    { title: t("appB2Title"), body: t("appB2Body"), bg: "var(--land-tint-mint)" },
    { title: t("appB3Title"), body: t("appB3Body"), bg: "var(--land-tint-sky)" },
    { title: t("appB4Title"), body: t("appB4Body"), bg: "rgb(var(--land-lavender-rgb) / .14)" },
  ];

  const pathCard: React.CSSProperties = {
    background: "var(--land-glass)",
    borderRadius: 22,
    boxShadow: "var(--land-shadow)",
    padding: 24,
  };
  const eyebrow: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: ".1em",
    color: "var(--land-sub)",
    margin: "18px 0 4px",
  };
  const h2: React.CSSProperties = {
    fontFamily: "var(--font-grotesk), system-ui, sans-serif",
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: "-.02em",
    margin: "0 0 8px",
  };
  const bodyText: React.CSSProperties = { fontSize: 14, lineHeight: 1.55, color: "var(--land-sub)", margin: "0 0 16px" };
  const iconBox = (bg: string, color: string): React.CSSProperties => ({
    width: 48,
    height: 48,
    borderRadius: 14,
    background: bg,
    color,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  });
  const disabledBtn: React.CSSProperties = {
    width: "100%",
    minHeight: 52,
    borderRadius: 14,
    border: "none",
    background: "var(--gray-200)",
    color: "var(--land-sub)",
    fontSize: 15,
    fontWeight: 700,
    cursor: "not-allowed",
  };

  return (
    <AuthSplitLayout>
      <div
        className="wl-card"
        style={{
          width: "100%",
          maxWidth: 760,
          background: "var(--land-glass)",
          border: "1px solid rgb(var(--ink-rgb) / .07)",
          borderRadius: 24,
          padding: 28,
          boxShadow: "var(--land-shadow)",
        }}
      >
        <style>{WELCOME_CSS}</style>

        <motion.div
          {...stage(0)}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 32,
                height: 32,
                borderRadius: 10,
                background: "linear-gradient(135deg, var(--land-peach), var(--land-peach-dark))",
                color: "var(--on-brand)",
              }}
            >
              <IconMessageCircle2 className="brand-jchat" size={18} aria-hidden />
              <IconReceipt2 className="brand-tabpos" size={18} aria-hidden />
            </span>
            <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-.02em" }}>
              <span className="brand-jchat">JChat</span>
              <span className="brand-tabpos">Tab POS</span>
            </span>
          </div>
          <LanguageSwitcher variant="pills" />
        </motion.div>

        <motion.div {...stage(0.08)}>
          <span style={{ ...pillBase, background: "rgb(var(--land-mint-rgb) / .14)", color: PILL_TEAL, marginBottom: 14 }}>
            <IconCheck size={14} aria-hidden />
            {t("created")}
          </span>
          <h1 className="wl-h1">
            {firstName ? t("titleNamed", { name: firstName }) : t("titleAnon")}
            <br />
            <span className="wl-gtext">{t("titleLine2")}</span>
          </h1>
          <p style={{ ...bodyText, fontSize: 15, margin: "0 0 24px" }}>{t("subtitle")}</p>
        </motion.div>

        <motion.div {...stage(0.16)} className="wl-grid">
          {/* Tarjeta A — negocio */}
          <section className="wl-path" style={{ ...pathCard, border: "1px solid var(--land-border-v)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <span style={iconBox("var(--land-peach-glow)", "var(--land-peach)")}>
                <IconBuildingStore size={26} aria-hidden />
              </span>
              <span style={{ ...pillBase, background: "var(--land-tint-peach)", color: "var(--land-peach)" }}>{t("bizBadge")}</span>
            </div>
            <p style={eyebrow}>{t("bizEyebrow")}</p>
            <h2 style={h2}>{t("bizTitle")}</h2>
            <p style={bodyText}>{t("bizBody")}</p>
            <ul style={{ listStyle: "none", margin: "0 0 20px", padding: 0, display: "grid", gap: 10, flex: 1, alignContent: "start" }}>
              {bizFeatures.map((item) => (
                <li key={item.text} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
                  {item.text}
                </li>
              ))}
            </ul>
            <Link
              href={BUSINESS_PLANS_HREF}
              style={{
                minHeight: 52,
                borderRadius: 14,
                background: "var(--land-peach)",
                color: "var(--on-brand)",
                boxShadow: "0 6px 24px var(--land-peach-glow)",
                fontFamily: "var(--font-grotesk)",
                fontSize: 15,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                textDecoration: "none",
              }}
            >
              {t("bizCta")}
              <IconArrowRight size={18} aria-hidden />
            </Link>
            <p style={{ fontSize: 12, color: "var(--land-sub)", textAlign: "center", margin: "10px 0 0" }}>{t("bizFoot")}</p>
          </section>

          {/* Tarjeta B — app */}
          <section className="wl-path" style={{ ...pathCard, border: "1px solid var(--land-border-c)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <span style={iconBox("var(--land-sky-glow)", "var(--land-blue)")}>
                <IconDeviceMobile size={26} aria-hidden />
              </span>
              <span style={{ ...pillBase, background: "var(--land-tint-sky)", color: "var(--land-sub)" }}>{t("appBadge")}</span>
            </div>
            <p style={eyebrow}>{t("appEyebrow")}</p>
            <h2 style={h2}>{t("appTitle")}</h2>
            <p style={bodyText}>{t("appBody")}</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20, flex: 1, alignContent: "start" }}>
              {appBenefits.map((item) => (
                <div key={item.title} style={{ background: item.bg, borderRadius: 14, padding: "12px 12px" }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{item.title}</div>
                  <div style={{ fontSize: 12, color: "var(--land-sub)", marginTop: 2 }}>{item.body}</div>
                </div>
              ))}
            </div>

            {/* Celular / tablet */}
            <div className="wl-dl-touch">
              {APP_STORES_LIVE ? (
                <Link
                  href={DOWNLOAD_PATH}
                  style={{
                    minHeight: 52,
                    borderRadius: 14,
                    background: "var(--gray-900)",
                    color: "var(--on-brand)",
                    fontSize: 15,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    textDecoration: "none",
                  }}
                >
                  <IconBrandAppstore size={18} aria-hidden />
                  {t("appDownload")}
                </Link>
              ) : (
                <button type="button" disabled style={disabledBtn}>
                  {t("appDownload")}
                </button>
              )}
              <p style={{ fontSize: 12, color: "var(--land-sub)", textAlign: "center", margin: "10px 0 0" }}>
                {APP_STORES_LIVE ? t("appDownloadHint") : t("comingSoon")}
              </p>
            </div>

            {/* Computadora */}
            <div className="wl-dl-pointer">
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <DownloadQr size={112} />
                <div style={{ display: "grid", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{t("appScan")}</span>
                  <StoreButtons />
                </div>
              </div>
              {!APP_STORES_LIVE && (
                <p style={{ fontSize: 12, color: "var(--land-sub)", margin: "10px 0 0" }}>{t("comingSoon")}</p>
              )}
            </div>
          </section>
        </motion.div>

        <motion.div {...stage(0.24)} style={{ textAlign: "center", marginTop: 18 }}>
          <Link
            href="/"
            style={{
              minHeight: 44,
              display: "inline-flex",
              alignItems: "center",
              padding: "0 16px",
              color: "var(--land-sub)",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {t("later")}
          </Link>
        </motion.div>
      </div>
    </AuthSplitLayout>
  );
}
