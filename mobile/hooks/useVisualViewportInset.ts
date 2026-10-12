/**
 * JChat 3.0 — useVisualViewportInset (iOS / Android): always 0. The native keyboard handling of the chat
 * (KeyboardAvoidingView / the Android keyboard height) is untouched. The web build resolves
 * useVisualViewportInset.web.ts.
 */

export function useVisualViewportInset(): number {
  return 0;
}
