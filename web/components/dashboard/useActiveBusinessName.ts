"use client";

import { useEffect, useState } from "react";
import { resolveActiveBusiness } from "@/lib/business";

// Dashboard 4A — shared active-business signal.
//
// The 4A switcher changes the active business without a hard reload. Server
// components re-fetch via router.refresh(), but sibling CLIENT chrome (the rail
// avatar, the subnav selector) resolve the active business once on mount and
// wouldn't otherwise update. This tiny window CustomEvent bus keeps them in
// sync: after a successful setActiveBusiness(), call notifyActiveBusinessChanged()
// and every useActiveBusinessName() consumer re-resolves.

export const ACTIVE_BUSINESS_CHANGED = "jchat:active-business-changed";

/** Broadcast that the active business changed (call after setActiveBusiness OK). */
export function notifyActiveBusinessChanged(): void {
  if (typeof window !== "undefined") {
    // Recarga dura tras cambiar de negocio. Las ~16 páginas del dashboard resuelven el negocio
    // activo en su propio useEffect([]) y NO reaccionan a un evento/router.refresh(); una recarga
    // garantiza que TODA la app muestre el negocio nuevo (mismo enfoque probado que el shell viejo
    // TopBar). El dispatch del evento se conserva para los consumidores reactivos del chrome que sí
    // lo escuchan (useActiveBusinessName), aunque en la práctica la recarga los cubre igual.
    window.dispatchEvent(new Event(ACTIVE_BUSINESS_CHANGED));
    window.location.reload();
  }
}

export interface ActiveBusinessName {
  id: string | null;
  name: string;
}

/** Active business { id, name }, re-resolved on mount and on ACTIVE_BUSINESS_CHANGED. */
export function useActiveBusinessName(): ActiveBusinessName {
  const [state, setState] = useState<ActiveBusinessName>({ id: null, name: "" });

  useEffect(() => {
    let active = true;

    function refresh() {
      void resolveActiveBusiness().then((res) => {
        if (!active) return;
        if (res.ok) setState({ id: res.business.id, name: res.business.name });
        else setState({ id: null, name: "" });
      });
    }

    refresh();
    window.addEventListener(ACTIVE_BUSINESS_CHANGED, refresh);
    return () => {
      active = false;
      window.removeEventListener(ACTIVE_BUSINESS_CHANGED, refresh);
    };
  }, []);

  return state;
}
