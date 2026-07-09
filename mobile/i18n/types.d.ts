/**
 * JChat 3.0 — react-i18next type augmentation (Tanda 1A).
 * Makes t() keys typed against the 'common' namespace (en is the source of truth
 * for key shape; es must mirror the same keys).
 */

import 'react-i18next';
import type common from './locales/en/common.json';
import type auth from './locales/en/auth.json';

declare module 'react-i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: typeof common;
      auth: typeof auth;
    };
  }
}
