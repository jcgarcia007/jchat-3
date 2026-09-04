/**
 * JChat 3.0 — Landing page pública (/).
 *
 * Design v2: nocturno-futurista glassmorphism (gaming palette).
 * Signature: Pulse Globe SVG + tarjetas glass flotantes + aurora multicolor.
 * Font: Space Grotesk (display) via Google Fonts useEffect.
 * Motion: Framer Motion 13. prefers-reduced-motion → useReducedMotion().
 * Tokens: GLOBAL únicamente (--bg-*, --text-*, --color-*). NUNCA --db-*.
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
  IconBrandGooglePlay,
  IconPin,
  IconBellRinging,
  IconMask,
  IconBuildingStore,
} from "@tabler/icons-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";

// ── City marquee rows (duplicated for seamless loop) ─────────────────────────
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

// ── Venue pins (% of container, CSS token strings — zero hardcoded hex) ───────
const VENUES = [
  { l:"22%", t:"19%", r:5, c:"var(--color-brand)",   d:"0s"   },
  { l:"47%", t:"12%", r:6, c:"var(--color-gold)",    d:"1.1s" },
  { l:"76%", t:"22%", r:4, c:"var(--color-success)", d:"2.0s" },
  { l:"84%", t:"46%", r:5, c:"var(--color-brand)",   d:"0.5s" },
  { l:"30%", t:"56%", r:4, c:"var(--color-gold)",    d:"1.5s" },
  { l:"63%", t:"63%", r:4, c:"var(--color-brand)",   d:"2.6s" },
  { l:"17%", t:"74%", r:6, c:"var(--color-success)", d:"0.8s" },
  { l:"79%", t:"75%", r:4, c:"var(--color-gold)",    d:"1.9s" },
  { l:"45%", t:"86%", r:5, c:"var(--color-brand)",   d:"3.1s" },
];

// ── Framer Motion variants ────────────────────────────────────────────────────
// Typed as 4-tuple so FM v13's strict Easing type is satisfied.
const EASE = [0.16, 1, 0.3, 1] as [number, number, number, number];

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show:   { opacity: 1, y: 0,  transition: { duration: 0.72, ease: EASE } },
};
const stagger = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.09 } },
};
const fadeIn = {
  hidden: { opacity: 0 },
  show:   { opacity: 1, transition: { duration: 0.6 } },
};

// ── Pulse Globe ───────────────────────────────────────────────────────────────
function PulseGlobe({ youLabel }: { youLabel: string }) {
  const prefersReduced = useReducedMotion();
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springCfg = { stiffness: 50, damping: 20, mass: 1 };
  const springX = useSpring(mouseX, springCfg);
  const springY = useSpring(mouseY, springCfg);

  // Each layer moves at a different depth (parallax)
  const globeX = useTransform(springX, [-1,1], [-11, 11]);
  const globeY = useTransform(springY, [-1,1], [ -7,  7]);
  const venueX = useTransform(springX, [-1,1], [-22, 22]);
  const venueY = useTransform(springY, [-1,1], [-13, 13]);
  const chatX  = useTransform(springX, [-1,1], [ 18,-18]);
  const chatY  = useTransform(springY, [-1,1], [ 10,-10]);

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
      {/* Ambient glow behind globe */}
      <div className="globe-glow" />

      {/* Rotating orbit ring (CSS) */}
      <div className="orbit-ring" />

      {/* Globe SVG + venue dots — parallax layer 1 */}
      <motion.div style={{ x: globeX, y: globeY, position:"absolute", inset:0 }}>
        <svg
          viewBox="0 0 500 500"
          style={{ position:"absolute", inset:0, width:"100%", height:"100%" }}
          fill="none"
        >
          <defs>
            <clipPath id="gc"><circle cx="250" cy="250" r="220"/></clipPath>
          </defs>
          {/* Outer ring */}
          <circle cx="250" cy="250" r="220" stroke="rgba(92,124,250,.2)" strokeWidth="1.2"/>
          {/* Grid clipped */}
          <g clipPath="url(#gc)" opacity=".8">
            {/* Horizontales */}
            <line x1="30" y1="98"  x2="470" y2="98"  stroke="rgba(92,124,250,.1)"  strokeWidth=".8"/>
            <line x1="30" y1="138" x2="470" y2="138" stroke="rgba(92,124,250,.13)" strokeWidth=".9"/>
            <line x1="30" y1="178" x2="470" y2="178" stroke="rgba(92,124,250,.16)" strokeWidth="1"/>
            <line x1="30" y1="218" x2="470" y2="218" stroke="rgba(92,124,250,.17)" strokeWidth="1"/>
            <line x1="30" y1="250" x2="470" y2="250" stroke="rgba(92,124,250,.2)"  strokeWidth="1.1"/>
            <line x1="30" y1="282" x2="470" y2="282" stroke="rgba(92,124,250,.17)" strokeWidth="1"/>
            <line x1="30" y1="322" x2="470" y2="322" stroke="rgba(92,124,250,.13)" strokeWidth=".9"/>
            <line x1="30" y1="362" x2="470" y2="362" stroke="rgba(92,124,250,.1)"  strokeWidth=".8"/>
            <line x1="30" y1="400" x2="470" y2="400" stroke="rgba(92,124,250,.07)" strokeWidth=".6"/>
            {/* Verticales */}
            <line x1="100" y1="30" x2="100" y2="470" stroke="rgba(92,124,250,.09)" strokeWidth=".8"/>
            <line x1="160" y1="30" x2="160" y2="470" stroke="rgba(92,124,250,.12)" strokeWidth=".9"/>
            <line x1="210" y1="30" x2="210" y2="470" stroke="rgba(92,124,250,.11)" strokeWidth=".8"/>
            <line x1="250" y1="30" x2="250" y2="470" stroke="rgba(92,124,250,.15)" strokeWidth="1"/>
            <line x1="290" y1="30" x2="290" y2="470" stroke="rgba(92,124,250,.11)" strokeWidth=".8"/>
            <line x1="340" y1="30" x2="340" y2="470" stroke="rgba(92,124,250,.12)" strokeWidth=".9"/>
            <line x1="400" y1="30" x2="400" y2="470" stroke="rgba(92,124,250,.09)" strokeWidth=".8"/>
          </g>
          {/* Dashed radius rings */}
          <circle cx="250" cy="250" r="72"  stroke="rgba(92,124,250,.24)" strokeWidth="1.1" strokeDasharray="5 9"  fill="none"/>
          <circle cx="250" cy="250" r="132" stroke="rgba(92,124,250,.14)" strokeWidth="1"   strokeDasharray="4 14" fill="none"/>
          <circle cx="250" cy="250" r="192" stroke="rgba(92,124,250,.08)" strokeWidth=".8"  strokeDasharray="3 16" fill="none"/>
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
              zIndex:2,
            }}
          >
            <div className="pm-ring" style={{ background:v.c, animationDelay:v.d }}/>
            <div className="pm-dot"  style={{ background:v.c }}/>
          </div>
        ))}

        {/* You dot */}
        <div className="pm-you-wrap">
          <div className="pm-you"/>
          <div className="pm-you-label">{youLabel}</div>
        </div>

        {/* Edge fade */}
        <div className="globe-fade"/>
      </motion.div>

      {/* ── Venue glass card (gold border, parallax layer 2) ── */}
      <motion.div
        className="fc-venue-layer"
        style={{ x: venueX, y: venueY }}
        initial={{ opacity:0, x:30 }}
        animate={{ opacity:1, x:0 }}
        transition={{ delay:0.6, duration:0.7, ease:[0.16,1,0.3,1] }}
      >
        <div className="fc-float-a">
          <div className="fc glass-venue">
            <div className="fc-header">
              <div className="fc-icon-wrap gold-icon">
                <IconBuildingStore size={15}/>
              </div>
              <div>
                <div className="fc-title">Playa Miramar</div>
                <div className="fc-sub">Beach Club · Bar</div>
              </div>
            </div>
            <div className="fc-stat gold-stat">
              <span className="fc-stat-dot alive-dot"/>
              <span style={{ color:"var(--color-success)" }}>12 personas aquí</span>
            </div>
            <div className="fc-msg">🎵 DJ en la terraza esta noche</div>
          </div>
        </div>
      </motion.div>

      {/* ── Chat glass card (blue border, parallax layer 3, opposite dir) ── */}
      <motion.div
        className="fc-chat-layer"
        style={{ x: chatX, y: chatY }}
        initial={{ opacity:0, x:-30 }}
        animate={{ opacity:1, x:0 }}
        transition={{ delay:0.8, duration:0.7, ease:[0.16,1,0.3,1] }}
      >
        <div className="fc-float-b">
          <div className="fc glass-chat">
            <div className="fc-header">
              <div className="fc-icon-wrap brand-icon">
                <IconMessageCircle size={15}/>
              </div>
              <div>
                <div className="fc-title">Noche en la ciudad</div>
                <div className="fc-sub">Grupo cercano · 248 miembros</div>
              </div>
            </div>
            <div className="fc-msg" style={{ marginTop:"10px" }}>
              ¿Alguien va al festival este finde? 🎤
            </div>
            <div className="fc-av-row">
              <div className="fav" style={{ background:"linear-gradient(135deg,var(--color-brand),var(--color-brand-purple))" }}>A</div>
              <div className="fav" style={{ background:"linear-gradient(135deg,var(--color-success),var(--color-brand))" }}>M</div>
              <div className="fav" style={{ background:"linear-gradient(135deg,var(--color-gold),var(--color-danger))" }}>R</div>
              <div className="fav" style={{ background:"linear-gradient(135deg,var(--color-brand-purple),var(--color-success))" }}>J</div>
              <span className="fav-count">+28 en el chat</span>
            </div>
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
      link.rel = "stylesheet";
      link.dataset["font"] = "space-grotesk";
      link.href =
        "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700;800&display=swap";
      document.head.appendChild(link);
    }
  }, []);

  const MotionLink = motion(Link);

  return (
    <>
      <style>{`
        /* ── Display font ──────────────────────────────── */
        .sg { font-family: 'Space Grotesk', system-ui, sans-serif; }

        /* ── Gradient text ─────────────────────────────── */
        .gtext {
          background: linear-gradient(135deg,
            var(--color-brand) 0%,
            #A78BFA 38%,
            var(--color-success) 68%,
            var(--color-brand) 100%);
          background-size: 300% 300%;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: gflow 7s ease infinite;
        }
        @keyframes gflow {
          0%  { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100%{ background-position: 0% 50%; }
        }

        /* ── Aurora blobs ──────────────────────────────── */
        .aurora-blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          pointer-events: none;
        }
        .ab1 {
          width:680px;height:680px;
          background:radial-gradient(circle,rgba(92,124,250,.3) 0%,transparent 70%);
          top:-14%;left:5%;
          animation:drift-a 26s ease-in-out infinite;
        }
        .ab2 {
          width:520px;height:520px;
          background:radial-gradient(circle,rgba(124,58,237,.24) 0%,transparent 70%);
          top:25%;right:-8%;
          animation:drift-b 32s ease-in-out infinite;
          animation-delay:-10s;
        }
        .ab3 {
          width:420px;height:420px;
          background:radial-gradient(circle,rgba(47,211,184,.16) 0%,transparent 70%);
          bottom:8%;left:28%;
          animation:drift-c 20s ease-in-out infinite;
          animation-delay:-6s;
        }
        .ab4 {
          width:280px;height:280px;
          background:radial-gradient(circle,rgba(167,139,250,.12) 0%,transparent 70%);
          top:14%;right:32%;
          animation:drift-a 38s ease-in-out infinite;
          animation-delay:-18s;
        }
        @keyframes drift-a {
          0%,100%{ transform:translate(0,0)       scale(1);    opacity:1; }
          33%    { transform:translate(36px,-24px) scale(1.05); opacity:.85; }
          66%    { transform:translate(-20px,16px) scale(.96);  opacity:.95; }
        }
        @keyframes drift-b {
          0%,100%{ transform:translate(0,0)       scale(1);    opacity:1; }
          40%    { transform:translate(-28px,22px) scale(1.07); opacity:.9; }
          75%    { transform:translate(16px,-12px) scale(.94);  opacity:1; }
        }
        @keyframes drift-c {
          0%,100%{ transform:translate(0,0)       scale(1);   opacity:1; }
          50%    { transform:translate(22px,-18px) scale(1.1); opacity:.85; }
        }

        /* ── Blueprint grid ────────────────────────────── */
        .bg-grid {
          position:absolute;inset:0;pointer-events:none;
          background-image:
            linear-gradient(rgba(92,124,250,.03) 1px,transparent 1px),
            linear-gradient(90deg,rgba(92,124,250,.03) 1px,transparent 1px);
          background-size:64px 64px;
          mask-image:linear-gradient(to bottom,transparent 0%,#000 12%,#000 88%,transparent 100%);
        }

        /* ── Pulse Globe ───────────────────────────────── */
        .globe-glow {
          position:absolute;top:50%;left:50%;
          transform:translate(-50%,-50%);
          width:400px;height:400px;border-radius:50%;
          background:radial-gradient(circle,
            rgba(92,124,250,.24) 0%,
            rgba(124,58,237,.14) 40%,
            rgba(47,211,184,.05) 65%,transparent 75%);
          filter:blur(28px);pointer-events:none;
          animation:glow-breathe 4.5s ease-in-out infinite;
        }
        @keyframes glow-breathe {
          0%,100%{transform:translate(-50%,-50%) scale(1);   opacity:.9;}
          50%    {transform:translate(-50%,-50%) scale(1.1); opacity:1;}
        }
        .orbit-ring {
          position:absolute;top:50%;left:50%;
          width:330px;height:330px;border-radius:50%;
          border:1px dashed rgba(92,124,250,.14);
          transform:translate(-50%,-50%);
          animation:orbit-spin 40s linear infinite;pointer-events:none;
        }
        @keyframes orbit-spin { to { transform:translate(-50%,-50%) rotate(360deg); } }
        .pm-ring {
          position:absolute;inset:0;border-radius:50%;
          animation:pm-ping 3.2s cubic-bezier(0,0,.2,1) infinite;
        }
        @keyframes pm-ping {
          0%      {transform:scale(1);   opacity:.8;}
          75%,100%{transform:scale(4.8); opacity:0;}
        }
        .pm-dot {
          position:absolute;inset:0;border-radius:50%;
          animation:pm-dot-pulse 2.6s ease-in-out infinite;
          z-index:1;
        }
        @keyframes pm-dot-pulse {
          0%,100%{opacity:1;transform:scale(1);}
          50%    {opacity:.65;transform:scale(.9);}
        }
        .pm-you-wrap {
          position:absolute;
          top:50%;left:50%;
          transform:translate(-50%,-50%);
          display:flex;flex-direction:column;align-items:center;
          z-index:5;
        }
        .pm-you {
          width:16px;height:16px;border-radius:50%;
          background:#fff;border:2.5px solid var(--color-brand);
          box-shadow:0 0 0 5px rgba(92,124,250,.18),0 0 22px rgba(92,124,250,.7);
        }
        .pm-you-label {
          margin-top:6px;font-size:8px;font-weight:700;
          letter-spacing:.12em;text-transform:uppercase;
          color:rgba(255,255,255,.35);white-space:nowrap;
          font-family:'Space Grotesk',sans-serif;
        }
        .globe-fade {
          position:absolute;inset:0;pointer-events:none;z-index:4;
          background:radial-gradient(ellipse 80% 80% at 50% 50%,transparent 38%,var(--bg-base) 100%);
        }

        /* ── Glass cards ───────────────────────────────── */
        .fc {
          background:rgba(10,12,28,.84);
          backdrop-filter:blur(32px) saturate(200%);
          -webkit-backdrop-filter:blur(32px) saturate(200%);
          border-radius:18px;padding:16px 18px;cursor:default;
        }
        .glass-venue {
          width:200px;
          border:1px solid rgba(245,158,11,.28);
          box-shadow:
            0 0 0 1px rgba(245,158,11,.12),
            0 0 28px rgba(245,158,11,.1),
            0 24px 60px rgba(0,0,0,.72),
            inset 0 1px 0 rgba(255,255,255,.07);
        }
        .glass-chat {
          width:210px;
          border:1px solid rgba(92,124,250,.28);
          box-shadow:
            0 0 0 1px rgba(92,124,250,.12),
            0 0 28px rgba(92,124,250,.12),
            0 24px 60px rgba(0,0,0,.72),
            inset 0 1px 0 rgba(255,255,255,.07);
        }
        .fc-vendor-layer, .fc-chat-layer { position:absolute; }
        .fc-venue-layer { top:6%;right:-14%; z-index:6; }
        .fc-chat-layer  { bottom:10%;left:-10%; z-index:6; }
        .fc-float-a { animation:float-a 6s ease-in-out infinite; }
        .fc-float-b { animation:float-b 7.5s ease-in-out infinite; }
        @keyframes float-a {
          0%,100%{transform:translateY(0)    rotate(-1.5deg);}
          50%    {transform:translateY(-10px) rotate(.5deg);}
        }
        @keyframes float-b {
          0%,100%{transform:translateY(0)   rotate(1.2deg);}
          50%    {transform:translateY(-9px) rotate(-.8deg);}
        }
        .fc-header { display:flex;align-items:center;gap:8px;margin-bottom:10px; }
        .fc-icon-wrap {
          width:32px;height:32px;border-radius:9px;
          display:flex;align-items:center;justify-content:center;flex-shrink:0;
        }
        .gold-icon  { background:rgba(245,158,11,.14);border:1px solid rgba(245,158,11,.25);color:#F59E0B; }
        .brand-icon { background:rgba(92,124,250,.14);border:1px solid rgba(92,124,250,.25);color:var(--color-brand); }
        .fc-title { font-size:13px;font-weight:700;line-height:1.3; }
        .fc-sub   { font-size:10.5px;color:rgba(255,255,255,.35);margin-top:1px; }
        .fc-stat  { display:flex;align-items:center;gap:5px;font-size:11.5px;font-weight:700;margin-top:8px; }
        .alive-dot {
          width:5px;height:5px;border-radius:50%;
          background:var(--color-success);
          box-shadow:0 0 6px var(--color-success);flex-shrink:0;
        }
        .fc-msg {
          font-size:11px;color:rgba(255,255,255,.58);
          background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.06);
          border-radius:8px;padding:7px 10px;line-height:1.45;margin-top:8px;
        }
        .fc-av-row { display:flex;margin-top:10px;align-items:center; }
        .fav {
          width:22px;height:22px;border-radius:50%;
          border:2px solid rgba(10,12,28,.9);
          margin-left:-6px;font-size:10px;font-weight:700;
          display:flex;align-items:center;justify-content:center;color:#fff;
        }
        .fav:first-child { margin-left:0; }
        .fav-count { font-size:10.5px;color:rgba(255,255,255,.35);margin-left:9px;font-weight:600; }

        /* ── Live eyebrow ──────────────────────────────── */
        @keyframes live-blink {
          0%,100%{opacity:1;box-shadow:0 0 10px var(--color-success),0 0 20px rgba(47,211,184,.4);}
          50%    {opacity:.4;box-shadow:0 0 4px var(--color-success);}
        }
        .live-dot {
          width:7px;height:7px;border-radius:50%;
          background:var(--color-success);
          box-shadow:0 0 10px var(--color-success),0 0 20px rgba(47,211,184,.4);
          flex-shrink:0;
          animation:live-blink 1.9s ease-in-out infinite;
        }

        /* ── Marquee ───────────────────────────────────── */
        @keyframes mq-fwd { from{transform:translateX(0)}   to{transform:translateX(-50%)} }
        @keyframes mq-rev { from{transform:translateX(-50%)} to{transform:translateX(0)}   }
        .mq-fwd { animation:mq-fwd 40s linear infinite; }
        .mq-rev { animation:mq-rev 47s linear infinite; }
        .mq-wrap:hover .mq-fwd,
        .mq-wrap:hover .mq-rev { animation-play-state:paused; }

        /* ── Flow steps ────────────────────────────────── */
        .flow-sep::after {
          content:'';position:absolute;top:38px;right:0;
          width:1px;height:calc(100% - 38px);
          background:linear-gradient(to bottom,rgba(255,255,255,.07),transparent);
        }

        /* ── Glass card base ───────────────────────────── */
        .gc {
          background:rgba(13,18,36,.65);
          border:1px solid rgba(255,255,255,.09);
          border-radius:22px;overflow:hidden;
          backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
          transition:border-color .3s;
        }
        .gc:hover { border-color:rgba(255,255,255,.14); }

        /* ── Groups card ───────────────────────────────── */
        .group-item {
          display:flex;align-items:center;gap:12px;
          background:rgba(6,8,18,.6);border:1px solid rgba(255,255,255,.08);
          border-radius:14px;padding:13px 14px;
          transition:border-color .22s,background .22s;cursor:pointer;
        }
        .group-item:hover {
          border-color:rgba(92,124,250,.32);
          background:rgba(92,124,250,.06);
        }
        .gi-join {
          margin-left:auto;font-size:11px;font-weight:700;
          color:var(--color-brand);padding:6px 14px;border-radius:8px;
          border:1px solid rgba(92,124,250,.28);background:rgba(92,124,250,.08);
          cursor:pointer;white-space:nowrap;
          transition:background .2s,border-color .2s;
        }
        .gi-join:hover{background:rgba(92,124,250,.18);border-color:rgba(92,124,250,.5);}

        /* ── Nav glass ─────────────────────────────────── */
        .nav-glass {
          backdrop-filter:blur(28px) saturate(180%);
          -webkit-backdrop-filter:blur(28px) saturate(180%);
        }

        /* ── Responsive ────────────────────────────────── */
        @media (max-width:900px) {
          .hero-grid   { grid-template-columns:1fr !important; }
          .hero-right  { display:none !important; }
          .b-grid      { grid-template-columns:1fr !important; }
          .b-span3     { grid-column:span 1 !important; min-height:300px; }
          .b-span2     { grid-column:span 1 !important; }
          .groups-grid { grid-template-columns:1fr !important; }
          .social-grid { grid-template-columns:1fr !important; }
          .footer-row  { flex-direction:column !important; gap:8px !important; }
        }
        @media (max-width:480px) {
          .hero-ctas { flex-direction:column !important; }
          .hero-cta-btn,
          .hero-cta-store { width:100% !important; justify-content:center !important; }
          .cta-btns { flex-direction:column !important; }
          .cta-btn-p,
          .cta-btn-s { width:100% !important; justify-content:center !important; }
        }

        /* ── Reduced motion ────────────────────────────── */
        @media (prefers-reduced-motion:reduce) {
          .gtext,.globe-glow,.orbit-ring,
          .pm-ring,.pm-dot,.live-dot,
          .fc-float-a,.fc-float-b,
          .ab1,.ab2,.ab3,.ab4,
          .mq-fwd,.mq-rev {
            animation:none !important;
          }
          .gtext { -webkit-text-fill-color:var(--color-brand); }
          .pm-you { box-shadow:0 0 0 2px var(--color-brand) !important; }
        }
      `}</style>

      <div style={{
        minHeight:"100vh",
        background:"var(--bg-base)",
        color:"var(--text-primary)",
        overflowX:"hidden",
      }}>

        {/* ══════════════════════════════════════════════
            AURORA (fixed decorative bg)
        ══════════════════════════════════════════════ */}
        <div aria-hidden="true" style={{ position:"fixed", inset:0, zIndex:0, overflow:"hidden", pointerEvents:"none" }}>
          <div className="aurora-blob ab1"/>
          <div className="aurora-blob ab2"/>
          <div className="aurora-blob ab3"/>
          <div className="aurora-blob ab4"/>
        </div>

        {/* ══════════════════════════════════════════════
            NAV
        ══════════════════════════════════════════════ */}
        <nav
          className="nav-glass"
          style={{
            position:"sticky", top:0, zIndex:50,
            display:"flex", alignItems:"center", justifyContent:"space-between",
            padding:"13px 40px",
            borderBottom:"1px solid rgba(255,255,255,.06)",
            background:"rgba(6,8,18,.8)",
          }}
        >
          {/* Logo */}
          <div style={{ display:"flex", alignItems:"center", gap:"9px" }}>
            <div style={{
              width:"32px", height:"32px", borderRadius:"9px",
              background:"linear-gradient(135deg,var(--color-brand),var(--color-brand-purple))",
              display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
              boxShadow:"0 0 14px rgba(92,124,250,.4)",
            }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2.5 4.5h11M2.5 8h7.5M2.5 11.5h5.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </div>
            <span className="sg" style={{ fontSize:"17px", fontWeight:800, letterSpacing:"-.025em" }}>JChat</span>
          </div>

          {/* Right nav */}
          <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
            <LanguageSwitcher />
            <Link href="/auth/login" style={{
              fontSize:"13px", fontWeight:600,
              color:"var(--text-secondary)",
              textDecoration:"none",
              padding:"7px 14px", borderRadius:"8px",
              border:"1px solid rgba(255,255,255,.08)",
              transition:"color .2s, border-color .2s",
            }}>
              {t("nav.signIn")}
            </Link>
            <motion.div whileHover={{ scale:1.02 }} whileTap={{ scale:.97 }}>
              <Link href="/auth/register" style={{
                display:"inline-flex", alignItems:"center",
                fontSize:"13px", fontWeight:700, color:"#fff",
                textDecoration:"none",
                padding:"7px 18px", borderRadius:"8px",
                background:"linear-gradient(135deg,var(--color-brand),var(--color-brand-purple))",
                boxShadow:"0 0 0 1px rgba(92,124,250,.4),0 2px 18px rgba(92,124,250,.3)",
              }}>
                {t("hero.createAccount")}
              </Link>
            </motion.div>
          </div>
        </nav>

        {/* ══════════════════════════════════════════════
            HERO
        ══════════════════════════════════════════════ */}
        <section style={{
          position:"relative", zIndex:1,
          minHeight:"100svh", overflow:"hidden",
          display:"flex", alignItems:"center",
          padding:"80px 40px",
        }}>
          {/* Blueprint grid */}
          <div className="bg-grid" aria-hidden="true"/>

          <div
            className="hero-grid"
            style={{
              maxWidth:"1200px", margin:"0 auto", width:"100%",
              display:"grid", gridTemplateColumns:"1fr 1fr",
              gap:"56px", alignItems:"center",
            }}
          >
            {/* ── LEFT — text ── */}
            <motion.div
              variants={stagger}
              initial="hidden"
              animate="show"
            >
              {/* Eyebrow */}
              <motion.div variants={fadeUp} style={{
                display:"inline-flex", alignItems:"center", gap:"8px",
                background:"rgba(47,211,184,.08)",
                border:"1px solid rgba(47,211,184,.22)",
                borderRadius:"99px", padding:"5px 14px 5px 10px",
                marginBottom:"26px",
              }}>
                <span className="live-dot"/>
                <span className="sg" style={{
                  fontSize:"11px", fontWeight:700,
                  letterSpacing:".08em", textTransform:"uppercase",
                  color:"var(--color-success)",
                }}>
                  {t("hero.eyebrow")}
                </span>
              </motion.div>

              {/* H1 */}
              <motion.h1
                variants={fadeUp}
                className="sg"
                style={{
                  fontSize:"clamp(42px,5.4vw,70px)",
                  fontWeight:800, lineHeight:1.03,
                  letterSpacing:"-.038em",
                  margin:"0 0 22px",
                }}
              >
                {t("hero.titleLine1")}<br/>
                <span className="gtext">{t("hero.titleLine2")}</span>
              </motion.h1>

              {/* Subtitle */}
              <motion.p variants={fadeUp} style={{
                fontSize:"17px",
                color:"var(--text-secondary)",
                lineHeight:1.7, margin:"0 0 36px",
                maxWidth:"400px",
              }}>
                {t("hero.subtitle")}
              </motion.p>

              {/* CTAs */}
              <motion.div
                variants={fadeUp}
                className="hero-ctas"
                style={{ display:"flex", gap:"12px", flexWrap:"wrap" }}
              >
                <motion.div whileHover={{ scale:1.02 }} whileTap={{ scale:.97 }}>
                  <Link
                    href="/auth/register"
                    className="hero-cta-btn"
                    style={{
                      display:"inline-flex", alignItems:"center", gap:"8px",
                      padding:"14px 28px", borderRadius:"12px",
                      background:"linear-gradient(135deg,var(--color-brand) 0%,var(--color-brand-purple) 50%,var(--color-brand) 100%)",
                      backgroundSize:"200% 200%",
                      color:"#fff", fontSize:"15px", fontWeight:700,
                      textDecoration:"none",
                      boxShadow:
                        "0 0 0 1px rgba(92,124,250,.45)," +
                        "0 4px 28px rgba(92,124,250,.4)," +
                        "0 0 60px rgba(92,124,250,.14)",
                    }}
                  >
                    {t("hero.createAccount")}
                    <IconArrowRight size={16}/>
                  </Link>
                </motion.div>
                <div
                  className="hero-cta-store"
                  style={{
                    display:"inline-flex", alignItems:"center", gap:"9px",
                    padding:"13px 22px", borderRadius:"12px",
                    border:"1px solid rgba(255,255,255,.12)",
                    color:"var(--text-secondary)",
                    fontSize:"13.5px", fontWeight:600,
                    background:"rgba(255,255,255,.04)",
                    backdropFilter:"blur(8px)",
                  }}
                >
                  <IconBrandApple size={15}/>
                  <IconBrandGooglePlay size={14}/>
                  {t("hero.downloadApp")}
                </div>
              </motion.div>
            </motion.div>

            {/* ── RIGHT — Pulse Globe ── */}
            <div
              className="hero-right"
              style={{ position:"relative", height:"560px" }}
            >
              <PulseGlobe youLabel={t("map.youAreHere")}/>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════
            MARQUEE
        ══════════════════════════════════════════════ */}
        <div style={{
          position:"relative", zIndex:1, overflow:"hidden",
          padding:"18px 0",
          borderTop:"1px solid rgba(255,255,255,.05)",
          borderBottom:"1px solid rgba(255,255,255,.05)",
          background:"rgba(255,255,255,.012)",
        }}>
          <div aria-hidden="true" style={{
            position:"absolute", inset:0, zIndex:5, pointerEvents:"none",
            background:
              "linear-gradient(90deg,var(--bg-base) 0%,transparent 9%," +
              "transparent 91%,var(--bg-base) 100%)",
          }}/>
          <div className="mq-wrap" style={{ overflow:"hidden", marginBottom:"6px" }}>
            <div className="mq-fwd" style={{ display:"flex", whiteSpace:"nowrap" }}>
              {ROW_A.map((city, i) => (
                <span key={i} style={{
                  display:"inline-flex", alignItems:"center", gap:"5px",
                  padding:"0 22px",
                  fontSize:"11px", fontWeight:600,
                  color:"rgba(255,255,255,.24)",
                  letterSpacing:".08em", textTransform:"uppercase",
                }}>
                  <IconMapPin size={8} style={{ color:"rgba(92,124,250,.5)", flexShrink:0 }}/>
                  {city}
                </span>
              ))}
            </div>
          </div>
          <div className="mq-wrap" style={{ overflow:"hidden" }}>
            <div className="mq-rev" style={{ display:"flex", whiteSpace:"nowrap" }}>
              {ROW_B.map((city, i) => (
                <span key={i} style={{
                  display:"inline-flex", alignItems:"center", gap:"5px",
                  padding:"0 22px",
                  fontSize:"11px", fontWeight:600,
                  color:"rgba(255,255,255,.16)",
                  letterSpacing:".08em", textTransform:"uppercase",
                }}>
                  <IconMapPin size={8} style={{ color:"rgba(167,139,250,.35)", flexShrink:0 }}/>
                  {city}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════
            HOW IT WORKS — bento asimétrico
        ══════════════════════════════════════════════ */}
        <section style={{ position:"relative", zIndex:1, padding:"96px 40px" }}>
          <div style={{ maxWidth:"1160px", margin:"0 auto" }}>

            {/* Header */}
            <motion.div
              initial="hidden" whileInView="show" viewport={{ once:true, margin:"-80px" }}
              variants={stagger}
              style={{ marginBottom:"52px" }}
            >
              <motion.p variants={fadeUp} style={{
                fontSize:"11px", fontWeight:700, textTransform:"uppercase",
                letterSpacing:".1em", color:"var(--color-brand)",
                marginBottom:"14px",
                fontFamily:"'Space Grotesk',sans-serif",
              }}>
                {t("howItWorks.label")}
              </motion.p>
              <motion.h2 variants={fadeUp} className="sg" style={{
                fontSize:"clamp(28px,3.2vw,44px)", fontWeight:800,
                letterSpacing:"-.035em", lineHeight:1.1, margin:"0 0 16px",
              }}>
                {t("howItWorks.title")}
              </motion.h2>
              <motion.p variants={fadeUp} style={{
                fontSize:"16px", color:"var(--text-secondary)",
                lineHeight:1.65, maxWidth:"480px",
              }}>
                {t("howItWorks.subtitle")}
              </motion.p>
            </motion.div>

            {/* Bento grid 5+3 */}
            <div
              className="b-grid"
              style={{
                display:"grid",
                gridTemplateColumns:"5fr 3fr",
                gridTemplateRows:"auto auto",
                gap:"16px",
              }}
            >
              {/* Large card: map + flow steps */}
              <motion.div
                className="gc b-span3"
                style={{
                  gridColumn:"1", gridRow:"1 / 3",
                  display:"flex", flexDirection:"column",
                  minHeight:"430px",
                }}
                initial={{ opacity:0, y:30 }}
                whileInView={{ opacity:1, y:0 }}
                viewport={{ once:true, margin:"-60px" }}
                transition={{ duration:.72, ease:[0.16,1,0.3,1] }}
                whileHover={{ y:-5, boxShadow:"0 32px 72px rgba(0,0,0,.55)" }}
              >
                {/* Card header */}
                <div style={{ padding:"32px 32px 0", display:"flex", alignItems:"flex-start", gap:"16px", marginBottom:"28px" }}>
                  <div style={{
                    width:"48px", height:"48px", borderRadius:"14px", flexShrink:0,
                    background:"rgba(92,124,250,.1)", border:"1px solid rgba(92,124,250,.2)",
                    display:"flex", alignItems:"center", justifyContent:"center",
                  }}>
                    <IconMapPin size={22} style={{ color:"var(--color-brand)" }}/>
                  </div>
                  <div>
                    <h3 className="sg" style={{
                      fontSize:"22px", fontWeight:800, letterSpacing:"-.022em",
                      lineHeight:1.2, margin:"0 0 8px",
                    }}>
                      {t("features.map.title")}
                    </h3>
                    <p style={{ fontSize:"14px", color:"var(--text-secondary)", lineHeight:1.6, margin:0 }}>
                      {t("features.map.description")}
                    </p>
                  </div>
                </div>

                {/* Flow steps */}
                <div style={{
                  marginTop:"auto",
                  display:"flex",
                  borderTop:"1px solid rgba(255,255,255,.07)",
                  marginLeft:0, marginRight:0,
                }}>
                  {/* Step 1 */}
                  {[
                    { tag:t("howItWorks.step1.tag"), title:t("howItWorks.step1.title"), desc:t("howItWorks.step1.desc"), color:"var(--color-brand)", rgba:"rgba(92,124,250,.12)", border:"rgba(92,124,250,.28)", glow:"rgba(92,124,250,.22)" },
                    { tag:t("howItWorks.step2.tag"), title:t("howItWorks.step2.title"), desc:t("howItWorks.step2.desc"), color:"#A78BFA",              rgba:"rgba(167,139,250,.12)",border:"rgba(167,139,250,.28)",glow:"rgba(167,139,250,.2)"  },
                    { tag:t("howItWorks.step3.tag"), title:t("howItWorks.step3.title"), desc:t("howItWorks.step3.desc"), color:"var(--color-success)",  rgba:"rgba(47,211,184,.12)", border:"rgba(47,211,184,.28)", glow:"rgba(47,211,184,.2)"  },
                  ].map((step, i) => (
                    <div
                      key={i}
                      className={i < 2 ? "flow-sep" : ""}
                      style={{
                        flex:1, display:"flex", flexDirection:"column",
                        alignItems:"center", textAlign:"center",
                        padding:"26px 14px 30px",
                        position:"relative",
                      }}
                    >
                      <div style={{
                        width:"48px", height:"48px", borderRadius:"13px",
                        background:step.rgba, border:`1px solid ${step.border}`,
                        display:"flex", alignItems:"center", justifyContent:"center",
                        fontFamily:"'Space Grotesk',sans-serif",
                        fontSize:"20px", fontWeight:800, color:step.color,
                        boxShadow:`0 0 20px ${step.glow}`,
                        margin:"0 auto 14px",
                      }}>
                        {i+1}
                      </div>
                      <div style={{
                        fontSize:"9.5px", fontWeight:700, textTransform:"uppercase",
                        letterSpacing:".1em", color:step.color,
                        marginBottom:"5px",
                        fontFamily:"'Space Grotesk',sans-serif",
                      }}>
                        {step.tag}
                      </div>
                      <h4 className="sg" style={{ fontSize:"13.5px", fontWeight:700, margin:"0 0 5px" }}>
                        {step.title}
                      </h4>
                      <p style={{ fontSize:"11.5px", color:"var(--text-secondary)", lineHeight:1.5, margin:0 }}>
                        {step.desc}
                      </p>
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* Small card: Chat */}
              <motion.div
                className="gc b-span2"
                style={{ padding:"26px", display:"flex", flexDirection:"column", gap:"14px" }}
                initial={{ opacity:0, y:30 }}
                whileInView={{ opacity:1, y:0 }}
                viewport={{ once:true, margin:"-60px" }}
                transition={{ delay:.1, duration:.72, ease:[0.16,1,0.3,1] }}
                whileHover={{ y:-5, boxShadow:"0 32px 72px rgba(0,0,0,.55)" }}
              >
                <div style={{
                  width:"46px", height:"46px", borderRadius:"14px",
                  background:"rgba(47,211,184,.1)", border:"1px solid rgba(47,211,184,.2)",
                  display:"flex", alignItems:"center", justifyContent:"center",
                }}>
                  <IconMessageCircle size={20} style={{ color:"var(--color-success)" }}/>
                </div>
                <div>
                  <h3 className="sg" style={{ fontSize:"16px", fontWeight:700, margin:"0 0 6px" }}>
                    {t("features.chat.title")}
                  </h3>
                  <p style={{ fontSize:"13px", color:"var(--text-secondary)", lineHeight:1.56, margin:0 }}>
                    {t("features.chat.description")}
                  </p>
                </div>
                {/* Mini chat preview */}
                <div style={{ marginTop:"auto", display:"flex", flexDirection:"column", gap:"5px" }}>
                  {[
                    { msg:"Someone close just joined 👋", out:false },
                    { msg:"The chat is alive tonight",    out:true  },
                  ].map((b, i) => (
                    <div key={i} style={{
                      alignSelf:b.out ? "flex-end" : "flex-start",
                      background:b.out ? "rgba(47,211,184,.14)" : "rgba(255,255,255,.06)",
                      border:`1px solid ${b.out ? "rgba(47,211,184,.22)" : "rgba(255,255,255,.07)"}`,
                      borderRadius:b.out ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                      padding:"6px 11px",
                      fontSize:"10.5px", fontWeight:600,
                      color:b.out ? "var(--color-success)" : "var(--text-secondary)",
                      maxWidth:"90%",
                    }}>
                      {b.msg}
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* Small card: Groups */}
              <motion.div
                className="gc b-span2"
                style={{ padding:"26px", display:"flex", flexDirection:"column", gap:"14px" }}
                initial={{ opacity:0, y:30 }}
                whileInView={{ opacity:1, y:0 }}
                viewport={{ once:true, margin:"-60px" }}
                transition={{ delay:.2, duration:.72, ease:[0.16,1,0.3,1] }}
                whileHover={{ y:-5, boxShadow:"0 32px 72px rgba(0,0,0,.55)" }}
              >
                <div style={{
                  width:"46px", height:"46px", borderRadius:"14px",
                  background:"rgba(245,158,11,.1)", border:"1px solid rgba(245,158,11,.2)",
                  display:"flex", alignItems:"center", justifyContent:"center",
                }}>
                  <IconUsers size={20} style={{ color:"var(--color-gold)" }}/>
                </div>
                <div>
                  <h3 className="sg" style={{ fontSize:"16px", fontWeight:700, margin:"0 0 6px" }}>
                    {t("features.groups.title")}
                  </h3>
                  <p style={{ fontSize:"13px", color:"var(--text-secondary)", lineHeight:1.56, margin:0 }}>
                    {t("features.groups.description")}
                  </p>
                </div>
                {/* Avatar stack */}
                <div style={{ marginTop:"auto", display:"flex", alignItems:"center" }}>
                  {[
                    "var(--color-brand)","var(--color-success)","var(--color-gold)",
                    "var(--color-brand-purple)","var(--color-danger)",
                  ].map((c, i) => (
                    <div key={i} style={{
                      width:"28px", height:"28px", borderRadius:"50%",
                      background:c, border:"2px solid var(--bg-surface)",
                      marginLeft:i > 0 ? "-7px" : 0, zIndex:5-i, position:"relative",
                    }}/>
                  ))}
                  <span style={{
                    marginLeft:"10px", fontSize:"11px", fontWeight:600,
                    color:"var(--text-tertiary)",
                  }}>
                    + groups near you
                  </span>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════
            GROUPS SPOTLIGHT
        ══════════════════════════════════════════════ */}
        <section style={{ position:"relative", zIndex:1, padding:"0 40px 96px" }}>
          <div style={{ maxWidth:"1160px", margin:"0 auto" }}>
            <motion.div
              initial={{ opacity:0, y:30 }}
              whileInView={{ opacity:1, y:0 }}
              viewport={{ once:true, margin:"-60px" }}
              transition={{ duration:.72, ease:[0.16,1,0.3,1] }}
              style={{
                borderRadius:"28px",
                background:"linear-gradient(135deg,rgba(92,124,250,.09) 0%,rgba(124,58,237,.06) 60%,rgba(47,211,184,.03) 100%)",
                border:"1px solid rgba(92,124,250,.2)",
                padding:"52px",
                boxShadow:"0 0 80px rgba(92,124,250,.07)",
                position:"relative", overflow:"hidden",
              }}
            >
              {/* Glow orb */}
              <div aria-hidden="true" style={{
                position:"absolute", top:"-120px", right:"-120px",
                width:"380px", height:"380px", borderRadius:"50%",
                background:"radial-gradient(circle,rgba(92,124,250,.2) 0%,transparent 65%)",
                filter:"blur(50px)", pointerEvents:"none",
              }}/>

              <div
                className="groups-grid"
                style={{
                  display:"grid", gridTemplateColumns:"1fr 1fr",
                  gap:"52px", alignItems:"center",
                }}
              >
                {/* Left */}
                <div>
                  <div style={{
                    display:"inline-flex", alignItems:"center", gap:"7px",
                    background:"rgba(92,124,250,.12)",
                    border:"1px solid rgba(92,124,250,.3)",
                    borderRadius:"99px", padding:"5px 14px",
                    fontSize:"11px", fontWeight:700,
                    letterSpacing:".07em", textTransform:"uppercase",
                    color:"#A78BFA", marginBottom:"20px",
                    width:"fit-content",
                    fontFamily:"'Space Grotesk',sans-serif",
                    boxShadow:"0 0 20px rgba(167,139,250,.15)",
                  }}>
                    {t("groups.badge")}
                  </div>
                  <h2 className="sg" style={{
                    fontSize:"clamp(24px,2.8vw,38px)", fontWeight:800,
                    letterSpacing:"-.03em", lineHeight:1.1, margin:"0 0 18px",
                  }}>
                    {t("groups.title")}
                  </h2>
                  <p style={{
                    fontSize:"16px", color:"var(--text-secondary)",
                    lineHeight:1.65, margin:"0 0 28px",
                  }}>
                    {t("groups.body")}
                  </p>

                  {/* Features */}
                  <div style={{ display:"flex", flexDirection:"column", gap:"14px" }}>
                    {[
                      { icon:<IconPin size={16}/>,          key:"f1", bg:"rgba(92,124,250,.1)",  border:"rgba(92,124,250,.18)"  },
                      { icon:<IconBellRinging size={16}/>,  key:"f2", bg:"rgba(167,139,250,.1)", border:"rgba(167,139,250,.18)" },
                      { icon:<IconMask size={16}/>,         key:"f3", bg:"rgba(47,211,184,.1)",  border:"rgba(47,211,184,.18)"  },
                    ].map((f) => (
                      <div key={f.key} style={{ display:"flex", alignItems:"flex-start", gap:"12px" }}>
                        <div style={{
                          width:"36px", height:"36px", borderRadius:"10px",
                          background:f.bg, border:`1px solid ${f.border}`,
                          display:"flex", alignItems:"center", justifyContent:"center",
                          flexShrink:0, color:"var(--color-brand)",
                        }}>
                          {f.icon}
                        </div>
                        <div>
                          <div style={{ fontSize:"13px", fontWeight:700, marginBottom:"3px" }}>
                            {t(`groups.${f.key}.title`)}
                          </div>
                          <div style={{ fontSize:"12px", color:"var(--text-secondary)", lineHeight:1.45 }}>
                            {t(`groups.${f.key}.body`)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <motion.div whileHover={{ scale:1.02 }} whileTap={{ scale:.97 }} style={{ marginTop:"28px", width:"fit-content" }}>
                    <Link href="/pricing" style={{
                      display:"inline-flex", alignItems:"center", gap:"8px",
                      padding:"13px 24px", borderRadius:"11px",
                      background:"linear-gradient(135deg,var(--color-brand),var(--color-brand-purple))",
                      color:"#fff", fontSize:"14px", fontWeight:700, textDecoration:"none",
                      boxShadow:"0 0 0 1px rgba(92,124,250,.4),0 4px 24px rgba(92,124,250,.36)",
                    }}>
                      {t("groups.cta")}
                      <IconArrowRight size={15}/>
                    </Link>
                  </motion.div>
                </div>

                {/* Right: group list */}
                <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
                  {[
                    { emoji:"🏄", name:"Surf & Playa BCN",      online:34, members:248 },
                    { emoji:"🍜", name:"Foodies de la Ciudad",  online:12, members:519 },
                    { emoji:"🎸", name:"Noche Rock Madrid",     online:67, members:1240 },
                    { emoji:"📸", name:"Fotógrafos Urbanos",    online:8,  members:382 },
                  ].map((g, i) => (
                    <motion.div
                      key={i}
                      className="group-item"
                      whileHover={{ x:2 }}
                      transition={{ duration:.18 }}
                    >
                      <div style={{
                        width:"42px", height:"42px", borderRadius:"12px",
                        background:"rgba(92,124,250,.08)", border:"1px solid rgba(92,124,250,.12)",
                        display:"flex", alignItems:"center", justifyContent:"center",
                        fontSize:"20px", flexShrink:0,
                      }}>
                        {g.emoji}
                      </div>
                      <div>
                        <div style={{ fontSize:"13.5px", fontWeight:700, marginBottom:"3px" }}>{g.name}</div>
                        <div style={{ fontSize:"11px", color:"var(--text-tertiary)", display:"flex", gap:"8px", alignItems:"center" }}>
                          <span style={{ color:"var(--color-success)", fontWeight:700, display:"flex", alignItems:"center", gap:"4px" }}>
                            <span style={{
                              width:"5px", height:"5px", borderRadius:"50%",
                              background:"var(--color-success)",
                              display:"inline-block",
                            }}/>
                            {g.online} online
                          </span>
                          <span>· {g.members.toLocaleString()} members</span>
                        </div>
                      </div>
                      <div className="gi-join">Join</div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════
            SOCIAL FEATURES — 3 cards
        ══════════════════════════════════════════════ */}
        <section style={{ position:"relative", zIndex:1, padding:"0 40px 96px" }}>
          <div style={{ maxWidth:"1160px", margin:"0 auto" }}>
            <motion.div
              initial="hidden" whileInView="show" viewport={{ once:true, margin:"-60px" }}
              variants={stagger}
              style={{ textAlign:"center", marginBottom:"48px" }}
            >
              <motion.p variants={fadeUp} style={{
                fontSize:"11px", fontWeight:700, textTransform:"uppercase",
                letterSpacing:".1em", color:"var(--color-brand)",
                marginBottom:"14px", fontFamily:"'Space Grotesk',sans-serif",
              }}>
                {t("features.title")}
              </motion.p>
              <motion.h2 variants={fadeUp} className="sg" style={{
                fontSize:"clamp(26px,3vw,42px)", fontWeight:800,
                letterSpacing:"-.032em", lineHeight:1.1, margin:"0 0 14px",
              }}>
                {t("social.title")}
              </motion.h2>
              <motion.p variants={fadeUp} style={{
                fontSize:"16px", color:"var(--text-secondary)",
                lineHeight:1.65, maxWidth:"440px", margin:"0 auto",
              }}>
                {t("social.body")}
              </motion.p>
            </motion.div>

            <div
              className="social-grid"
              style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"14px" }}
            >
              {[
                {
                  icon:<IconMapPin size={22}/>,
                  title:t("features.map.title"),
                  desc:t("features.map.description"),
                  bg:"rgba(92,124,250,.1)", border:"rgba(92,124,250,.2)",
                  delay:0,
                },
                {
                  icon:<IconMessageCircle size={22}/>,
                  title:t("features.chat.title"),
                  desc:t("features.chat.description"),
                  bg:"rgba(47,211,184,.1)", border:"rgba(47,211,184,.2)",
                  delay:.1,
                },
                {
                  icon:<IconUsers size={22}/>,
                  title:t("features.groups.title"),
                  desc:t("features.groups.description"),
                  bg:"rgba(245,158,11,.1)", border:"rgba(245,158,11,.2)",
                  delay:.2,
                },
              ].map((card, i) => (
                <motion.div
                  key={i}
                  className="gc"
                  style={{ padding:"28px", display:"flex", flexDirection:"column", gap:"16px" }}
                  initial={{ opacity:0, y:30 }}
                  whileInView={{ opacity:1, y:0 }}
                  viewport={{ once:true, margin:"-60px" }}
                  transition={{ delay:card.delay, duration:.72, ease:[0.16,1,0.3,1] }}
                  whileHover={{ y:-6, boxShadow:"0 28px 66px rgba(0,0,0,.52)" }}
                >
                  <div style={{
                    width:"50px", height:"50px", borderRadius:"15px",
                    background:card.bg, border:`1px solid ${card.border}`,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    color:"var(--color-brand)",
                  }}>
                    {card.icon}
                  </div>
                  <div>
                    <h3 className="sg" style={{ fontSize:"17px", fontWeight:700, margin:"0 0 8px", lineHeight:1.25 }}>
                      {card.title}
                    </h3>
                    <p style={{ fontSize:"13px", color:"var(--text-secondary)", lineHeight:1.6, margin:0 }}>
                      {card.desc}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════
            CTA FINAL
        ══════════════════════════════════════════════ */}
        <section style={{ position:"relative", zIndex:1, padding:"0 40px 96px" }}>
          <div style={{ maxWidth:"1160px", margin:"0 auto" }}>
            <motion.div
              initial={{ opacity:0, y:30 }}
              whileInView={{ opacity:1, y:0 }}
              viewport={{ once:true, margin:"-60px" }}
              transition={{ duration:.72, ease:[0.16,1,0.3,1] }}
              style={{
                textAlign:"center", position:"relative",
                padding:"88px 40px",
                borderRadius:"28px",
                border:"1px solid rgba(92,124,250,.2)",
                background:"rgba(13,18,36,.5)",
                overflow:"hidden",
              }}
            >
              {/* Glows */}
              <div aria-hidden="true" style={{
                position:"absolute", top:"50%", left:"50%",
                transform:"translate(-50%,-50%)",
                width:"560px", height:"300px", borderRadius:"50%",
                background:"radial-gradient(ellipse,rgba(92,124,250,.22) 0%,rgba(124,58,237,.12) 40%,transparent 68%)",
                filter:"blur(48px)", pointerEvents:"none",
                animation:"glow-breathe 5s ease-in-out infinite",
              }}/>
              <div aria-hidden="true" style={{
                position:"absolute", top:"50%", left:"50%",
                transform:"translate(-50%,-50%)",
                width:"280px", height:"180px", borderRadius:"50%",
                background:"radial-gradient(ellipse,rgba(47,211,184,.12) 0%,transparent 70%)",
                filter:"blur(38px)", pointerEvents:"none",
                animation:"glow-breathe 5s ease-in-out infinite",
                animationDelay:"2.5s",
              }}/>

              <h2 className="sg" style={{
                fontSize:"clamp(28px,4vw,52px)", fontWeight:800,
                letterSpacing:"-.038em", lineHeight:1.07,
                margin:"0 0 20px", position:"relative",
              }}>
                {t("cta.title")}<br/>
                <span className="gtext">{t("cta.titleGradient")}</span>
              </h2>
              <p style={{
                fontSize:"17px", color:"var(--text-secondary)",
                lineHeight:1.65, margin:"0 0 40px",
                maxWidth:"400px", marginLeft:"auto", marginRight:"auto",
                position:"relative",
              }}>
                {t("cta.sub")}
              </p>
              <div
                className="cta-btns"
                style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:"14px", flexWrap:"wrap", position:"relative" }}
              >
                <motion.div whileHover={{ scale:1.02 }} whileTap={{ scale:.97 }}>
                  <Link
                    href="/auth/register"
                    className="cta-btn-p"
                    style={{
                      display:"inline-flex", alignItems:"center", gap:"10px",
                      padding:"16px 36px", borderRadius:"13px",
                      background:"linear-gradient(135deg,var(--color-brand) 0%,var(--color-brand-purple) 50%,var(--color-brand) 100%)",
                      backgroundSize:"200% 200%",
                      color:"#fff", fontSize:"16px", fontWeight:700,
                      textDecoration:"none",
                      boxShadow:
                        "0 0 0 1px rgba(92,124,250,.45)," +
                        "0 8px 44px rgba(92,124,250,.46)," +
                        "0 0 90px rgba(92,124,250,.18)",
                    }}
                  >
                    <IconArrowRight size={16}/>
                    {t("cta.btnPrimary")}
                  </Link>
                </motion.div>
                <motion.div whileHover={{ scale:1.02 }} whileTap={{ scale:.97 }}>
                  <Link
                    href="/pricing"
                    className="cta-btn-s"
                    style={{
                      display:"inline-flex", alignItems:"center", gap:"8px",
                      padding:"16px 28px", borderRadius:"13px",
                      background:"rgba(255,255,255,.04)",
                      border:"1px solid rgba(255,255,255,.12)",
                      color:"var(--text-secondary)",
                      fontSize:"14px", fontWeight:600,
                      textDecoration:"none",
                      backdropFilter:"blur(8px)",
                    }}
                  >
                    {t("cta.btnSec")} →
                  </Link>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════
            FOOTER
        ══════════════════════════════════════════════ */}
        <footer style={{
          position:"relative", zIndex:1,
          borderTop:"1px solid rgba(255,255,255,.05)",
          padding:"28px 40px",
        }}>
          <div
            className="footer-row"
            style={{ maxWidth:"1160px", margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:"12px" }}
          >
            <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
              <span className="sg" style={{ fontWeight:800, fontSize:"15px", color:"var(--text-secondary)" }}>JChat</span>
              <span style={{ color:"var(--text-tertiary)" }}>·</span>
              <span style={{ fontSize:"12.5px", color:"var(--text-tertiary)" }}>{t("footer.copyright")}</span>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
              <span style={{ fontSize:"12.5px", color:"var(--text-tertiary)" }}>{t("footer.business")}</span>
              <Link href="/pricing" style={{
                fontSize:"12.5px", fontWeight:600, color:"var(--color-brand)",
                textDecoration:"none",
              }}>
                {t("footer.businessLink")} →
              </Link>
            </div>
          </div>
        </footer>

      </div>
    </>
  );
}
