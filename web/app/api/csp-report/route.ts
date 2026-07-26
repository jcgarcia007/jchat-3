// Recibe reportes de violación de CSP (directiva report-uri) y los loguea → visibles en los
// logs de runtime de Vercel. Endpoint público sin auth (el navegador envía los reportes sin
// credenciales). Es solo un sumidero de logs para VALIDAR el CSP antes de pasarlo a enforce.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    const body = raw.length > 8000 ? raw.slice(0, 8000) + "…[truncado]" : raw;
    console.warn("[csp-report]", body);
  } catch (err) {
    console.warn("[csp-report] error al leer el reporte:", err);
  }
  return new Response(null, { status: 204 });
}

export async function GET() {
  return new Response("CSP report endpoint (POST only)", { status: 405 });
}
