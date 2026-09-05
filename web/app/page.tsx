/**
 * JChat 3.0 — Landing page pública (/).
 *
 * Design v3: CLARO · pastel · durazno/coral — estilo Apple/iOS.
 * Signature: PhoneHero — mockup del teléfono con mapa claro + tarjetas glass
 *   flotantes con parallax Framer Motion. Fondo #FAFAFA, blobs pastel suaves.
 * Font: Space Grotesk (display) via Google Fonts useEffect.
 * Motion: Framer Motion 13. prefers-reduced-motion → useReducedMotion().
 * Tokens: CSS vars --land-* definidas en <style>; --color-* globales de apoyo.
 *   NUNCA --db-*. NUNCA hex sueltos fuera del bloque de tokens.
 * i18n: next-intl, namespace "landing".
 */

"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useReducedMotion,
} from "framer-motion";
import {
  IconMapPin,
  IconMessageCircle,
  IconUsers,
  IconArrowRight,
  IconBrandApple,
  IconBuildingStore,
} from "@tabler/icons-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";

// ── City marquee ─────────────────────────────────────────────────────────────
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

// ── Venue pins en el mapa del teléfono (usando CSS tokens, sin hex sueltos) ──
const MAP_VENUES = [
  { cx:38, cy:28, c:"var(--land-peach)",  r:5, d:"0s"   },
  { cx:63, cy:18, c:"var(--land-mint)",   r:4, d:"1.2s" },
  { cx:82, cy:35, c:"var(--land-sky)",    r:5, d:"2.1s" },
  { cx:75, cy:58, c:"var(--land-peach)",  r:4, d:"0.6s" },
  { cx:27, cy:53, c:"var(--land-mint)",   r:4, d:"1.7s" },
  { cx:53, cy:70, c:"var(--land-sky)",    r:4, d:"2.8s" },
  { cx:19, cy:74, c:"var(--land-peach)",  r:3, d:"0.9s" },
  { cx:88, cy:73, c:"var(--land-mint)",   r:4, d:"1.4s" },
];

// ── Framer Motion helpers ─────────────────────────────────────────────────────
// 4-tuple satisface el tipo Easing de FM v13.
const EASE = [0.16, 1, 0.3, 1] as [number, number, number, number];
const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.72, ease: EASE } },
};
const stagger = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.09 } },
};

// ── Phone Hero ────────────────────────────────────────────────────────────────
// Mockup del teléfono con mapa claro + tarjetas glass flotantes + parallax FM.
const MotionLink = motion(Link);

function PhoneHero({ youLabel }: { youLabel: string }) {
  const prefersReduced = useReducedMotion();
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springCfg = { stiffness: 48, damping: 20, mass: 1 };
  const springX = useSpring(mouseX, springCfg);
  const springY = useSpring(mouseY, springCfg);

  const phoneX = useTransform(springX, [-1,1], [ -8,  8]);
  const phoneY = useTransform(springY, [-1,1], [ -5,  5]);
  const card1X = useTransform(springX, [-1,1], [-16, 16]);
  const card1Y = useTransform(springY, [-1,1], [-10, 10]);
  const card2X = useTransform(springX, [-1,1], [ 14,-14]);
  const card2Y = useTransform(springY, [-1,1], [  8, -8]);

  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (prefersReduced) return;
    const r = e.currentTarget.getBoundingClientRect();
    mouseX.set((e.clientX - r.left  - r.width  / 2) / (r.width  / 2));
    mouseY.set((e.clientY - r.top   - r.height / 2) / (r.height / 2));
  }
  function onMouseLeave() { mouseX.set(0); mouseY.set(0); }

  return (
    <div
      aria-hidden="true"
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={{ position:"relative", width:"100%", height:"100%" }}
    >
      {/* Soft ambient glow behind the phone */}
      <div style={{
        position:"absolute", top:"50%", left:"50%",
        transform:"translate(-50%,-50%)",
        width:"340px", height:"340px", borderRadius:"50%",
        background:"radial-gradient(circle,rgba(255,138,101,.18) 0%,transparent 70%)",
        filter:"blur(40px)", zIndex:1, pointerEvents:"none",
      }}/>

      {/* Phone frame */}
      <motion.div
        className="phone-wrap"
        style={{ x: phoneX, y: phoneY }}
        initial={{ opacity:0, y:32 }}
        animate={{ opacity:1, y:0 }}
        transition={{ duration:0.9, ease: EASE }}
      >
        <div className="phone-frame">
          <div className="phone-notch"/>
          <div className="phone-screen">
            {/* Status bar */}
            <div className="phone-status">
              <span>9:41</span>
              <span style={{ letterSpacing:"1px" }}>●●●</span>
            </div>
            {/* Map SVG — white bg, líneas gris muy suaves, blocks */}
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="xMidYMid slice"
              style={{ position:"absolute", inset:0, width:"100%", height:"100%" }}
              fill="none"
            >
              {/* Fondo */}
              <rect width="100" height="100" fill="#F9FAFB"/>
              {/* Cuadrícula de calles */}
              <line x1="20" y1="0"   x2="20"  y2="100" stroke="rgba(0,0,0,.06)" strokeWidth=".7"/>
              <line x1="40" y1="0"   x2="40"  y2="100" stroke="rgba(0,0,0,.06)" strokeWidth=".7"/>
              <line x1="60" y1="0"   x2="60"  y2="100" stroke="rgba(0,0,0,.06)" strokeWidth=".7"/>
              <line x1="80" y1="0"   x2="80"  y2="100" stroke="rgba(0,0,0,.06)" strokeWidth=".7"/>
              <line x1="0"  y1="25"  x2="100" y2="25"  stroke="rgba(0,0,0,.06)" strokeWidth=".7"/>
              <line x1="0"  y1="50"  x2="100" y2="50"  stroke="rgba(0,0,0,.09)" strokeWidth=".9"/>
              <line x1="0"  y1="75"  x2="100" y2="75"  stroke="rgba(0,0,0,.06)" strokeWidth=".7"/>
              {/* Manzanas */}
              <rect x="22" y="27" width="16" height="21" rx="2" fill="rgba(0,0,0,.04)"/>
              <rect x="42" y="27" width="16" height="21" rx="2" fill="rgba(0,0,0,.035)"/>
              <rect x="62" y="27" width="16" height="21" rx="2" fill="rgba(0,0,0,.04)"/>
              <rect x="22" y="52" width="16" height="21" rx="2" fill="rgba(0,0,0,.03)"/>
              <rect x="62" y="52" width="16" height="21" rx="2" fill="rgba(0,0,0,.04)"/>
              {/* Radio circles (durazno) */}
              <circle cx="50" cy="50" r="22" stroke="rgba(255,138,101,.30)" strokeWidth="1"   strokeDasharray="3 6"  fill="rgba(255,138,101,.06)"/>
              <circle cx="50" cy="50" r="36" stroke="rgba(255,138,101,.14)" strokeWidth=".8"  strokeDasharray="2 8"  fill="none"/>
            </svg>
            {/* Venue pins */}
            {MAP_VENUES.map((v,i) => (
              <div key={i} style={{
                position:"absolute", left:`${v.cx}%`, top:`${v.cy}%`,
                transform:"translate(-50%,-50%)", zIndex:3,
              }}>
                <div className="map-ping" style={{ background:v.c, animationDelay:v.d }}/>
                <div className="map-dot"  style={{ background:v.c, width:`${v.r*2}px`, height:`${v.r*2}px` }}/>
              </div>
            ))}
            {/* You here */}
            <div className="map-you-wrap">
              <div className="map-you"/>
              <div className="map-you-label">{youLabel}</div>
            </div>
          </div>
          <div className="phone-home"/>
        </div>
      </motion.div>

      {/* Tarjeta venue (top-left) */}
      <motion.div
        className="ph-card-1"
        style={{ x: card1X, y: card1Y }}
        initial={{ opacity:0, x:-24 }}
        animate={{ opacity:1, x:0 }}
        transition={{ delay:0.6, duration:0.7, ease: EASE }}
      >
        <div className="light-glass card-venue">
          <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"7px" }}>
            <div className="card-icon" style={{ background:"var(--land-peach-glow)", color:"var(--land-peach)" }}>
              <IconBuildingStore size={13}/>
            </div>
            <div>
              <div style={{ fontSize:"12px", fontWeight:700, color:"var(--land-text)", lineHeight:1.2 }}>Playa Miramar</div>
              <div style={{ fontSize:"10px", color:"var(--land-sub)", marginTop:"1px" }}>Beach Club · Bar</div>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:"5px", fontSize:"11px" }}>
            <div className="alive-dot" style={{ background:"var(--land-peach)", boxShadow:"0 0 0 3px var(--land-peach-glow)" }}/>
            <span style={{ color:"var(--land-peach)", fontWeight:600 }}>12 aquí ahora</span>
          </div>
        </div>
      </motion.div>

      {/* Tarjeta chat (bottom-right) */}
      <motion.div
        className="ph-card-2"
        style={{ x: card2X, y: card2Y }}
        initial={{ opacity:0, x:24 }}
        animate={{ opacity:1, x:0 }}
        transition={{ delay:0.8, duration:0.7, ease: EASE }}
      >
        <div className="light-glass card-chat">
          <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"7px" }}>
            <div className="card-icon" style={{ background:"var(--land-sky-glow)", color:"var(--land-sky)" }}>
              <IconMessageCircle size={13}/>
            </div>
            <div>
              <div style={{ fontSize:"12px", fontWeight:700, color:"var(--land-text)", lineHeight:1.2 }}>Noche en la ciudad</div>
              <div style={{ fontSize:"10px", color:"var(--land-sub)", marginTop:"1px" }}>248 miembros</div>
            </div>
          </div>
          <div style={{ fontSize:"11px", color:"var(--land-sub)", lineHeight:1.4 }}>
            ¿Alguien va al festival este finde? 🎤
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ── Landing page ──────────────────────────────────────────────────────────────
export default function LandingPage() {
  const t = useTranslations("landing");
  const prefersReduced = useReducedMotion();

  useEffect(() => {
    if (!document.querySelector('[data-font="space-grotesk"]')) {
      const link = document.createElement("link");
      link.rel  = "stylesheet";
      link.dataset["font"] = "space-grotesk";
      link.href = "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700;800&display=swap";
      document.head.appendChild(link);
    }
  }, []);

  // Feature cards pre-computadas (evita t() dentro de arrays inline)
  const howItWorksSteps = [
    { num:"1", cls:"hiw-n1", tag:t("howItWorks.step1.tag"), title:t("howItWorks.step1.title"), desc:t("howItWorks.step1.desc"), icon:<IconMapPin size={22}/> },
    { num:"2", cls:"hiw-n2", tag:t("howItWorks.step2.tag"), title:t("howItWorks.step2.title"), desc:t("howItWorks.step2.desc"), icon:<IconUsers size={22}/> },
    { num:"3", cls:"hiw-n3", tag:t("howItWorks.step3.tag"), title:t("howItWorks.step3.title"), desc:t("howItWorks.step3.desc"), icon:<IconMessageCircle size={22}/> },
  ];
  const groupFeats = [
    { title:t("groups.f1.title"), body:t("groups.f1.body"), dot:"var(--land-peach)" },
    { title:t("groups.f2.title"), body:t("groups.f2.body"), dot:"var(--land-mint)"  },
    { title:t("groups.f3.title"), body:t("groups.f3.body"), dot:"var(--land-sky)"   },
  ];
  const socialFeats = [
    { icon:<IconMapPin size={22}/>,         bg:"var(--land-peach-glow)", color:"var(--land-peach)", title:t("features.map.title"),    desc:t("features.map.description")    },
    { icon:<IconMessageCircle size={22}/>,  bg:"var(--land-mint-glow)",  color:"var(--land-mint)",  title:t("features.chat.title"),   desc:t("features.chat.description")   },
    { icon:<IconUsers size={22}/>,          bg:"var(--land-sky-glow)",   color:"var(--land-sky)",   title:t("features.groups.title"), desc:t("features.groups.description") },
  ];

  return (
    <>
      <style>{`
        /* ── Landing design tokens: paleta CLARA, durazno protagonista ─── */
        :root {
          --land-peach:      #FF8A65;
          --land-peach-2:    #FFAB91;
          --land-peach-glow: rgba(255,138,101,.20);
          --land-mint:       #5EEAD4;
          --land-mint-glow:  rgba(94,234,212,.18);
          --land-sky:        #93C5FD;
          --land-sky-glow:   rgba(147,197,253,.22);
          --land-lavender:   #C4B5FD;
          --land-bg:         #FAFAFA;
          --land-text:       #111827;
          --land-sub:        #4B5563;
          --land-muted:      #9CA3AF;
          --land-glass:      rgba(255,255,255,.80);
          --land-border-v:   rgba(255,138,101,.30);
          --land-border-c:   rgba(147,197,253,.38);
          --land-shadow:     0 8px 40px rgba(0,0,0,.09);
        }

        /* ── Display font ──────────────────────────────────────────────── */
        .sg { font-family:'Space Grotesk', system-ui, sans-serif; }

        /* ── Gradient text (durazno → rose → brand) ────────────────────── */
        .gtext {
          background: linear-gradient(135deg, var(--land-peach) 0%, #F43F5E 45%, var(--color-brand) 90%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        /* ── Aurora pastel (muy suaves, drift lento) ───────────────────── */
        @keyframes ld-da { 0%,100%{transform:translate(0,0)scale(1);} 50%{transform:translate(28px,-16px)scale(1.05);} }
        @keyframes ld-db { 0%,100%{transform:translate(0,0)scale(1);} 50%{transform:translate(-22px,18px)scale(1.04);} }
        @keyframes ld-dc { 0%,100%{transform:translate(0,0)scale(1);} 40%{transform:translate(16px,12px)scale(1.06);} }
        @keyframes ld-dd { 0%,100%{transform:translate(0,0)scale(1);} 60%{transform:translate(-12px,-14px)scale(1.03);} }

        /* ── City marquee ──────────────────────────────────────────────── */
        @keyframes mq-l { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        @keyframes mq-r { from{transform:translateX(-50%)} to{transform:translateX(0)} }
        .mq-track { display:flex; gap:40px; white-space:nowrap; }
        .mq-a { animation:mq-l 36s linear infinite; }
        .mq-b { animation:mq-r 44s linear infinite; }

        /* ── Phone mockup ──────────────────────────────────────────────── */
        .phone-wrap {
          position:absolute; top:50%; left:50%;
          transform:translate(-50%,-50%); z-index:2;
        }
        .phone-frame {
          width:220px; height:440px; background:#fff;
          border-radius:36px; border:5px solid #E5E7EB;
          box-shadow:0 32px 80px rgba(0,0,0,.14), 0 0 0 1px rgba(0,0,0,.04);
          overflow:hidden; position:relative; display:flex; flex-direction:column;
        }
        .phone-notch {
          position:absolute; top:10px; left:50%; transform:translateX(-50%);
          width:80px; height:22px; background:#E5E7EB; border-radius:11px; z-index:10;
        }
        .phone-screen {
          flex:1; background:#F9FAFB; position:relative;
          overflow:hidden; margin-top:40px; margin-bottom:28px;
        }
        .phone-status {
          position:absolute; top:4px; left:0; right:0;
          display:flex; justify-content:space-between; padding:0 12px;
          font-size:8px; font-weight:600; color:var(--land-sub); z-index:5;
        }
        .phone-home {
          position:absolute; bottom:8px; left:50%; transform:translateX(-50%);
          width:60px; height:4px; background:#D1D5DB; border-radius:2px;
        }

        /* ── Map venue pins ────────────────────────────────────────────── */
        @keyframes map-ping {
          0%   { transform:translate(-50%,-50%)scale(1); opacity:.7; }
          100% { transform:translate(-50%,-50%)scale(4); opacity:0;  }
        }
        .map-ping {
          position:absolute; top:0; left:0;
          transform:translate(-50%,-50%);
          width:12px; height:12px; border-radius:50%;
          opacity:0; animation:map-ping 2.8s ease-out infinite;
        }
        .map-dot {
          position:absolute; top:0; left:0;
          transform:translate(-50%,-50%); border-radius:50%;
          border:1.5px solid rgba(255,255,255,.9);
          box-shadow:0 2px 8px rgba(0,0,0,.12);
        }
        .map-you-wrap {
          position:absolute; top:50%; left:50%;
          transform:translate(-50%,-50%); z-index:4;
          display:flex; flex-direction:column; align-items:center; gap:4px;
        }
        .map-you {
          width:14px; height:14px; border-radius:50%;
          background:var(--color-brand);
          border:2.5px solid #fff;
          box-shadow:0 0 0 4px rgba(92,124,250,.25), 0 2px 8px rgba(0,0,0,.18);
        }
        .map-you-label {
          background:var(--color-brand); color:#fff;
          font-size:7px; font-weight:700;
          padding:2px 6px; border-radius:6px;
          white-space:nowrap;
          box-shadow:0 2px 8px rgba(92,124,250,.30);
        }

        /* ── Floating glass cards ──────────────────────────────────────── */
        .ph-card-1 {
          position:absolute; top:16%; left:-2%;
          z-index:5; max-width:180px;
        }
        .ph-card-2 {
          position:absolute; bottom:18%; right:-2%;
          z-index:5; max-width:180px;
        }
        .light-glass {
          background:var(--land-glass);
          backdrop-filter:blur(20px) saturate(160%);
          -webkit-backdrop-filter:blur(20px) saturate(160%);
          border-radius:14px; padding:12px 14px;
          box-shadow:var(--land-shadow);
        }
        .card-venue { border:1px solid var(--land-border-v); }
        .card-chat  { border:1px solid var(--land-border-c); }
        .card-icon {
          width:26px; height:26px; border-radius:8px;
          display:flex; align-items:center; justify-content:center; flex-shrink:0;
        }
        .alive-dot { width:6px; height:6px; border-radius:50%; flex-shrink:0; }

        /* ── CTA buttons ───────────────────────────────────────────────── */
        .btn-peach {
          display:inline-flex; align-items:center; gap:8px;
          padding:14px 28px;
          background:linear-gradient(135deg, var(--land-peach) 0%, #FF7043 100%);
          color:#fff !important; font-size:15px; font-weight:700;
          border:none; border-radius:14px; cursor:pointer; text-decoration:none;
          box-shadow:0 6px 24px var(--land-peach-glow), 0 2px 8px rgba(0,0,0,.08);
          transition:box-shadow .2s;
        }
        .btn-peach:hover { box-shadow:0 10px 36px rgba(255,112,67,.38), 0 2px 8px rgba(0,0,0,.10); }
        .btn-ghost {
          display:inline-flex; align-items:center; gap:8px;
          padding:14px 28px; background:transparent;
          color:var(--land-text) !important; font-size:15px; font-weight:600;
          border:1.5px solid rgba(0,0,0,.14); border-radius:14px;
          cursor:pointer; text-decoration:none; transition:border-color .15s, background .15s;
        }
        .btn-ghost:hover { border-color:rgba(0,0,0,.26); background:rgba(0,0,0,.03); }

        /* ── How it works cards ────────────────────────────────────────── */
        .hiw-card {
          background:var(--land-glass);
          backdrop-filter:blur(20px);
          -webkit-backdrop-filter:blur(20px);
          border:1px solid rgba(0,0,0,.07);
          border-radius:22px; padding:28px 24px;
          box-shadow:0 4px 24px rgba(0,0,0,.06);
          transition:box-shadow .2s;
        }
        .hiw-num {
          width:40px; height:40px; border-radius:12px;
          display:flex; align-items:center; justify-content:center;
          font-size:16px; font-weight:800; margin-bottom:16px;
          font-family:'Space Grotesk',sans-serif;
        }
        .hiw-n1 { background:var(--land-peach-glow); color:var(--land-peach); }
        .hiw-n2 { background:var(--land-mint-glow);  color:#0EA5A0; }
        .hiw-n3 { background:var(--land-sky-glow);   color:#3B82F6; }

        /* ── Groups Pro ────────────────────────────────────────────────── */
        .groups-glass {
          background:var(--land-glass);
          backdrop-filter:blur(24px);
          -webkit-backdrop-filter:blur(24px);
          border:1px solid rgba(0,0,0,.07);
          border-radius:24px; padding:32px;
          box-shadow:0 8px 40px rgba(0,0,0,.07);
        }
        .gfeat-dot { width:8px; height:8px; border-radius:50%; margin-top:5px; flex-shrink:0; }

        /* ── Social feature cards ──────────────────────────────────────── */
        .soc-card {
          background:var(--land-glass);
          backdrop-filter:blur(20px);
          -webkit-backdrop-filter:blur(20px);
          border:1px solid rgba(0,0,0,.07);
          border-radius:22px; padding:28px 24px;
          box-shadow:0 4px 24px rgba(0,0,0,.06);
        }
        .soc-icon {
          width:48px; height:48px; border-radius:14px;
          display:flex; align-items:center; justify-content:center;
          margin-bottom:16px;
        }

        /* ── Footer ────────────────────────────────────────────────────── */
        .land-foot {
          border-top:1px solid rgba(0,0,0,.07);
          padding:32px 24px;
          display:flex; justify-content:space-between; align-items:center;
          font-size:13px; color:var(--land-muted);
        }

        /* ── Reduced motion ────────────────────────────────────────────── */
        @media(prefers-reduced-motion:reduce) {
          .mq-a,.mq-b,.map-ping { animation:none!important; }
        }

        /* ── Responsive ────────────────────────────────────────────────── */
        @media(max-width:880px){
          .hero-grid,.groups-grid { grid-template-columns:1fr!important; }
          .phone-wrap { position:relative!important; top:auto!important; left:auto!important; transform:none!important; margin:0 auto; }
          .ph-card-1,.ph-card-2 { display:none; }
          .hiw-grid,.soc-grid   { grid-template-columns:1fr!important; }
          .cta-btns              { flex-direction:column!important; align-items:stretch!important; }
          .land-foot             { flex-direction:column!important; gap:12px!important; text-align:center!important; }
        }
        @media(max-width:480px){
          .btn-peach,.btn-ghost  { justify-content:center; }
          .cta-box               { padding:40px 24px!important; }
        }
      `}</style>

      <div style={{ background:"var(--land-bg)", minHeight:"100vh", overflowX:"hidden", color:"var(--land-text)", position:"relative" }}>

        {/* ── Aurora pastel (fija, muy suave) ───────────────────────────────── */}
        <div aria-hidden="true" style={{ position:"fixed", inset:0, zIndex:0, overflow:"hidden", pointerEvents:"none" }}>
          <div style={{
            position:"absolute", borderRadius:"50%", width:"580px", height:"580px",
            background:"radial-gradient(circle,rgba(255,171,145,.42) 0%,transparent 70%)",
            filter:"blur(90px)", top:"-8%", right:"0%",
            animation: prefersReduced ? undefined : "ld-da 30s ease-in-out infinite",
          }}/>
          <div style={{
            position:"absolute", borderRadius:"50%", width:"480px", height:"480px",
            background:"radial-gradient(circle,rgba(94,234,212,.28) 0%,transparent 70%)",
            filter:"blur(100px)", bottom:"8%", left:"-6%",
            animation: prefersReduced ? undefined : "ld-db 38s ease-in-out infinite",
            animationDelay:"-14s",
          }}/>
          <div style={{
            position:"absolute", borderRadius:"50%", width:"380px", height:"380px",
            background:"radial-gradient(circle,rgba(147,197,253,.30) 0%,transparent 70%)",
            filter:"blur(80px)", top:"40%", right:"18%",
            animation: prefersReduced ? undefined : "ld-dc 32s ease-in-out infinite",
            animationDelay:"-8s",
          }}/>
          <div style={{
            position:"absolute", borderRadius:"50%", width:"300px", height:"300px",
            background:"radial-gradient(circle,rgba(196,181,253,.22) 0%,transparent 70%)",
            filter:"blur(80px)", top:"16%", left:"22%",
            animation: prefersReduced ? undefined : "ld-dd 44s ease-in-out infinite",
            animationDelay:"-21s",
          }}/>
        </div>

        {/* ── Nav ──────────────────────────────────────────────────────────── */}
        <nav style={{
          position:"relative", zIndex:10,
          maxWidth:"1100px", margin:"0 auto", padding:"22px 24px",
          display:"flex", justifyContent:"space-between", alignItems:"center",
        }}>
          <span className="sg" style={{ fontSize:"18px", fontWeight:800, color:"var(--land-text)", letterSpacing:"-.02em" }}>
            JChat
          </span>
          <div style={{ display:"flex", alignItems:"center", gap:"20px" }}>
            <Link href="/pricing" style={{ fontSize:"14px", fontWeight:500, color:"var(--land-sub)", textDecoration:"none" }}>
              {t("pricing.cta")}
            </Link>
            <LanguageSwitcher/>
            <Link
              href="/auth/login"
              className="btn-ghost"
              style={{ padding:"8px 18px", fontSize:"14px", borderRadius:"10px" }}
            >
              {t("nav.signIn")}
            </Link>
          </div>
        </nav>

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section style={{ position:"relative", zIndex:2, maxWidth:"1100px", margin:"0 auto", padding:"40px 24px 80px" }}>
          <div
            className="hero-grid"
            style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"48px", alignItems:"center", minHeight:"520px" }}
          >
            {/* Left: texto */}
            <motion.div initial="hidden" animate="show" variants={stagger}>
              <motion.p variants={fadeUp} style={{
                fontSize:"12px", fontWeight:700, textTransform:"uppercase",
                letterSpacing:".10em", color:"var(--land-peach)",
                marginBottom:"16px", fontFamily:"'Space Grotesk',sans-serif",
              }}>
                {t("hero.eyebrow")}
              </motion.p>

              <motion.h1
                variants={fadeUp}
                className="sg"
                style={{
                  fontSize:"clamp(2.5rem,5.8vw,4.6rem)", fontWeight:800,
                  letterSpacing:"-.04em", lineHeight:1.1, margin:"0 0 20px",
                  color:"var(--land-text)",
                }}
              >
                {t("hero.titleLine1")}{" "}
                <span className="gtext">{t("hero.titleLine2")}</span>
              </motion.h1>

              <motion.p variants={fadeUp} style={{
                fontSize:"17px", lineHeight:1.65, color:"var(--land-sub)",
                margin:"0 0 36px", maxWidth:"420px",
              }}>
                {t("hero.subtitle")}
              </motion.p>

              <motion.div variants={fadeUp} className="cta-btns" style={{ display:"flex", gap:"12px", flexWrap:"wrap" }}>
                <motion.a
                  href="/auth/register"
                  className="btn-peach"
                  whileTap={prefersReduced ? undefined : { scale:0.97, boxShadow:"0 2px 10px rgba(255,112,67,.28)" }}
                >
                  {t("hero.createAccount")}
                  <IconArrowRight size={16}/>
                </motion.a>
                <motion.a
                  href="#"
                  className="btn-ghost"
                  whileTap={prefersReduced ? undefined : { scale:0.97 }}
                >
                  <IconBrandApple size={16}/>
                  {t("hero.downloadApp")}
                </motion.a>
              </motion.div>
            </motion.div>

            {/* Right: phone mockup */}
            <div style={{ position:"relative", height:"520px", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <PhoneHero youLabel={t("map.youAreHere")}/>
            </div>
          </div>
        </section>

        {/* ── City marquee ─────────────────────────────────────────────────── */}
        <div
          aria-hidden="true"
          style={{ overflow:"hidden", marginBottom:"80px", position:"relative", zIndex:2 }}
        >
          {[["mq-a", ROW_A], ["mq-b", ROW_B]].map(([cls, row], ri) => (
            <div
              key={ri}
              style={{
                marginBottom: ri === 0 ? "8px" : 0,
                mask:"linear-gradient(90deg,transparent,#000 14%,#000 86%,transparent)",
                WebkitMask:"linear-gradient(90deg,transparent,#000 14%,#000 86%,transparent)",
              }}
            >
              <div className={`mq-track ${cls as string}`}>
                {(row as string[]).map((c,i) => (
                  <span key={i} style={{ fontSize:"13px", fontWeight:600, color:"var(--land-muted)" }}>{c}</span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* ── How It Works ─────────────────────────────────────────────────── */}
        <section style={{ position:"relative", zIndex:2, maxWidth:"1100px", margin:"0 auto", padding:"0 24px 100px" }}>
          <motion.div
            initial="hidden" whileInView="show" viewport={{ once:true, margin:"-80px" }}
            variants={stagger}
            style={{ textAlign:"center", marginBottom:"56px" }}
          >
            <motion.p variants={fadeUp} style={{
              fontSize:"12px", fontWeight:700, textTransform:"uppercase",
              letterSpacing:".10em", color:"#0EA5A0", marginBottom:"12px",
              fontFamily:"'Space Grotesk',sans-serif",
            }}>
              {t("howItWorks.label")}
            </motion.p>
            <motion.h2 variants={fadeUp} className="sg" style={{
              fontSize:"clamp(1.8rem,4vw,3rem)", fontWeight:800,
              letterSpacing:"-.03em", margin:"0 0 14px", color:"var(--land-text)",
            }}>
              {t("howItWorks.title")}
            </motion.h2>
            <motion.p variants={fadeUp} style={{
              fontSize:"16px", color:"var(--land-sub)", maxWidth:"440px", margin:"0 auto",
            }}>
              {t("howItWorks.subtitle")}
            </motion.p>
          </motion.div>

          <div className="hiw-grid" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"20px" }}>
            {howItWorksSteps.map((step, i) => (
              <motion.div
                key={i}
                className="hiw-card"
                initial={{ opacity:0, y:32 }}
                whileInView={{ opacity:1, y:0 }}
                viewport={{ once:true, margin:"-40px" }}
                transition={{ delay: i * 0.1, duration:.7, ease: EASE }}
                whileHover={prefersReduced ? undefined : { y:-5, boxShadow:"0 18px 52px rgba(0,0,0,.10)" }}
              >
                <div className={`hiw-num ${step.cls}`}>{step.num}</div>
                <p style={{
                  fontSize:"11px", fontWeight:700, textTransform:"uppercase",
                  letterSpacing:".08em", color:"var(--land-muted)", margin:"0 0 8px",
                }}>
                  {step.tag}
                </p>
                <h3 className="sg" style={{
                  fontSize:"20px", fontWeight:700, margin:"0 0 10px", color:"var(--land-text)",
                }}>
                  {step.title}
                </h3>
                <p style={{ fontSize:"14px", color:"var(--land-sub)", margin:0, lineHeight:1.6 }}>
                  {step.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── Groups Pro ───────────────────────────────────────────────────── */}
        <section style={{ position:"relative", zIndex:2, maxWidth:"1100px", margin:"0 auto", padding:"0 24px 100px" }}>
          <div className="groups-grid" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"48px", alignItems:"center" }}>

            {/* Copy */}
            <motion.div
              initial="hidden" whileInView="show" viewport={{ once:true, margin:"-60px" }}
              variants={stagger}
            >
              <motion.div variants={fadeUp} style={{
                display:"inline-flex", alignItems:"center", gap:"6px",
                background:"var(--land-peach-glow)",
                border:"1px solid rgba(255,138,101,.30)",
                color:"var(--land-peach)", fontSize:"12px", fontWeight:700,
                padding:"5px 14px", borderRadius:"99px", marginBottom:"20px",
              }}>
                {t("groups.badge")}
              </motion.div>
              <motion.h2 variants={fadeUp} className="sg" style={{
                fontSize:"clamp(1.6rem,3.5vw,2.6rem)", fontWeight:800,
                letterSpacing:"-.03em", margin:"0 0 16px",
                color:"var(--land-text)", lineHeight:1.15,
              }}>
                {t("groups.title")}
              </motion.h2>
              <motion.p variants={fadeUp} style={{
                fontSize:"16px", color:"var(--land-sub)", margin:"0 0 28px", lineHeight:1.65,
              }}>
                {t("groups.body")}
              </motion.p>
              <motion.div variants={fadeUp}>
                <MotionLink
                  href="/pricing"
                  className="btn-peach"
                  whileTap={prefersReduced ? undefined : { scale:0.97 }}
                >
                  {t("groups.cta")}
                  <IconArrowRight size={15}/>
                </MotionLink>
              </motion.div>
            </motion.div>

            {/* Feature glass card */}
            <motion.div
              className="groups-glass"
              initial={{ opacity:0, x:32 }}
              whileInView={{ opacity:1, x:0 }}
              viewport={{ once:true, margin:"-60px" }}
              transition={{ duration:.8, ease: EASE }}
            >
              <div style={{ display:"flex", flexDirection:"column", gap:"22px" }}>
                {groupFeats.map((feat, i) => (
                  <div key={i} style={{ display:"flex", gap:"14px", alignItems:"flex-start" }}>
                    <div className="gfeat-dot" style={{ background: feat.dot }}/>
                    <div>
                      <div style={{ fontSize:"15px", fontWeight:700, color:"var(--land-text)", marginBottom:"3px" }}>
                        {feat.title}
                      </div>
                      <div style={{ fontSize:"13px", color:"var(--land-sub)", lineHeight:1.55 }}>
                        {feat.body}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* ── Social features ──────────────────────────────────────────────── */}
        <section style={{ position:"relative", zIndex:2, maxWidth:"1100px", margin:"0 auto", padding:"0 24px 100px" }}>
          <motion.div
            initial="hidden" whileInView="show" viewport={{ once:true, margin:"-80px" }}
            variants={stagger}
            style={{ textAlign:"center", marginBottom:"48px" }}
          >
            <motion.h2 variants={fadeUp} className="sg" style={{
              fontSize:"clamp(1.8rem,4vw,3rem)", fontWeight:800,
              letterSpacing:"-.03em", margin:"0 0 14px", color:"var(--land-text)",
            }}>
              {t("social.title")}
            </motion.h2>
            <motion.p variants={fadeUp} style={{
              fontSize:"16px", color:"var(--land-sub)", maxWidth:"400px", margin:"0 auto",
            }}>
              {t("social.body")}
            </motion.p>
          </motion.div>

          <div className="soc-grid" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"20px" }}>
            {socialFeats.map((f, i) => (
              <motion.div
                key={i}
                className="soc-card"
                initial={{ opacity:0, y:28 }}
                whileInView={{ opacity:1, y:0 }}
                viewport={{ once:true, margin:"-40px" }}
                transition={{ delay: i * 0.1, duration:.7, ease: EASE }}
                whileHover={prefersReduced ? undefined : { y:-5, boxShadow:"0 18px 52px rgba(0,0,0,.10)" }}
              >
                <div className="soc-icon" style={{ background: f.bg, color: f.color }}>
                  {f.icon}
                </div>
                <h3 className="sg" style={{ fontSize:"18px", fontWeight:700, margin:"0 0 8px", color:"var(--land-text)" }}>
                  {f.title}
                </h3>
                <p style={{ fontSize:"14px", color:"var(--land-sub)", margin:0, lineHeight:1.6 }}>
                  {f.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── CTA final ────────────────────────────────────────────────────── */}
        <section style={{ position:"relative", zIndex:2, maxWidth:"1100px", margin:"0 auto", padding:"0 24px 100px" }}>
          <motion.div
            className="cta-box"
            initial={{ opacity:0, y:32 }}
            whileInView={{ opacity:1, y:0 }}
            viewport={{ once:true, margin:"-60px" }}
            transition={{ duration:.8, ease: EASE }}
            style={{
              background:"var(--land-glass)",
              backdropFilter:"blur(32px)", WebkitBackdropFilter:"blur(32px)",
              border:"1px solid rgba(0,0,0,.07)",
              borderRadius:"28px", padding:"72px 48px",
              textAlign:"center", boxShadow:"0 12px 64px rgba(0,0,0,.08)",
            }}
          >
            <h2 className="sg" style={{
              fontSize:"clamp(2rem,5vw,3.6rem)", fontWeight:800,
              letterSpacing:"-.04em", margin:"0 0 16px",
              color:"var(--land-text)", lineHeight:1.1,
            }}>
              {t("cta.title")}{" "}
              <span className="gtext">{t("cta.titleGradient")}</span>
            </h2>
            <p style={{
              fontSize:"17px", color:"var(--land-sub)",
              margin:"0 0 36px", maxWidth:"400px",
              marginLeft:"auto", marginRight:"auto",
            }}>
              {t("cta.sub")}
            </p>
            <div className="cta-btns" style={{ display:"flex", gap:"14px", justifyContent:"center", flexWrap:"wrap" }}>
              <motion.a
                href="/auth/register"
                className="btn-peach"
                whileTap={prefersReduced ? undefined : { scale:0.96, boxShadow:"0 2px 10px rgba(255,112,67,.28)" }}
              >
                {t("cta.btnPrimary")}
                <IconArrowRight size={16}/>
              </motion.a>
              <motion.a
                href="/pricing"
                className="btn-ghost"
                whileTap={prefersReduced ? undefined : { scale:0.97 }}
              >
                {t("cta.btnSec")}
              </motion.a>
            </div>
          </motion.div>
        </section>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <footer style={{ position:"relative", zIndex:2, maxWidth:"1100px", margin:"0 auto" }}>
          <div className="land-foot">
            <span className="sg" style={{ fontWeight:800, color:"var(--land-text)", fontSize:"15px" }}>JChat</span>
            <span>
              {t("footer.business")}{" "}
              <a href="/pricing" style={{ color:"var(--land-peach)", fontWeight:600, textDecoration:"none" }}>
                {t("footer.businessLink")}
              </a>
            </span>
            <span>{t("footer.copyright")}</span>
          </div>
        </footer>

      </div>
    </>
  );
}
