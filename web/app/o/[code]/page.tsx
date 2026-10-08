/**
 * /o/[code] — Public order tracking for guests who paid on the web (Lote C).
 *
 * The code in the URL is the capability: 32 unguessable chars minted by guest-pay and stored with the order
 * (orders.guest_tracking_code). All data comes from the anon-callable RPCs guest_order_view /
 * guest_order_notify_staff, which return nothing personal and only serve orders of the last 12 h.
 * No session, no dashboard chrome.
 */

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { OrderTracker } from "./OrderTracker";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("orderTracking.title"), robots: { index: false, follow: false } };
}

export default async function OrderTrackingPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <OrderTracker code={code} />;
}
