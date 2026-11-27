// Recibe reportes de violación de CSP (directiva report-uri) y los loguea → visibles en los
// logs de runtime de Vercel. Endpoint público sin auth (el navegador envía los reportes sin
// credenciales). Es solo un sumidero de logs para VALIDAR el CSP antes de pasarlo a enforce.
// `?p=strict` marca los reportes de la política estricta con nonce (Content-Security-Policy-Report-Only,
// lib/csp.ts); sin parámetro son los de la política que se aplica hoy (next.config.ts).
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const tag = new URL(request.url).searchParams.get("p") === "strict" ? "[csp-report:strict]" : "[csp-report]";
  try {
    const raw = await request.text();
    const body = raw.length > 8000 ? raw.slice(0, 8000) + "…[truncado]" : raw;
    console.warn(tag, body);
  } catch (err) {
    console.warn(tag, "error al leer el reporte:", err);
  }
  return new Response(null, { status: 204 });
}

export async function GET() {
  return new Response("CSP report endpoint (POST only)", { status: 405 });
}
