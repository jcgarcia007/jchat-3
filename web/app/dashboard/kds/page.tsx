"use client";

/**
 * JChat 3.0 — Kitchen Display System (KDS)
 * Thin wrapper around StationDisplay — renders the kitchen station only.
 * All logic lives in web/app/dashboard/_components/StationDisplay.tsx.
 */

import { StationDisplay } from "@/app/dashboard/_components/StationDisplay";

export default function KdsPage() {
  return <StationDisplay station="kitchen" />;
}
