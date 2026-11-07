# subscriptions — Supabase Edge Function

Handles subscription lifecycle for JChat 3.0 (Task 3.15): Stripe Checkout session creation and webhook processing for plan upgrades, downgrades, payment failures (3-day grace period), and recoveries.

## Deploy

```bash
supabase functions deploy subscriptions
```

## Required environment variables

Set these in the Supabase dashboard under **Edge Functions → Secrets** (or via `supabase secrets set`):

| Variable | Description |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_live_…` or `sk_test_…`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`whsec_…`) from Stripe dashboard |
| `SB_SECRET_KEY` | Supabase service role key (bypasses RLS for webhook writes) |
| `STRIPE_PRICE_VERIFIED` | Stripe Price ID for the Verified plan ($1.99/mo) |
| `STRIPE_PRICE_BUSINESS` | Stripe Price ID for the Business plan ($49/mo) |
| `STRIPE_PRICE_PRO` | Stripe Price ID for the Pro plan ($99/mo) |
| `STRIPE_PRICE_BUSINESS_6M` | Business, billed every 6 months ($264) |
| `STRIPE_PRICE_BUSINESS_1Y` | Business, billed yearly ($468) |
| `STRIPE_PRICE_PRO_6M` | Pro, billed every 6 months ($534) |
| `STRIPE_PRICE_PRO_1Y` | Pro, billed yearly ($948) |

The four 6-month / 1-year prices are created by a script (never by hand), on the same Stripe products as the monthly prices:

```bash
# Test mode. Dry run by default (writes nothing); add --apply to create. Re-running prints "ya existe" for each price.
STRIPE_SECRET_KEY=sk_test_… STRIPE_PRICE_BUSINESS=price_… STRIPE_PRICE_PRO=price_… \
  deno run --allow-env --allow-net supabase/scripts/stripe_create_interval_prices.ts [--apply]
```

It prints the four `supabase secrets set STRIPE_PRICE_*=…` lines to paste. The script refuses an `sk_live_` key unless run with `--live` and `CONFIRM_LIVE=yes`.

`SUPABASE_URL` is injected automatically by the Supabase runtime.

## Stripe webhook configuration

In the Stripe dashboard, create a webhook endpoint pointing to your function URL (`https://<project-ref>.supabase.co/functions/v1/subscriptions`) and subscribe to these events:

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `customer.subscription.trial_will_end`
- `invoice.payment_failed`
- `invoice.payment_succeeded`

Copy the signing secret into `STRIPE_WEBHOOK_SECRET` and uncomment the signature verification block in `index.ts` before going to production.
