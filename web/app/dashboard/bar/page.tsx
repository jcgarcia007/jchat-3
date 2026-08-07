"use client";

/**
 * JChat 3.0 — Bar Display
 * Thin wrapper around StationDisplay — renders the bar station only.
 * All logic lives in web/app/dashboard/_components/StationDisplay.tsx.
 */

import { StationDisplay } from "@/app/dashboard/_components/StationDisplay";

export default function BarPage() {
  return <StationDisplay station="bar" />;
}
