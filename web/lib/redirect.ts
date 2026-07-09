/**
 * JChat 3.0 — Safe redirect-path guard (W2, auditoría 2026-07-09).
 *
 * Previene open-redirect: un `?next=` / `?redirect=` controlado por el usuario solo
 * debe poder apuntar a una ruta INTERNA. `startsWith('/')` NO basta porque acepta
 * `//evil.com` (URL protocol-relative → el navegador la resuelve como https://evil.com)
 * y `/\evil.com` (algunos navegadores tratan `\` como `/`).
 *
 * Regla: debe empezar con UN solo `/` seguido de un carácter que NO sea `/` ni `\`.
 * La raíz `/` (sola) se acepta. Cualquier otra cosa (esquema `https:`/`javascript:`,
 * vacío, no-string) se rechaza.
 */
export function isSafeRedirectPath(path: string | null | undefined): path is string {
  if (typeof path !== "string" || path[0] !== "/") return false;
  // Rechaza "//…" (protocol-relative) y "/\…" (backslash) que el navegador trata
  // como externos. Una "/" sola (raíz) es válida.
  if (path.length > 1 && (path[1] === "/" || path[1] === "\\")) return false;
  return true;
}
