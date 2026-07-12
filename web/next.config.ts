import type { NextConfig } from "next";

// ─── Security headers + CSP (W1, auditoría 2026-07-09) ────────────────────────
//
// Dominios externos CALIBRADOS contra el uso real de la app (verificado en código):
//   · Supabase (klfsgcfoahdtkojyqspd.supabase.co): REST / Auth / Storage + Realtime (wss).
//   · Google Maps (@vis.gl/react-google-maps): maps.googleapis.com + *.googleapis /
//     *.gstatic / *.google (tiles, JS del mapa).
//   · Stripe: PRE-PROVISIONADO para el checkout web (FASE 5 / W5) y Stripe Identity.
//     El cliente (@stripe/stripe-js) aún NO se carga hoy en web (solo el SDK server
//     `stripe`), pero se deja en el allowlist para no re-editar al llegar W5. Inocuo:
//     el CSP arranca en Report-Only.
//   · Fuentes: se usan vía `next/font/google` → AUTO-HOSPEDADAS en build y servidas
//     desde 'self'. Por eso NO se incluyen fonts.googleapis.com / fonts.gstatic.com
//     (no se hace ningún request externo a Google Fonts en runtime).
//
const SUPABASE = "https://klfsgcfoahdtkojyqspd.supabase.co";
const SUPABASE_WS = "wss://klfsgcfoahdtkojyqspd.supabase.co";

// CSP como allowlist. EN ENFORCE (hallazgo #8 de la auditoría, 2026-07): tras la fase
// de calibración en Report-Only se hizo el flip a "Content-Security-Policy". Ahora SÍ
// bloquea cualquier origen fuera del allowlist. Incluye hCaptcha (D-38): script/style/
// frame/connect a hcaptcha.com y *.hcaptcha.com — sin ellos el reto muere en silencio.
//
// Al añadir un origen externo nuevo: agrégalo al directivo correspondiente aquí, o el
// navegador lo bloqueará.
const csp = [
  `default-src 'self'`,
  // Next.js necesita 'unsafe-inline'/'unsafe-eval' para su runtime; + Stripe JS + Maps JS.
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://maps.googleapis.com https://*.googleapis.com https://*.gstatic.com https://hcaptcha.com https://*.hcaptcha.com`,
  // 'unsafe-inline' cubre los estilos inline de React (style={{…}}) usados en todo el dashboard.
  `style-src 'self' 'unsafe-inline' https://hcaptcha.com https://*.hcaptcha.com`,
  // Imágenes: self + data/blob + Storage de Supabase + tiles/avatares de Google Maps.
  `img-src 'self' data: blob: ${SUPABASE} https://*.googleapis.com https://*.gstatic.com https://*.google.com https://*.googleusercontent.com https://*.ggpht.com`,
  // Fuentes self-hosted (next/font) + data: por si alguna va inline.
  `font-src 'self' data:`,
  // API + Realtime (Supabase, wss), Stripe API, Maps tiles, hCaptcha verify.
  `connect-src 'self' ${SUPABASE} ${SUPABASE_WS} https://api.stripe.com https://maps.googleapis.com https://*.googleapis.com https://*.gstatic.com https://hcaptcha.com https://*.hcaptcha.com`,
  // Stripe monta iframes para 3D Secure / payment elements / Identity; hCaptcha su reto.
  `frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://hcaptcha.com https://*.hcaptcha.com`,
  `worker-src 'self' blob:`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'none'`,
].join("; ");

const securityHeaders = [
  // CSP en ENFORCE (hallazgo #8 — ver nota arriba).
  { key: "Content-Security-Policy", value: csp },
  // El resto SÍ en enforce (seguras, verificado que no rompen nada en esta app):
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nada en web usa cámara/micrófono del navegador (verificado); geolocation/payment self.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=(self)" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
