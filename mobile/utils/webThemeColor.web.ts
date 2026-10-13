/**
 * JChat 3.0 — browser UI colour (web): keeps <meta name="theme-color"> (the iOS Safari status bar / Android address
 * bar colour) equal to the app's own background, and — while the chat is open — to the chat top bar, so the bar
 * under the status bar has no brand-blue seam. public/index.html seeds the first paint from the OS scheme.
 */

let base: string | null = null;
let override: string | null = null;

function apply(): void {
  if (typeof document === 'undefined') return;
  const color = override ?? base;
  if (!color) return;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  if (meta.content !== color) meta.content = color;
}

/** The app's theme background (follows light / dark). */
export function setWebThemeColorBase(color: string): void {
  base = color;
  apply();
}

/** A screen's own bar colour (the chat top bar); null goes back to the app background. */
export function setWebThemeColorOverride(color: string | null): void {
  override = color;
  apply();
}
