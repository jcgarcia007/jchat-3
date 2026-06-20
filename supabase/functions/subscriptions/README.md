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
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (bypasses RLS for webhook writes) |
| `STRIPE_PRICE_VERIFIED` | Stripe Price ID for the Verified plan ($1.99/mo) |
| `STRIPE_PRICE_BUSINESS` | Stripe Price ID for the Business plan ($49/mo) |
| `STRIPE_PRICE_PRO` | Stripe Price ID for the Pro plan ($99/mo) |

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
