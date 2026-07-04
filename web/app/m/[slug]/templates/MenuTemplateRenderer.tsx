"use client";

import BottomNav from "./BottomNav";
import type { MenuTemplateProps } from "./types";

/**
 * Routes menu_template_id to its template component. Non-ported ids fall back
 * to bottom-nav (the current default layout).
 */
export default function MenuTemplateRenderer({
  templateId,
  ...props
}: MenuTemplateProps & { templateId: string }) {
  switch (templateId) {
    case "bottom-nav":
      return <BottomNav {...props} />;
    default:
      return <BottomNav {...props} />;
  }
}
