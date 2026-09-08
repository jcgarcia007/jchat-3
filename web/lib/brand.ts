/**
 * Brand resolution by request host.
 *
 * The same Next.js app is served from two hosts:
 *   jchat.cloud            → JChat (default, no attribute)
 *   dashboard.tabpos.cloud → Tab POS skin on the auth screens
 *
 * The root layout stamps `data-brand` on <html>; styles/brands/tabpos.css hangs
 * off that attribute. Only the auth screens are skinned today — the dashboard
 * keeps the JChat look under both hosts (rebrand is a future phase).
 */
export type Brand = "tabpos";

const TABPOS_HOSTS = new Set(["tabpos.cloud", "www.tabpos.cloud", "dashboard.tabpos.cloud"]);

export function brandFromHost(host: string | null | undefined): Brand | undefined {
  if (!host) return undefined;
  const name = host.split(":")[0].trim().toLowerCase();
  return TABPOS_HOSTS.has(name) ? "tabpos" : undefined;
}
