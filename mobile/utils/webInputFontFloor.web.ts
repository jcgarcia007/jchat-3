/**
 * JChat 3.0 — web input font floor (web): iOS Safari zooms the whole page when a text field with a computed
 * font-size under 16 px gets focus, and leaves it zoomed (the layout then looks wider than the screen). Every
 * <input> / <textarea> in the app is a react-native-web TextInput (34 files, most at 13–15 px), so instead of
 * patching each style the floor is enforced here: any field that renders under 16 px gets font-size: 16px
 * !important; larger ones are left alone. A MutationObserver covers fields mounted later (every screen).
 * e2e/web/ios-viewport.spec.ts checks the contract in WebKit with an iPhone profile.
 */

const FLOOR_PX = 16;
const FIELDS = 'input, textarea';

function lift(field: HTMLElement): void {
  if (field instanceof HTMLInputElement && ['checkbox', 'radio', 'range', 'file', 'button', 'submit', 'hidden', 'color'].includes(field.type)) return;
  const size = parseFloat(getComputedStyle(field).fontSize);
  if (Number.isFinite(size) && size < FLOOR_PX) field.style.setProperty('font-size', `${FLOOR_PX}px`, 'important');
}

export function installWebInputFontFloor(): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => undefined;
  const scan = (root: ParentNode) => root.querySelectorAll<HTMLElement>(FIELDS).forEach(lift);
  scan(document);
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        if (node.matches(FIELDS)) lift(node);
        scan(node);
      });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}
