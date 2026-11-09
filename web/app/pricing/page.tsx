/**
 * JChat 3.0 — Public pricing page (/pricing).
 *
 * PUBLIC: outside /dashboard, so the dashboard auth gate never touches it. Anyone can
 * view the plans without a session.
 *
 * TWO SECTIONS:
 *   §1 "Para ti"     — SOCIAL_PLANS (free/verified/pro_social). Checkout fase 2; por
 *                       ahora: free→registro, verified/pro→"próximamente" (disabled).
 *   §2 "Para tu negocio" — a short block that sends to /pricing/business (BUSINESS_PLANS_HREF),
 *                       the single source of truth for business prices, billing periods, the
 *                       free trial, checkout and the Custom request form (spec 4, E5).
 *
 * This page uses GLOBAL tokens (--bg-*, --text-*, --color-*, --border-subtle); the --db-*
 * dashboard vars do not exist on a public page.
 *
 * Bilingüe via next-intl (cookie jchat-lang, namespace "pricing").
 */

"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  IconArrowRight,
  IconCrown,
  IconCheck,
  IconUser,
  IconBadge,
} from "@tabler/icons-react";
import { BUSINESS_PLANS_HREF, SOCIAL_PLANS, type SocialPlanId } from "@/lib/plans";
import LanguageSwitcher from "@/components/LanguageSwitcher";

// ── Social plan presentation ───────────────────────────────────────────────

const SOCIAL_ACCENT: Record<SocialPlanId, string> = {
  free: "var(--color-success)",
  verified: "var(--color-brand)",
  pro_social: "var(--color-gold)",
};

const SOCIAL_ICONS: Record<SocialPlanId, React.ReactNode> = {
  free: <IconUser size={22} />,
  verified: <IconBadge size={22} />,
  pro_social: <IconCrown size={22} />,
};

// ── Page ────────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const router = useRouter();
  const t = useTranslations("pricing");

  // ── Social plan content (all text from translations) ────────────────────
  const socialContent: Record<
    SocialPlanId,
    { label: string; priceLabel: string; description: string; features: string[]; cta: string }
  > = {
    free: {
      label: t("social.free.label"),
      priceLabel: t("social.free.priceLabel"),
      description: t("social.free.description"),
      features: [t("social.free.f1"), t("social.free.f2"), t("social.free.f3")],
      cta: t("social.free.cta"),
    },
    verified: {
      label: t("social.verified.label"),
      priceLabel: t("social.verified.priceLabel"),
      description: t("social.verified.description"),
      features: [t("social.verified.f1"), t("social.verified.f2"), t("social.verified.f3")],
      cta: t("social.verified.cta"),
    },
    pro_social: {
      label: t("social.pro.label"),
      priceLabel: t("social.pro.priceLabel"),
      description: t("social.pro.description"),
      features: [t("social.pro.f1"), t("social.pro.f2"), t("social.pro.f3"), t("social.pro.f4")],
      cta: t("social.pro.cta"),
    },
  };

  // ── Render ───────────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _prefersReduced = useReducedMotion();

  const EASE_P = [0.16, 1, 0.3, 1] as [number, number, number, number];
  const fadeUp = {
    hidden: { opacity: 0, y: 24 },
    show:   { opacity: 1, y: 0, transition: { duration: 0.68, ease: EASE_P } },
  };
  const stagger = {
    hidden: {},
    show:   { transition: { staggerChildren: 0.08 } },
  };

  return (
    <>
    <style>{`
        /* --land-* tokens live in styles/landing.css (single definition). */

      /* Display font */
      .sg { font-family:var(--font-grotesk), 'Space Grotesk', system-ui, sans-serif; }

      /* Featured badge pulse (peach) */
      @keyframes pr-badge-glow {
        0%,100%{ box-shadow:0 0 0 2px rgb(var(--land-peach-rgb) / .28); }
        50%    { box-shadow:0 0 0 6px rgb(var(--land-peach-rgb) / .09); }
      }
      .pr-badge-pulse { animation:pr-badge-glow 2.8s ease-in-out infinite; }

      /* Popular badge pulse (brand) */
      @keyframes pr-pop-glow {
        0%,100%{ box-shadow:0 0 0 2px rgb(var(--color-brand-rgb) / .22); }
        50%    { box-shadow:0 0 0 6px rgb(var(--color-brand-rgb) / .07); }
      }
      .pr-pop-pulse { animation:pr-pop-glow 2.8s ease-in-out infinite; }

      /* Spinner */
      @keyframes spin { to { transform:rotate(360deg); } }

      /* Aurora pastel */
      @keyframes pr-da { 0%,100%{transform:translate(0,0)scale(1);} 50%{transform:translate(28px,-16px)scale(1.05);} }
      @keyframes pr-db { 0%,100%{transform:translate(0,0)scale(1);} 50%{transform:translate(-22px,18px)scale(1.04);} }

      /* Responsive */
      @media(max-width:700px){
        .pr-grid        { grid-template-columns:1fr!important; }
        .pr-social-grid { grid-template-columns:1fr!important; }
      }
    `}</style>

    <div style={{ minHeight:"100vh", background:"var(--land-bg)", color:"var(--land-text)", overflowX:"hidden", position:"relative" }}>

      {/* Aurora blobs (pastel, suaves) */}
      <div aria-hidden="true" style={{ position:"fixed", inset:0, zIndex:0, overflow:"hidden", pointerEvents:"none" }}>
        <div style={{
          position:"absolute", borderRadius:"50%", width:"500px", height:"500px",
          background:"radial-gradient(circle,rgb(var(--land-peach-2-rgb) / .36) 0%,transparent 70%)",
          filter:"blur(90px)", top:"-8%", right:"0",
          animation:"pr-da 30s ease-in-out infinite",
        }}/>
        <div style={{
          position:"absolute", borderRadius:"50%", width:"420px", height:"420px",
          background:"radial-gradient(circle,rgb(var(--land-mint-rgb) / .24) 0%,transparent 70%)",
          filter:"blur(100px)", bottom:"5%", left:"-5%",
          animation:"pr-db 38s ease-in-out infinite", animationDelay:"-14s",
        }}/>
      </div>

      <div style={{ maxWidth:"1040px", margin:"0 auto", padding:"48px 24px", position:"relative", zIndex:1 }}>

        {/* Nav row */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"48px" }}>
          <a href="/" style={{
            display:"flex", alignItems:"center", gap:"8px",
            textDecoration:"none", color:"var(--land-sub)", fontSize:"13px", fontWeight:600,
          }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 4l-4 4 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            JChat
          </a>
          <LanguageSwitcher/>
        </div>

        {/* ══════════════════════════════════════════════════════
            §1 — PLANES SOCIALES (Para ti)
            Checkout fase 2: free→registro, verified/pro→disabled.
            ══════════════════════════════════════════════════════ */}
        <motion.section
          id="social"
          style={{ marginBottom:"72px" }}
          initial="hidden" animate="show" variants={stagger}
        >
          <motion.header variants={fadeUp} style={{ textAlign:"center", marginBottom:"36px" }}>
            <p style={{
              fontSize:"11px", fontWeight:700, textTransform:"uppercase",
              letterSpacing:".1em", color:"var(--land-peach)",
              marginBottom:"12px", fontFamily:"var(--font-grotesk), 'Space Grotesk', sans-serif",
            }}>
              JChat Social
            </p>
            <h1 className="sg" style={{ fontSize:"clamp(26px,3.2vw,38px)", fontWeight:800, margin:"0 0 10px", letterSpacing:"-.03em", color:"var(--land-text)" }}>
              {t("social.sectionTitle")}
            </h1>
            <p style={{ fontSize:"15px", color:"var(--land-sub)", margin:0, lineHeight:1.6 }}>
              {t("social.sectionSubtitle")}
            </p>
          </motion.header>

          <div className="pr-social-grid" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"16px", maxWidth:"820px", margin:"0 auto" }}>
            {SOCIAL_PLANS.map((plan, idx) => {
              const content = socialContent[plan.id];
              const accent  = SOCIAL_ACCENT[plan.id];
              const isFeatured = plan.id === "verified";
              return (
                <motion.div
                  key={plan.id}
                  className={isFeatured ? "pr-badge-pulse" : undefined}
                  variants={fadeUp}
                  transition={{ delay: idx * 0.08 }}
                  whileHover={isFeatured
                    ? { y:-5, boxShadow:"0 24px 56px rgba(255,138,101,.16)" }
                    : { y:-4, boxShadow:"0 18px 48px rgba(0,0,0,.10)" }
                  }
                  style={{
                    background: isFeatured ? "rgb(var(--white-rgb) / .92)" : "var(--land-glass)",
                    backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)",
                    border: isFeatured
                      ? "1px solid rgb(var(--land-peach-rgb) / .35)"
                      : "1px solid rgb(var(--ink-rgb) / .07)",
                    borderRadius:"16px",
                    padding: isFeatured ? "24px" : "22px",
                    display:"flex", flexDirection:"column", gap:"12px", position:"relative",
                    boxShadow:"0 4px 20px rgb(var(--ink-rgb) / .06)",
                  }}
                >
                  {/* Featured badge */}
                  {isFeatured && (
                    <div style={{
                      position:"absolute", top:"-11px", left:"50%", transform:"translateX(-50%)",
                      background:"linear-gradient(135deg,var(--land-peach),var(--land-peach-dark))",
                      color:"var(--on-brand)", fontSize:"10px", fontWeight:800,
                      letterSpacing:".08em", textTransform:"uppercase",
                      padding:"3px 14px", borderRadius:"99px", whiteSpace:"nowrap",
                      boxShadow:"0 4px 14px rgb(var(--land-peach-dark-rgb) / .35)",
                    }}>
                      {t("social.featuredBadge")}
                    </div>
                  )}
                  {/* Header */}
                  <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                    <span style={{ color: accent }}>{SOCIAL_ICONS[plan.id]}</span>
                    <span style={{ fontSize:"17px", fontWeight:700, color:"var(--land-text)" }}>{content.label}</span>
                  </div>
                  {/* Price */}
                  <div style={{ fontSize:"22px", fontWeight:800, color:"var(--land-text)" }}>{content.priceLabel}</div>
                  {/* Description */}
                  <p style={{ fontSize:"13px", color:"var(--land-sub)", margin:0, lineHeight:1.5 }}>
                    {content.description}
                  </p>
                  {/* Features */}
                  <ul style={{ listStyle:"none", padding:0, margin:"4px 0 0", display:"flex", flexDirection:"column", gap:"6px" }}>
                    {content.features.map((f) => (
                      <li key={f} style={{ display:"flex", alignItems:"flex-start", gap:"6px", fontSize:"12px", color:"var(--land-sub)" }}>
                        <IconCheck size={13} style={{ color: accent, flexShrink:0, marginTop:"1px" }}/>
                        {f}
                      </li>
                    ))}
                  </ul>
                  {/* CTA */}
                  <button
                    onClick={plan.cta === "register" ? () => router.push("/auth/register") : undefined}
                    disabled={plan.cta === "soon"}
                    style={{
                      marginTop:"auto", display:"flex", alignItems:"center",
                      justifyContent:"center", gap:"6px", padding:"10px 16px",
                      borderRadius:"8px",
                      border: plan.cta === "register" ? "none" : "1px solid rgb(var(--ink-rgb) / .12)",
                      background: plan.cta === "register"
                        ? "linear-gradient(135deg,var(--land-peach),var(--land-peach-dark))"
                        : "rgb(var(--ink-rgb) / .04)",
                      color: plan.cta === "register" ? "var(--on-brand)" : "var(--land-sub)",
                      fontSize:"13px", fontWeight:600,
                      cursor: plan.cta === "soon" ? "not-allowed" : "pointer",
                      opacity: plan.cta === "soon" ? 0.45 : 1,
                    }}
                  >
                    {content.cta}
                  </button>
                </motion.div>
              );
            })}
          </div>
        </motion.section>

        {/* Divider */}
        <motion.div
          initial={{ opacity:0 }} whileInView={{ opacity:1 }} viewport={{ once:true }}
          style={{ maxWidth:"820px", margin:"0 auto 64px", display:"flex", alignItems:"center", gap:"16px" }}
        >
          <div style={{ flex:1, height:"1px", background:"rgb(var(--ink-rgb) / .08)" }}/>
          <span style={{
            fontSize:"10px", fontWeight:700, textTransform:"uppercase",
            letterSpacing:".12em", color:"var(--land-muted)", whiteSpace:"nowrap",
            fontFamily:"var(--font-grotesk), 'Space Grotesk', sans-serif",
          }}>
            Venue POS
          </span>
          <div style={{ flex:1, height:"1px", background:"rgb(var(--ink-rgb) / .08)" }}/>
        </motion.div>

        {/* ══════════════════════════════════════════════════════
            §2 — PLANES PARA NEGOCIOS: remite a /pricing/business, la única fuente de
            precios, periodos de cobro, prueba gratis y checkout de los planes de negocio.
            ══════════════════════════════════════════════════════ */}
        <section id="negocios">
          <motion.div
            initial={{ opacity:0, y:20 }}
            whileInView={{ opacity:1, y:0 }}
            viewport={{ once:true, margin:"-40px" }}
            transition={{ duration:.6, ease:[0.16,1,0.3,1] as [number,number,number,number] }}
            style={{
              maxWidth:"640px", margin:"0 auto", textAlign:"center",
              background:"var(--land-glass)", backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)",
              border:"1px solid rgb(var(--ink-rgb) / .08)", borderRadius:"18px", padding:"32px 28px",
              boxShadow:"0 4px 24px rgb(var(--ink-rgb) / .07)",
            }}
          >
            <p style={{
              fontSize:"11px", fontWeight:700, textTransform:"uppercase", letterSpacing:".1em",
              color:"var(--land-teal)", margin:"0 0 12px", fontFamily:"var(--font-grotesk), 'Space Grotesk', sans-serif",
            }}>
              Venue POS
            </p>
            <h2 className="sg" style={{ fontSize:"clamp(26px,3.2vw,36px)", fontWeight:800, margin:"0 0 12px", letterSpacing:"-.03em", color:"var(--land-text)" }}>
              {t("business.teaserTitle")}
            </h2>
            <p style={{ fontSize:"15px", color:"var(--land-sub)", margin:"0 auto 24px", maxWidth:"480px", lineHeight:1.6 }}>
              {t("business.teaserBody")}
            </p>
            <Link
              href={BUSINESS_PLANS_HREF}
              style={{
                display:"inline-flex", alignItems:"center", justifyContent:"center", gap:"8px",
                minHeight:"48px", padding:"0 24px", borderRadius:"10px",
                background:"var(--land-peach)", color:"var(--on-brand)",
                fontSize:"15px", fontWeight:700, textDecoration:"none",
              }}
            >
              {t("business.teaserCta")}
              <IconArrowRight size={16} aria-hidden />
            </Link>
          </motion.div>
        </section>
      </div>

      {/* Legal footer */}
      <footer style={{ borderTop:"1px solid var(--border-subtle)", marginTop:"48px", padding:"20px 24px", display:"flex", justifyContent:"center", gap:"24px", fontSize:"13px", color:"var(--text-secondary)", flexWrap:"wrap" }}>
        <a href="/privacy" style={{ color:"var(--text-secondary)", textDecoration:"none" }}>{t("footer.privacy")}</a>
        <a href="/terms" style={{ color:"var(--text-secondary)", textDecoration:"none" }}>{t("footer.terms")}</a>
        <a href="/support" style={{ color:"var(--text-secondary)", textDecoration:"none" }}>{t("footer.support")}</a>
      </footer>
    </div>
    </>
  );
}
