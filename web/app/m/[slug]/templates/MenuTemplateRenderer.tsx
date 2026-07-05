"use client";

import Classic from "./Classic";
import LeftDrawer from "./LeftDrawer";
import IconRail from "./IconRail";
import StickyTabs from "./StickyTabs";
import type { MenuTemplateProps } from "./types";

/**
 * Routes menu_template_id to its template component. Non-ported ids fall back
 * to "classic" (JChat's current default layout).
 */
export default function MenuTemplateRenderer({
  templateId,
  ...props
}: MenuTemplateProps & { templateId: string }) {
  switch (templateId) {
    case "classic":
      return <Classic {...props} />;
    case "left-drawer":
      return <LeftDrawer {...props} />;
    case "icon-rail":
      return <IconRail {...props} />;
    case "sticky-tabs":
      return <StickyTabs {...props} />;
    case "bottom-nav":
      // TODO: portar bottom-nav real del board (#01)
      return <Classic {...props} />;
    default:
      return <Classic {...props} />;
  }
}
