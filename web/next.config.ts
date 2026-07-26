import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

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

// ── Modo del CSP ──────────────────────────────────────────────────────────────
// true  = Report-Only: observa y REPORTA violaciones (a /api/csp-report), NO bloquea. Úsalo para VALIDAR.
// false = enforce: bloquea de verdad. Poner en false SOLO cuando, tras recorrer los flujos en un preview,
//         /api/csp-report NO haya logueado ninguna violación legítima en los logs de Vercel.
const CSP_REPORT_ONLY = false;

// CSP como allowlist. El MODO lo controla `CSP_REPORT_ONLY` (abajo): en ENFORCE, validado (2026-07-26) —
// se ejerció producción (login + 18 páginas del dashboard, incluidas payments y disputes con Stripe) en
// Report-Only y /api/csp-report no registró ninguna violación. El endpoint sigue vigilando en enforce.
// Historial (hallazgo #8): un flip prematuro a enforce llegó a prod vía auto-deploy y rompió cosas; por eso
// ahora se valida en Report-Only y se pasa a enforce con un solo toggle, no a mano en el key. Incluye:
//   · hCaptcha (D-38): script/style/frame/connect a hcaptcha.com y *.hcaptcha.com.
//   · Stripe (ruta del dinero): js.stripe.com + m.stripe.network (fraude/3DS) + q.stripe.com (telemetría).
//   · Google Maps: su JS inyecta en runtime un <link> a fonts.googleapis.com (Roboto), servida desde gstatic.
//
// VALIDACIÓN → ENFORCE: desplegar a un preview, recorrer los flujos con la consola abierta, revisar que
// /api/csp-report no loguee violaciones legítimas, y sólo entonces poner CSP_REPORT_ONLY = false.
// Al añadir un origen externo nuevo: agrégalo al directivo correspondiente aquí.
const csp = [
  `default-src 'self'`,
  // Next.js necesita 'unsafe-inline'/'unsafe-eval' para su runtime; + Stripe JS + Maps JS.
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://maps.googleapis.com https://*.googleapis.com https://*.gstatic.com https://hcaptcha.com https://*.hcaptcha.com`,
  // 'unsafe-inline' cubre los estilos inline de React (style={{…}}); hCaptcha + el <link>
  // a fonts.googleapis.com que Google Maps inyecta en runtime (Roboto del mapa).
  `style-src 'self' 'unsafe-inline' https://hcaptcha.com https://*.hcaptcha.com https://fonts.googleapis.com`,
  // Imágenes: self + data/blob + Storage de Supabase + tiles/avatares de Google Maps + telemetría de Stripe (q.stripe.com).
  `img-src 'self' data: blob: ${SUPABASE} https://*.googleapis.com https://*.gstatic.com https://*.google.com https://*.googleusercontent.com https://*.ggpht.com https://q.stripe.com`,
  // Fuentes self-hosted (next/font) + data: + fonts.gstatic.com (Roboto que sirve el mapa).
  `font-src 'self' data: https://fonts.gstatic.com`,
  // API + Realtime (Supabase, wss), Stripe API + m.stripe.network (fraude/3DS), Maps tiles, hCaptcha verify.
  `connect-src 'self' ${SUPABASE} ${SUPABASE_WS} https://api.stripe.com https://m.stripe.network https://maps.googleapis.com https://*.googleapis.com https://*.gstatic.com https://hcaptcha.com https://*.hcaptcha.com`,
  // Stripe monta iframes para 3D Secure / payment elements / Identity (js.stripe.com,
  // hooks.stripe.com, m.stripe.network); hCaptcha su reto.
  `frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://m.stripe.network https://hcaptcha.com https://*.hcaptcha.com`,
  `worker-src 'self' blob:`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'none'`,
  // Reporta violaciones al endpoint interno (visibles en logs de Vercel). Relativa a propósito
  // (funciona igual en preview y en prod).
  `report-uri /api/csp-report`,
].join("; ");

const securityHeaders = [
  // Modo controlado por CSP_REPORT_ONLY (arriba). Con reporte activo (report-uri) las
  // violaciones salen en los logs de Vercel en cualquiera de los dos modos.
  { key: CSP_REPORT_ONLY ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy", value: csp },
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

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withNextIntl(nextConfig);
