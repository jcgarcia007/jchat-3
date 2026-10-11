/**
 * JChat 3.0 — dialogs: platform-neutral entry point.
 * Metro picks dialog.native.ts (Alert) on iOS/Android and dialog.web.ts (DialogHost modal) on
 * web; this file exists so TypeScript and tooling resolve `utils/dialog` to a single API.
 */

export * from './dialog.native';
