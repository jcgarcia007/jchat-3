// TEMPORAL (Lote 3, vuelta 3) — se borra en la vuelta siguiente. Diagnóstico de por qué en Vercel el render de Next no recibe el nonce.
// Devuelve SOLO booleanos, longitudes y NOMBRES de cabeceras: nunca valores (ni del nonce, ni de cookies, ni de ninguna cabecera).
import { getScriptNonceFromHeader } from "next/dist/server/app-render/get-script-nonce-from-header";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store, max-age=0" };

export async function GET(request: Request) {
  const h = request.headers;
  const csp = h.get("content-security-policy");
  const cspRo = h.get("content-security-policy-report-only");
  const xNonce = h.get("x-nonce");
  const names = [...h.keys()];

  const body = {
    // ¿llegan a la función las cabeceras que pone el middleware?
    hasCsp: csp !== null,
    cspLen: csp?.length ?? 0,
    cspHasNonceToken: csp?.includes("'nonce-") ?? false,
    hasCspReportOnly: cspRo !== null,
    cspReportOnlyLen: cspRo?.length ?? 0,
    cspReportOnlyHasNonceToken: cspRo?.includes("'nonce-") ?? false,
    hasXNonce: xNonce !== null,
    xNonceLen: xNonce?.length ?? 0,
    // ¿el propio parser de Next saca un nonce de lo que le llega? (booleano: nunca el valor)
    nextParsesNonceFromCsp: csp ? typeof getScriptNonceFromHeader(csp) === "string" : false,
    nextParsesNonceFromReportOnly: cspRo ? typeof getScriptNonceFromHeader(cspRo) === "string" : false,
    // ¿coincide el nonce de la cabecera con x-nonce? (booleano)
    cspNonceEqualsXNonce: csp && xNonce ? getScriptNonceFromHeader(csp) === xNonce : null,
    // nombres (no valores) de las cabeceras x-middleware* y recuento total de cabeceras
    xMiddlewareHeaderNames: names.filter((n) => n.startsWith("x-middleware")),
    headerCount: names.length,
    // entorno de ejecución
    vercel: process.env.VERCEL === "1",
    minimalModeEnv: process.env.NEXT_PRIVATE_MINIMAL_MODE === "1",
    runtime: process.env.NEXT_RUNTIME ?? "nodejs",
    nodeEnv: process.env.NODE_ENV,
  };
  return Response.json(body, { headers: NO_STORE });
}
