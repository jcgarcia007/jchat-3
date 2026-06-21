"use client";

/**
 * JChat 3.0 — useActiveBusiness hook (web dashboard)
 * Client wrapper around resolveActiveBusiness() so dashboard pages share one
 * way of loading the signed-in owner's business.
 */

import { useEffect, useState } from "react";
import {
  resolveActiveBusiness,
  type ActiveBusiness,
  type BusinessResolution,
} from "./business";

export function useActiveBusiness() {
  const [business, setBusiness] = useState<ActiveBusiness | null>(null);
  const [resolution, setResolution] = useState<BusinessResolution | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void resolveActiveBusiness().then((res) => {
      if (!active) return;
      setResolution(res);
      if (res.ok) setBusiness(res.business);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  /** True when there is definitively no business to show (so render the CTA). */
  const needsRegister =
    !loading &&
    !business &&
    (resolution?.ok === false &&
      (resolution.reason === "no_business" || resolution.reason === "unauthenticated"));

  return { business, resolution, loading, needsRegister };
}
