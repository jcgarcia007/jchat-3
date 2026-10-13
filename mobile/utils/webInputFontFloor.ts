/**
 * JChat 3.0 — web input font floor (iOS / Android): nothing to do, native text fields do not zoom. The web build
 * resolves webInputFontFloor.web.ts.
 */

export function installWebInputFontFloor(): () => void {
  return () => undefined;
}
