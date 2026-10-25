/**
 * JChat 3.0 — useKeyboardCover (iOS / Android): always 0. The native keyboard handling of the modals (KeyboardAvoidingView) is
 * untouched. The web build resolves useKeyboardCover.web.ts.
 */

export function useKeyboardCover(): number {
  return 0;
}
