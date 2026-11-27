import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import LandingClient from "./LandingClient";

// The landing is a client component, so its canonical lives in this server wrapper. Only "/" declares it:
// the root layout's metadata is inherited by every route without its own, which must not point to "/" (H-072).
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("home.title"), description: t("home.description"), alternates: { canonical: "/" } };
}

export default function HomePage() {
  return <LandingClient />;
}
