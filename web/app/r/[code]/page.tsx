/**
 * JChat 3.0 — Recibo Digital Etapa 1
 *
 * Route: /r/[code]
 * Auth: NONE — public via get_public_receipt RPC (SECURITY DEFINER, grant anon).
 *       The receipt_code itself is the access gate — no RLS needed.
 *
 * Server Component (async). Calls get_public_receipt with anon Supabase client.
 * Next.js 16: params is a Promise — must be awaited.
 */

export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import {
  createSupabaseServerClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import ReceiptView from "./ReceiptView";

// ---------------------------------------------------------------------------
// Types (mirrors get_public_receipt jsonb return shape)
// ---------------------------------------------------------------------------

export interface ReceiptBusiness {
  name: string;
  logo_url: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  slug: string | null;
  receipt_brand_color: string | null;
  receipt_template_id: string | null; // "modern" | "ticket" | "minimal" | "elegant"
}

export interface ReceiptPayment {
  amount_cents: number;
  tip_cents: number;
  kind: string; // "full" | "seat"
  seat: number | null;
  status: string;
  created_at: string;
  card_brand: string | null;
  card_last4: string | null;
  subtotal_cents: number;
  tax_cents: number;
}

export interface ReceiptItem {
  name: string;
  qty: number;
  price_cents: number;
  options: { modifiers?: { group_label: string; choice_labels: string[] }[] } | null;
  special_instructions: string | null;
}

export interface PublicReceipt {
  business: ReceiptBusiness;
  payment: ReceiptPayment;
  table_label: string | null;
  items: ReceiptItem[];
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

interface PageProps {
  params: Promise<{ code: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params;
  return {
    title: `Receipt ${code.slice(0, 8).toUpperCase()}`,
    robots: { index: false, follow: false },
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ReceiptPage({ params }: PageProps) {
  const { code } = await params;

  if (!isSupabaseConfigured) {
    return <ReceiptView receipt={null} code={code} />;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_public_receipt", {
    p_code: code,
  });

  if (error) {
    console.error("[/r/[code]] get_public_receipt error:", error.message);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const receipt = data ? (data as unknown as PublicReceipt) : null;

  return <ReceiptView receipt={receipt} code={code} />;
}
