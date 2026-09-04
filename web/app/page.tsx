/**
 * JChat 3.0 — Landing page pública (/).
 *
 * Design: Urban Pulse — nocturno-urbano, asimétrico, vivo.
 * Signature element: Pulse Map SVG (ciudad abstracta con pins animados).
 * Font: Space Grotesk (display) + Geist (body, ya cargado por el root layout).
 * Tokens: GLOBAL únicamente (--bg-*, --text-*, --color-*). NUNCA --db-*.
 * Motion: CSS-only. prefers-reduced-motion → todo estático.
 * i18n: next-intl, namespace "landing", cookie jchat-lang.
 */

"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  IconMapPin,
  IconMessageCircle,
  IconUsers,
  IconArrowRight,
  IconBrandApple,
  IconBrandGooglePlay,
  IconSparkles,
} from "@tabler/icons-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";

// ── Marquee data (duplicated for seamless loop) ───────────────────────────
const ROW_A = [
  "New York","Los Angeles","Chicago","Miami","Austin","Seattle","Denver",
  "Boston","San Francisco","Portland","Nashville","Atlanta","Phoenix","Dallas",
  "New York","Los Angeles","Chicago","Miami","Austin","Seattle","Denver",
  "Boston","San Francisco","Portland","Nashville","Atlanta","Phoenix","Dallas",
];
const ROW_B = [
  "Barcelona","Madrid","México DF","Bogotá","Buenos Aires","Lima","Monterrey",
  "Guadalajara","Medellín","Santiago","São Paulo","Caracas","Quito","La Paz",
  "Barcelona","Madrid","México DF","Bogotá","Buenos Aires","Lima","Monterrey",
  "Guadalajara","Medellín","Santiago","São Paulo","Caracas","Quito","La Paz",
];

// ── Venue pins (% of container) ───────────────────────────────────────────
// Colors reference CSS tokens so there are zero hardcoded hex values.
const VENUES: Array<{
  l: string; t: string; r: number;
  c: string; d: string; label?: string;
}> = [
  { l:"22%", t:"19%", r:5, c:"var(--color-brand)",   d:"0s",    label:"Cloud Bar"    },
  { l:"46%", t:"12%", r:6, c:"var(--color-gold)",    d:"1.1s",  label:"La Terraza"   },
  { l:"75%", t:"23%", r:4, c:"var(--color-success)", d:"2.0s"                        },
  { l:"84%", t:"46%", r:5, c:"var(--color-brand)",   d:"0.5s",  label:"Corner Café"  },
  { l:"30%", t:"55%", r:4, c:"var(--color-gold)",    d:"1.5s"                        },
  { l:"62%", t:"62%", r:4, c:"var(--color-brand)",   d:"2.6s"                        },
  { l:"17%", t:"73%", r:6, c:"var(--color-success)", d:"0.8s",  label:"The Rooftop"  },
  { l:"79%", t:"75%", r:4, c:"var(--color-gold)",    d:"1.9s"                        },
  { l:"44%", t:"86%", r:5, c:"var(--color-brand)",   d:"3.1s"                        },
];

// ── Pulse Map ─────────────────────────────────────────────────────────────
function PulseMap({ youLabel }: { youLabel: string }) {
  return (
    <div
      aria-hidden="true"
      style={{ position:"relative", width:"100%", height:"100%", minHeight:"440px" }}
    >
      {/* Street grid as SVG — very subtle */}
      <svg
        style={{ position:"absolute", inset:0, width:"100%", height:"100%" }}
        preserveAspectRatio="none"
      >
        {/* Horizontal */}
        <line x1="0%" y1="17%" x2="100%" y2="16%" stroke="rgba(92,124,250,0.09)"  strokeWidth="1"/>
        <line x1="0%" y1="34%" x2="100%" y2="33%" stroke="rgba(92,124,250,0.06)"  strokeWidth="0.8"/>
        <line x1="0%" y1="50%" x2="100%" y2="49%" stroke="rgba(92,124,250,0.09)"  strokeWidth="1"/>
        <line x1="0%" y1="67%" x2="100%" y2="66%" stroke="rgba(92,124,250,0.06)"  strokeWidth="0.8"/>
        <line x1="0%" y1="84%" x2="100%" y2="83%" stroke="rgba(92,124,250,0.04)"  strokeWidth="0.6"/>
        {/* Vertical */}
        <line x1="20%" y1="0%" x2="19%" y2="100%" stroke="rgba(92,124,250,0.07)"  strokeWidth="0.8"/>
        <line x1="40%" y1="0%" x2="39%" y2="100%" stroke="rgba(92,124,250,0.1)"   strokeWidth="1"/>
        <line x1="60%" y1="0%" x2="61%" y2="100%" stroke="rgba(92,124,250,0.07)"  strokeWidth="0.8"/>
        <line x1="80%" y1="0%" x2="81%" y2="100%" stroke="rgba(92,124,250,0.05)"  strokeWidth="0.6"/>
        {/* Radius dashes */}
        <circle
          cx="50%" cy="48%" r="21%"
          fill="none"
          stroke="rgba(92,124,250,0.2)"
          strokeWidth="1"
          strokeDasharray="5 8"
        />
        {/* Outer ghost ring */}
        <circle
          cx="50%" cy="48%" r="35%"
          fill="none"
          stroke="rgba(92,124,250,0.06)"
          strokeWidth="0.7"
          strokeDasharray="3 14"
        />
      </svg>

      {/* Venue dots */}
      {VENUES.map((v, i) => (
        <div
          key={i}
          style={{
            position:"absolute",
            left:v.l, top:v.t,
            transform:"translate(-50%,-50%)",
            width:`${v.r * 2}px`, height:`${v.r * 2}px`,
          }}
        >
          {/* Ping ring — hardware-accelerated scale transform */}
          <div
            className="pm-ring"
            style={{
              position:"absolute", inset:0,
              borderRadius:"50%",
              background:v.c,
              animationDelay:v.d,
            }}
          />
          {/* Solid dot */}
          <div
            className="pm-dot"
            style={{
              position:"absolute", inset:0,
              borderRadius:"50%",
              background:v.c,
              zIndex:1,
            }}
          />
          {/* Venue label */}
          {v.label && (
            <div style={{
              position:"absolute",
              top:`calc(100% + 5px)`, left:"50%",
              transform:"translateX(-50%)",
              background:"rgba(4,6,12,0.88)",
              backdropFilter:"blur(6px)",
              WebkitBackdropFilter:"blur(6px)",
              borderRadius:"4px",
              padding:"2px 7px",
              fontSize:"8.5px", fontWeight:700,
              whiteSpace:"nowrap",
              color:"rgba(255,255,255,0.65)",
              border:"1px solid rgba(255,255,255,0.06)",
              letterSpacing:"0.05em",
              textTransform:"uppercase",
              zIndex:5,
            }}>
              {v.label}
            </div>
          )}
        </div>
      ))}

      {/* "You" pin */}
      <div style={{
        position:"absolute",
        left:"50%", top:"48%",
        transform:"translate(-50%,-50%)",
        zIndex:10,
      }}>
        <div className="pm-you" style={{
          width:"18px", height:"18px",
          borderRadius:"50%",
          background:"#fff",
          border:"2.5px solid var(--color-brand)",
        }}/>
      </div>

      {/* "You are here" label */}
      <div style={{
        position:"absolute",
        left:"50%", top:"calc(48% + 18px)",
        transform:"translateX(-50%)",
        fontSize:"9px",
        fontFamily:"var(--font-geist-mono, 'Courier New', monospace)",
        fontWeight:700,
        color:"rgba(255,255,255,0.38)",
        letterSpacing:"0.1em",
        textTransform:"uppercase",
        whiteSpace:"nowrap",
        zIndex:10,
      }}>
        {youLabel}
      </div>

      {/* Radial fade — blends map into page bg at edges */}
      <div style={{
        position:"absolute", inset:0,
        background:
          "radial-gradient(ellipse 85% 85% at 50% 50%, transparent 45%, var(--bg-base) 100%)",
        pointerEvents:"none",
        zIndex:3,
      }}/>
    </div>
  );
}

// ── Landing page ──────────────────────────────────────────────────────────
export default function LandingPage() {
  const t = useTranslations("landing");

  useEffect(() => {
    // Load Space Grotesk (display font — not in root layout)
    if (!document.querySelector('[data-font="space-grotesk"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.dataset["font"] = "space-grotesk";
      link.href =
        "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700;800&display=swap";
      document.head.appendChild(link);
    }

    // Scroll-reveal via IntersectionObserver
    const els = document.querySelectorAll<HTMLElement>(".reveal");
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add("revealed");
        }),
      { threshold: 0.06, rootMargin: "0px 0px -48px 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <>
      <style>{`
        /* ── Space Grotesk (display) ────────────────────────────── */
        .sg { font-family: 'Space Grotesk', system-ui, sans-serif; }

        /* ── Animations ─────────────────────────────────────────── */

        /* Ambient blobs */
        @keyframes blob-a {
          0%,100%{ transform:translate(0,0)      scale(1);    opacity:.5; }
          40%    { transform:translate(34px,-22px) scale(1.05); opacity:.65; }
          75%    { transform:translate(-18px,14px) scale(.97); opacity:.52; }
        }
        @keyframes blob-b {
          0%,100%{ transform:translate(0,0)      scale(1);    opacity:.28; }
          35%    { transform:translate(-28px,18px) scale(1.04); opacity:.42; }
          70%    { transform:translate(20px,-12px) scale(.96); opacity:.3; }
        }

        /* Map ping — scale only, no layout reflow */
        @keyframes pm-ping {
          0%      { transform:scale(1);   opacity:.7; }
          75%,100%{ transform:scale(4.5); opacity:0;  }
        }
        .pm-ring {
          animation: pm-ping 3.4s cubic-bezier(0,0,.2,1) infinite;
          transform-origin: center;
        }
        /* Dot subtle pulse */
        @keyframes pm-dot-pulse {
          0%,100%{ opacity:.9; }
          50%    { opacity:.65; }
        }
        .pm-dot { animation: pm-dot-pulse 2.8s ease-in-out infinite; }

        /* "You" glow ring */
        .pm-you {
          box-shadow:
            0 0 0 5px color-mix(in srgb, var(--color-brand) 18%, transparent),
            0 0 18px color-mix(in srgb, var(--color-brand) 55%, transparent);
        }

        /* Live dot */
        @keyframes live {
          0%,100%{ opacity:1; }
          50%    { opacity:.35; }
        }
        .live-dot { animation: live 1.9s ease-in-out infinite; }

        /* Marquee */
        @keyframes mq-fwd {
          from{ transform:translateX(0); }
          to  { transform:translateX(-50%); }
        }
        @keyframes mq-rev {
          from{ transform:translateX(-50%); }
          to  { transform:translateX(0); }
        }
        .mq-fwd { animation: mq-fwd 40s linear infinite; }
        .mq-rev { animation: mq-rev 46s linear infinite; }

        /* Pause on hover — targets the animated child from the hover parent */
        .mq-wrap:hover .mq-fwd,
        .mq-wrap:hover .mq-rev {
          animation-play-state: paused;
        }

        /* ── Scroll reveal ───────────────────────────────────────── */
        .reveal {
          opacity:0;
          transform:translateY(30px);
          transition:
            opacity  .72s cubic-bezier(.16,1,.3,1),
            transform .72s cubic-bezier(.16,1,.3,1);
        }
        .reveal.revealed { opacity:1; transform:translateY(0); }
        .d1.revealed { transition-delay:.1s; }
        .d2.revealed { transition-delay:.2s; }
        .d3.revealed { transition-delay:.3s; }

        /* ── Bento hover ─────────────────────────────────────────── */
        .bc {
          transition:
            transform .26s cubic-bezier(.16,1,.3,1),
            box-shadow .26s cubic-bezier(.16,1,.3,1);
        }
        .bc:hover {
          transform:translateY(-4px);
          box-shadow:0 26px 56px rgba(0,0,0,.48);
        }

        /* ── Nav glass ───────────────────────────────────────────── */
        .nav-glass {
          backdrop-filter:blur(22px) saturate(160%);
          -webkit-backdrop-filter:blur(22px) saturate(160%);
        }

        /* ── Responsive ──────────────────────────────────────────── */
        @media (max-width:860px) {
          .hero-grid { grid-template-columns:1fr !important; }
          .map-col   { display:none; }
          .b-grid    {
            grid-template-columns:1fr !important;
          }
          .b-map     { grid-row:span 1 !important; min-height:300px; }
          .b-wide    {
            grid-column:span 1 !important;
            flex-direction:column !important;
            align-items:flex-start !important;
          }
        }
        @media (max-width:480px) {
          .hero-ctas { flex-direction:column; }
          .hero-ctas a, .hero-ctas div { width:100%; justify-content:center; }
        }

        /* ── Reduced motion ──────────────────────────────────────── */
        @media (prefers-reduced-motion:reduce) {
          .pm-ring, .pm-dot, .pm-you,
          .live-dot,
          .mq-fwd, .mq-rev,
          .reveal, .bc {
            animation:none !important;
            transition:none !important;
          }
          .reveal  { opacity:1 !important; transform:none !important; }
          .pm-you  { box-shadow:0 0 0 2px var(--color-brand); }
        }
      `}</style>

      <div style={{
        minHeight:"100vh",
        background:"var(--bg-base)",
        color:"var(--text-primary)",
        overflowX:"hidden",
      }}>

        {/* ═══════════════════════════════════════════
            NAV
        ═══════════════════════════════════════════ */}
        <nav
          className="nav-glass"
          style={{
            position:"sticky", top:0, zIndex:50,
            display:"flex", alignItems:"center", justifyContent:"space-between",
            padding:"12px 28px",
            borderBottom:"1px solid rgba(255,255,255,0.055)",
            background:"rgba(6,8,15,0.76)",
          }}
        >
          <div style={{ display:"flex", alignItems:"center", gap:"9px" }}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-label="JChat">
              <rect width="28" height="28" rx="8" fill="var(--color-brand)"/>
              <path d="M7 10h14M7 14.5h10M7 19h7" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <span className="sg" style={{ fontSize:"16px", fontWeight:800, letterSpacing:"-0.02em" }}>
              JChat
            </span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
            <LanguageSwitcher />
            <Link href="/auth/login" style={{
              fontSize:"13px", fontWeight:600,
              color:"var(--text-secondary)",
              textDecoration:"none",
              padding:"7px 14px",
              borderRadius:"8px",
              border:"1px solid var(--border-subtle)",
            }}>
              {t("nav.signIn")}
            </Link>
            <Link href="/auth/register" style={{
              fontSize:"13px", fontWeight:700, color:"#fff",
              textDecoration:"none",
              padding:"7px 16px",
              borderRadius:"8px",
              background:"var(--color-brand)",
              boxShadow:"0 0 0 1px rgba(92,124,250,.4), 0 2px 14px rgba(92,124,250,.28)",
            }}>
              {t("hero.createAccount")}
            </Link>
          </div>
        </nav>

        {/* ═══════════════════════════════════════════
            HERO
        ═══════════════════════════════════════════ */}
        <section style={{
          position:"relative",
          minHeight:"100svh",
          display:"flex", alignItems:"center",
          padding:"64px 28px 80px",
          overflow:"hidden",
        }}>
          {/* Ambient blobs (decorative, CSS only) */}
          <div aria-hidden="true" style={{
            position:"absolute", inset:0,
            pointerEvents:"none", zIndex:0,
          }}>
            <div style={{
              position:"absolute", top:"6%", left:"50%",
              width:"640px", height:"640px", borderRadius:"50%",
              background:"radial-gradient(circle, rgba(92,124,250,.16) 0%, transparent 70%)",
              filter:"blur(52px)",
              animation:"blob-a 12s ease-in-out infinite",
            }}/>
            <div style={{
              position:"absolute", top:"42%", left:"64%",
              width:"420px", height:"420px", borderRadius:"50%",
              background:"radial-gradient(circle, rgba(124,58,237,.1) 0%, transparent 70%)",
              filter:"blur(60px)",
              animation:"blob-b 15s ease-in-out infinite",
            }}/>
            {/* Blueprint grid */}
            <div style={{
              position:"absolute", inset:0,
              backgroundImage:
                "linear-gradient(rgba(92,124,250,.035) 1px, transparent 1px)," +
                "linear-gradient(90deg, rgba(92,124,250,.035) 1px, transparent 1px)",
              backgroundSize:"64px 64px",
              maskImage:
                "linear-gradient(to bottom, transparent 0%, #000 12%, #000 88%, transparent 100%)",
            }}/>
          </div>

          <div
            className="hero-grid"
            style={{
              maxWidth:"1200px", margin:"0 auto", width:"100%",
              display:"grid", gridTemplateColumns:"1fr 1fr",
              gap:"56px", alignItems:"center",
              position:"relative", zIndex:1,
            }}
          >
            {/* ── LEFT ── */}
            <div>
              {/* Live badge */}
              <div style={{
                display:"inline-flex", alignItems:"center", gap:"8px",
                marginBottom:"28px",
              }}>
                <span className="live-dot" style={{
                  width:"7px", height:"7px", borderRadius:"50%",
                  background:"var(--color-success)",
                  boxShadow:"0 0 7px var(--color-success)",
                  display:"inline-block", flexShrink:0,
                }}/>
                <span style={{
                  fontSize:"11px", fontWeight:700,
                  letterSpacing:"0.1em",
                  textTransform:"uppercase",
                  fontFamily:"var(--font-geist-mono, monospace)",
                  color:"var(--color-success)",
                }}>
                  {t("hero.live")}
                </span>
              </div>

              {/* H1 — Space Grotesk, large */}
              <h1
                className="sg"
                style={{
                  fontSize:"clamp(40px,5.5vw,70px)",
                  fontWeight:800,
                  lineHeight:1.05,
                  letterSpacing:"-0.035em",
                  margin:"0 0 22px",
                }}
              >
                {t("hero.title")}
              </h1>

              {/* Subtitle */}
              <p style={{
                fontSize:"17px",
                color:"var(--text-secondary)",
                lineHeight:1.7,
                margin:"0 0 40px",
                maxWidth:"400px",
              }}>
                {t("hero.subtitle")}
              </p>

              {/* CTAs */}
              <div
                className="hero-ctas"
                style={{ display:"flex", gap:"12px", flexWrap:"wrap" }}
              >
                <Link href="/auth/register" style={{
                  display:"inline-flex", alignItems:"center", gap:"8px",
                  padding:"13px 26px",
                  borderRadius:"10px",
                  background:"var(--color-brand)",
                  color:"#fff", fontSize:"15px", fontWeight:700,
                  textDecoration:"none",
                  boxShadow:
                    "0 0 0 1px rgba(92,124,250,.45)," +
                    "0 4px 24px rgba(92,124,250,.34)",
                }}>
                  {t("hero.createAccount")}
                  <IconArrowRight size={16}/>
                </Link>
                <div style={{
                  display:"inline-flex", alignItems:"center", gap:"9px",
                  padding:"13px 22px",
                  borderRadius:"10px",
                  border:"1px solid var(--border-subtle)",
                  color:"var(--text-secondary)",
                  fontSize:"13.5px", fontWeight:600,
                  background:"rgba(255,255,255,.025)",
                }}>
                  <IconBrandApple size={15}/>
                  <IconBrandGooglePlay size={14}/>
                  {t("hero.downloadApp")}
                </div>
              </div>
            </div>

            {/* ── RIGHT — Pulse Map ── */}
            <div
              className="map-col"
              style={{ position:"relative", height:"520px" }}
            >
              <PulseMap youLabel={t("map.youAreHere")}/>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════
            MARQUEE
        ═══════════════════════════════════════════ */}
        <div style={{
          position:"relative", overflow:"hidden",
          padding:"22px 0",
          borderTop:"1px solid rgba(255,255,255,.045)",
          borderBottom:"1px solid rgba(255,255,255,.045)",
          background:"rgba(255,255,255,.01)",
        }}>
          {/* Edge fade */}
          <div aria-hidden="true" style={{
            position:"absolute", inset:0,
            background:
              "linear-gradient(90deg,var(--bg-base) 0%,transparent 8%," +
              "transparent 92%,var(--bg-base) 100%)",
            zIndex:5, pointerEvents:"none",
          }}/>

          {/* Row 1 → */}
          <div className="mq-wrap" style={{ overflow:"hidden", marginBottom:"8px" }}>
            <div
              className="mq-fwd"
              style={{ display:"flex", gap:0, whiteSpace:"nowrap" }}
            >
              {ROW_A.map((city, i) => (
                <span
                  key={i}
                  style={{
                    display:"inline-flex", alignItems:"center", gap:"5px",
                    padding:"0 22px",
                    fontSize:"11.5px", fontWeight:600,
                    color:"rgba(255,255,255,.28)",
                    letterSpacing:"0.06em",
                    textTransform:"uppercase",
                  }}
                >
                  <IconMapPin size={8} style={{ color:"rgba(92,124,250,.45)", flexShrink:0 }}/>
                  {city}
                </span>
              ))}
            </div>
          </div>

          {/* Row 2 ← */}
          <div className="mq-wrap" style={{ overflow:"hidden" }}>
            <div
              className="mq-rev"
              style={{ display:"flex", gap:0, whiteSpace:"nowrap" }}
            >
              {ROW_B.map((city, i) => (
                <span
                  key={i}
                  style={{
                    display:"inline-flex", alignItems:"center", gap:"5px",
                    padding:"0 22px",
                    fontSize:"11.5px", fontWeight:600,
                    color:"rgba(255,255,255,.16)",
                    letterSpacing:"0.06em",
                    textTransform:"uppercase",
                  }}
                >
                  <IconMapPin size={8} style={{ color:"rgba(167,139,250,.35)", flexShrink:0 }}/>
                  {city}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════
            FEATURES — bento asimétrico 5 cols
        ═══════════════════════════════════════════ */}
        <section style={{ padding:"96px 28px" }}>
          <div style={{ maxWidth:"1200px", margin:"0 auto" }}>

            {/* Header */}
            <div className="reveal" style={{ textAlign:"center", marginBottom:"56px" }}>
              <p style={{
                fontSize:"11px", fontWeight:700,
                textTransform:"uppercase", letterSpacing:"0.1em",
                color:"var(--color-brand)", marginBottom:"14px",
                fontFamily:"var(--font-geist-mono, monospace)",
              }}>
                {t("features.title")}
              </p>
              <h2
                className="sg"
                style={{
                  fontSize:"clamp(28px,3.5vw,44px)",
                  fontWeight:800, letterSpacing:"-0.03em",
                  lineHeight:1.1, margin:"0 0 16px",
                }}
              >
                {t("social.title")}
              </h2>
              <p style={{
                fontSize:"16px",
                color:"var(--text-secondary)",
                maxWidth:"460px", margin:"0 auto",
                lineHeight:1.65,
              }}>
                {t("social.body")}
              </p>
            </div>

            {/* Grid 5 cols × 2 rows */}
            <div
              className="b-grid"
              style={{
                display:"grid",
                gridTemplateColumns:"repeat(5,1fr)",
                gridTemplateRows:"auto auto",
                gap:"14px",
              }}
            >
              {/* ── MAP — 3 cols × 2 rows ── */}
              <div
                className="bc reveal b-map"
                style={{
                  gridColumn:"span 3",
                  gridRow:"span 2",
                  background:"var(--bg-surface)",
                  border:"1px solid rgba(255,255,255,.07)",
                  borderRadius:"20px",
                  overflow:"hidden",
                  display:"flex", flexDirection:"column",
                  minHeight:"400px",
                }}
              >
                {/* Card header */}
                <div style={{
                  padding:"20px 20px 0",
                  display:"flex", alignItems:"center", gap:"10px",
                }}>
                  <div style={{
                    width:"36px", height:"36px", borderRadius:"10px",
                    background:"rgba(92,124,250,.1)",
                    border:"1px solid rgba(92,124,250,.17)",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    flexShrink:0,
                  }}>
                    <IconMapPin size={16} style={{ color:"var(--color-brand)" }}/>
                  </div>
                  <div>
                    <div style={{ fontSize:"13px", fontWeight:700 }}>
                      {t("features.map.title")}
                    </div>
                    <div style={{
                      fontSize:"11px", color:"var(--text-tertiary)", lineHeight:1.4,
                    }}>
                      {t("features.map.description")}
                    </div>
                  </div>
                </div>

                {/* Embedded map */}
                <div style={{ flex:1, padding:"14px" }}>
                  <div style={{
                    width:"100%", height:"100%",
                    borderRadius:"12px",
                    background:"#070b14",
                    overflow:"hidden",
                    position:"relative",
                    minHeight:"260px",
                  }}>
                    <PulseMap youLabel={t("map.youAreHere")}/>
                  </div>
                </div>
              </div>

              {/* ── CHAT — 2 cols, row 1 ── */}
              <div
                className="bc reveal d1"
                style={{
                  gridColumn:"span 2",
                  background:"var(--bg-surface)",
                  border:"1px solid rgba(255,255,255,.07)",
                  borderRadius:"20px",
                  padding:"22px",
                  display:"flex", flexDirection:"column", gap:"14px",
                }}
              >
                <div style={{
                  width:"42px", height:"42px", borderRadius:"12px",
                  background:"rgba(29,158,117,.1)",
                  border:"1px solid rgba(29,158,117,.17)",
                  display:"flex", alignItems:"center", justifyContent:"center",
                }}>
                  <IconMessageCircle size={20} style={{ color:"var(--color-success)" }}/>
                </div>
                <div>
                  <h3 style={{
                    fontSize:"15px", fontWeight:700,
                    margin:"0 0 6px", lineHeight:1.3,
                  }}>
                    {t("features.chat.title")}
                  </h3>
                  <p style={{
                    fontSize:"13px", color:"var(--text-secondary)",
                    lineHeight:1.6, margin:0,
                  }}>
                    {t("features.chat.description")}
                  </p>
                </div>
                {/* Mini chat preview */}
                <div style={{
                  display:"flex", flexDirection:"column", gap:"5px", marginTop:"auto",
                }}>
                  {[
                    { msg: "Someone close just joined 👋", out: false },
                    { msg: "The chat is alive tonight",    out: true  },
                  ].map((b, i) => (
                    <div key={i} style={{
                      alignSelf:b.out ? "flex-end" : "flex-start",
                      background:b.out ? "var(--color-success)" : "rgba(255,255,255,.07)",
                      borderRadius:b.out
                        ? "12px 12px 4px 12px"
                        : "12px 12px 12px 4px",
                      padding:"6px 11px",
                      fontSize:"10.5px", fontWeight:600,
                      color:b.out ? "#fff" : "var(--text-secondary)",
                      maxWidth:"90%",
                    }}>
                      {b.msg}
                    </div>
                  ))}
                </div>
              </div>

              {/* ── GROUPS — 2 cols, row 2 ── */}
              <div
                className="bc reveal d2"
                style={{
                  gridColumn:"span 2",
                  background:"var(--bg-surface)",
                  border:"1px solid rgba(255,255,255,.07)",
                  borderRadius:"20px",
                  padding:"22px",
                  display:"flex", flexDirection:"column", gap:"14px",
                }}
              >
                <div style={{
                  width:"42px", height:"42px", borderRadius:"12px",
                  background:"rgba(215,119,6,.1)",
                  border:"1px solid rgba(215,119,6,.17)",
                  display:"flex", alignItems:"center", justifyContent:"center",
                }}>
                  <IconUsers size={20} style={{ color:"var(--color-gold)" }}/>
                </div>
                <div>
                  <h3 style={{
                    fontSize:"15px", fontWeight:700,
                    margin:"0 0 6px", lineHeight:1.3,
                  }}>
                    {t("features.groups.title")}
                  </h3>
                  <p style={{
                    fontSize:"13px", color:"var(--text-secondary)",
                    lineHeight:1.6, margin:0,
                  }}>
                    {t("features.groups.description")}
                  </p>
                </div>
                {/* Avatar stack */}
                <div style={{
                  display:"flex", alignItems:"center", marginTop:"auto",
                }}>
                  {[
                    "var(--color-brand)",
                    "var(--color-success)",
                    "var(--color-gold)",
                    "var(--color-brand-purple)",
                    "var(--color-danger)",
                  ].map((c, i) => (
                    <div key={i} style={{
                      width:"28px", height:"28px", borderRadius:"50%",
                      background:c,
                      border:"2px solid var(--bg-surface)",
                      marginLeft:i > 0 ? "-7px" : 0,
                      zIndex:5-i, position:"relative",
                    }}/>
                  ))}
                  <span style={{
                    marginLeft:"10px",
                    fontSize:"11px", fontWeight:600,
                    color:"var(--text-tertiary)",
                  }}>
                    + groups near you
                  </span>
                </div>
              </div>
            </div>

            {/* ── Full-width CTA strip ── */}
            <div
              className="bc reveal d3 b-wide"
              style={{
                marginTop:"14px",
                borderRadius:"20px",
                background:
                  "linear-gradient(135deg," +
                  "rgba(92,124,250,.1) 0%," +
                  "rgba(124,58,237,.07) 100%)",
                border:"1px solid rgba(92,124,250,.18)",
                padding:"26px 28px",
                display:"flex", alignItems:"center", gap:"22px",
                position:"relative", overflow:"hidden",
              }}
            >
              {/* Glow orb */}
              <div aria-hidden="true" style={{
                position:"absolute", top:"-80px", right:"-80px",
                width:"240px", height:"240px", borderRadius:"50%",
                background:
                  "radial-gradient(circle, rgba(92,124,250,.2) 0%, transparent 70%)",
                filter:"blur(30px)", pointerEvents:"none",
              }}/>

              <div style={{
                width:"50px", height:"50px", borderRadius:"14px",
                background:"rgba(92,124,250,.12)",
                border:"1px solid rgba(92,124,250,.22)",
                display:"flex", alignItems:"center", justifyContent:"center",
                flexShrink:0,
              }}>
                <IconSparkles size={22} style={{ color:"var(--color-brand)" }}/>
              </div>

              <div style={{ flex:1, minWidth:0 }}>
                <h3
                  className="sg"
                  style={{
                    fontSize:"17px", fontWeight:800,
                    margin:"0 0 5px", letterSpacing:"-0.02em",
                  }}
                >
                  {t("hero.pill")}
                </h3>
                <p style={{
                  fontSize:"13.5px", color:"var(--text-secondary)",
                  margin:0, lineHeight:1.55,
                }}>
                  {t("hero.subtitle")}
                </p>
              </div>

              <Link href="/auth/register" style={{
                display:"inline-flex", alignItems:"center", gap:"6px",
                padding:"11px 20px",
                borderRadius:"9px",
                background:"var(--color-brand)",
                color:"#fff", fontSize:"13px", fontWeight:700,
                textDecoration:"none",
                flexShrink:0,
                boxShadow:"0 4px 20px rgba(92,124,250,.38)",
              }}>
                {t("hero.createAccount")}
                <IconArrowRight size={14}/>
              </Link>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════
            FOOTER
        ═══════════════════════════════════════════ */}
        <footer style={{
          borderTop:"1px solid rgba(255,255,255,.05)",
          padding:"28px 28px",
          display:"flex", alignItems:"center", justifyContent:"space-between",
          flexWrap:"wrap", gap:"12px",
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
            <span
              className="sg"
              style={{
                fontSize:"14px", fontWeight:800, letterSpacing:"-0.02em",
                color:"var(--text-secondary)",
              }}
            >
              JChat
            </span>
            <span style={{ color:"var(--text-tertiary)", opacity:.4 }}>·</span>
            <span style={{ fontSize:"13px", color:"var(--text-tertiary)" }}>
              {t("footer.copyright")}
            </span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
            <span style={{ fontSize:"13px", color:"var(--text-tertiary)" }}>
              {t("footer.business")}
            </span>
            <Link href="/pricing#negocios" style={{
              fontSize:"13px", color:"var(--color-brand)",
              textDecoration:"none", fontWeight:700,
              display:"inline-flex", alignItems:"center", gap:"4px",
            }}>
              {t("footer.businessLink")}
              <IconArrowRight size={12}/>
            </Link>
          </div>
        </footer>
      </div>
    </>
  );
}
