# payments — Supabase Edge Function

Handles all server-side Stripe operations for order payments.

## Deploy

```bash
supabase functions deploy payments
supabase functions deploy stripe-connect
supabase functions deploy stripe-webhook
```

## Required secrets

Set these in the Supabase dashboard → **Edge Functions → Secrets** (or via CLI):

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=eyJ...
supabase secrets set EXPO_PUBLIC_STRIPE_PK=pk_test_...

# Optional — defaults shown:
supabase secrets set PLATFORM_FEE_PERCENT=2.9
supabase secrets set PLATFORM_FEE_FIXED_CENTS=30

# For stripe-connect onboarding redirects:
supabase secrets set CONNECT_RETURN_URL=https://jchat.app/dashboard/billing?connect=success
supabase secrets set CONNECT_REFRESH_URL=https://jchat.app/dashboard/billing?connect=refresh
```

| Secret | Description |
|--------|-------------|
| `STRIPE_SECRET_KEY` | `sk_live_…` or `sk_test_…` — from Stripe dashboard → API keys |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` — from Stripe dashboard → Webhooks endpoint |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (bypasses RLS for order creation) |
| `EXPO_PUBLIC_STRIPE_PK` | `pk_live_…` or `pk_test_…` — returned to mobile for `StripeProvider` |
| `PLATFORM_FEE_PERCENT` | Platform revenue cut (default 2.9%) |
| `PLATFORM_FEE_FIXED_CENTS` | Fixed platform fee per transaction in cents (default 30¢) |
| `CONNECT_RETURN_URL` | Redirect after Stripe Connect onboarding completes |
| `CONNECT_REFRESH_URL` | Redirect if Stripe Connect onboarding link expires |

## Stripe webhook endpoint

Register in the **Stripe dashboard → Webhooks**:

```
URL:    https://<project-ref>.supabase.co/functions/v1/stripe-webhook
Events: payment_intent.succeeded, payment_intent.payment_failed
```

For subscription events (billing cycles, trial end, etc.) a separate endpoint
already exists at `/subscriptions`.

## Architecture

```
Mobile client
  └─▶ supabase.functions.invoke('payments', { action: 'create_payment_intent', order: {...} })
         │
         ├─ Server creates PaymentIntent with Stripe Connect (transfer_data → business account)
         ├─ Cart is stored in PaymentIntent.metadata
         └─ Returns { clientSecret, ephemeralKey, customer, publishableKey }

Mobile presents PaymentSheet (stripe-react-native)
  └─▶ On success: Stripe fires payment_intent.succeeded webhook

stripe-webhook function
  └─ Creates orders + order_items rows (KDS picks up via Realtime)
```

## Rule 4 compliance

**PaymentIntents, SetupIntents, and Stripe Secret Keys never touch the client.**
The mobile app receives only:
- `clientSecret` — to present the payment sheet (safe; scope-limited to this PI)
- `ephemeralKey` — scoped to the customer's saved methods (expires after the session)
- `customer` — the Stripe customer ID (public identifier)
- `publishableKey` — the publishable key (safe; for StripeProvider initialization)

## TODO

- `TODO(security)` in `stripe-webhook/index.ts`: uncomment `constructEventAsync` to verify
  webhook signatures before going to production.
- `TODO(push)` in `stripe-webhook/index.ts`: add push notification to business owner
  on new order and to user on payment failure.
- `TODO(payouts)` in `stripe-connect/index.ts`: expose payout schedule update via a
  dedicated action called from dashboard payout settings.
- `TODO` in `mobile/services/stripe.ts`: PayPal is a Stripe payment method — enable
  via `paymentMethodTypes: ['card', 'paypal']` in the PaymentIntent once the
  Stripe PayPal integration is configured.
