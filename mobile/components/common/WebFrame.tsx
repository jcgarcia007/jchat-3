/**
 * JChat 3.0 — WebFrame (iOS / Android): passthrough. The web build resolves WebFrame.web.tsx,
 * which centers the app in a phone-width column on wide screens.
 */

import React from 'react';

export default function WebFrame({ children }: { children: React.ReactNode }): React.ReactElement {
  return <>{children}</>;
}
