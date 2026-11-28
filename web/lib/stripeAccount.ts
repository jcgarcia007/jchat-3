/**
 * Does this `businesses.stripe_account_id` point at a real Stripe Connect account?
 *
 * The business sign-up used to store a made-up `acct_STUB_…` id so the wizard could be finished. Those ids do not exist at Stripe, so
 * anything reading the column must treat them as "not connected" (and an empty value, too) instead of asking Stripe about them.
 */
export function isStripeConnectedId(id: string | null | undefined): boolean {
  if (typeof id !== "string") return false;
  const value = id.trim();
  if (!value.startsWith("acct_")) return false;
  if (value.startsWith("acct_STUB_")) return false;
  return value.length > "acct_".length;
}
