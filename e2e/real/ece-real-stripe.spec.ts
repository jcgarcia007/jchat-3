/**
 * JChat 3.0 — does Stripe's REAL Express Checkout Element answer (ready / loaderror) with the options the gift form uses?
 *
 * Why: on an iPhone, in test mode, the gift page's diagnostic line said "sin respuesta del monedero (5 s)": the element never fired `ready`.
 * This probe mounts the element OUTSIDE the app, with the real Stripe.js from js.stripe.com, in a DEFERRED Elements
 * (mode 'payment', amount 1598, usd, card only, manual capture) — no PaymentIntent, no secret key, nothing is charged — and records which
 * events arrive and what they say. Variants: the form's own options (read from GiftPaymentForm.web.tsx, so they cannot drift) or minimal `{}`;
 * a visible container or the form's hidden one (height 0, opacity 0); alone, or next to a card PaymentElement as in the form; with the form's
 * Appearance or without.
 *
 * OPT-IN: ECE_REAL=1 (it talks to Stripe's public endpoints with the PUBLISHABLE test key from mobile/.env EXPO_PUBLIC_STRIPE_PK, or from
 * the env var of the same name). The key is never printed or written. Results go to e2e/artifacts/ece-real-results-<ECE_TAG>.json.
 *
 * Run:  cd e2e && ECE_REAL=1 npx playwright test -c ece-real.config.ts
 */
import { expect, test } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

test.skip(!process.env.ECE_REAL, 'opt-in: ECE_REAL=1 (loads js.stripe.com with the publishable test key; no PaymentIntent, nothing charged)');

const root = join(__dirname, '..', '..');

function publishableKey(): string {
  if (process.env.EXPO_PUBLIC_STRIPE_PK) return process.env.EXPO_PUBLIC_STRIPE_PK;
  const envFile = join(root, 'mobile', '.env');
  if (existsSync(envFile)) {
    const m = /^EXPO_PUBLIC_STRIPE_PK=(.+)$/m.exec(readFileSync(envFile, 'utf8'));
    if (m) return m[1].trim();
  }
  return '';
}

/** The options object of the gift form, evaluated from its source (`const WALLET_OPTIONS … = { … };`) so the probe always uses the real ones. */
function formWalletOptions(): Record<string, unknown> {
  const src = readFileSync(join(root, 'mobile', 'components', 'gift', 'GiftPaymentForm.web.tsx'), 'utf8');
  const m = /const WALLET_OPTIONS[^=]*=\s*(\{[\s\S]*?\n\});/.exec(src);
  if (!m) throw new Error('WALLET_OPTIONS not found in GiftPaymentForm.web.tsx');
  return new Function(`return (${m[1]});`)() as Record<string, unknown>;
}

const APPEARANCE = { theme: 'stripe', variables: { colorPrimary: '#5C7CFA', colorBackground: '#18181b', colorText: '#f5f5f7', colorDanger: '#F87171', borderRadius: '12px' } };

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:16px;background:#18181b;color:#f5f5f7;font:14px sans-serif">
<div id="box" style="width:100%"><div id="ece"></div></div>
<div id="pe" style="margin-top:12px"></div>
<script src="https://js.stripe.com/v3/"></script>
<script>
(function () {
  var q = new URLSearchParams(location.search);
  window.__events = [];
  var t0 = Date.now();
  var log = function (name, detail) { window.__events.push({ at: Date.now() - t0, name: name, detail: detail === undefined ? null : detail }); };
  window.addEventListener('error', function (e) { log('window.error', String(e.message || e)); });
  if (!window.Stripe) { log('no-stripe-js'); window.__done = true; return; }
  var stripe = window.Stripe(window.__PK);
  var elOpts = { mode: 'payment', amount: 1598, currency: 'usd', paymentMethodTypes: ['card'], captureMethod: 'manual' };
  if (q.get('appearance') === '1') elOpts.appearance = window.__APPEARANCE;
  var elements = stripe.elements(elOpts);
  var eceOptions = q.get('opts') ? JSON.parse(q.get('opts')) : (q.get('options') === 'minimal' ? {} : window.__FORM_OPTIONS);
  var ece = elements.create('expressCheckout', eceOptions);
  ['ready', 'loaderror', 'loaderstart', 'availablepaymentmethodschange'].forEach(function (name) {
    ece.on(name, function (e) {
      var d = name === 'ready' ? { available: e.availablePaymentMethods === undefined ? 'undefined' : e.availablePaymentMethods }
        : name === 'loaderror' ? { type: e.error && e.error.type, message: e.error && e.error.message, code: e.error && e.error.code }
        : name === 'availablepaymentmethodschange' ? { paymentMethods: e.paymentMethods === undefined ? 'undefined' : e.paymentMethods }
        : null;
      log(name, d);
    });
  });
  if (q.get('hidden') === '1') document.getElementById('ece').style.cssText = 'height:0;overflow:hidden;opacity:0';
  ece.mount('#ece');
  if (q.get('pe') === '1') {
    var pe = elements.create('payment', { wallets: { applePay: 'never', googlePay: 'never', link: 'never' } });
    ['ready', 'loaderror'].forEach(function (name) { pe.on(name, function (e) { log('paymentElement.' + name, name === 'loaderror' ? { type: e.error && e.error.type, message: e.error && e.error.message } : null); }); });
    pe.mount('#pe');
  }
  log('mounted');
  window.__done = true;
})();
</script></body></html>`;

interface Ev { at: number; name: string; detail: unknown }
const results: Record<string, unknown>[] = [];

const FORM = formWalletOptions();
const opts = (o: unknown) => `opts=${encodeURIComponent(JSON.stringify(o))}`;
const withoutKey = (key: string) => { const c = { ...FORM }; delete c[key]; return c; };
const pm = (FORM.paymentMethods ?? {}) as Record<string, unknown>;
const VARIANTS: { name: string; query: string; mustBeReady?: boolean }[] = [
  // the question: does the element answer with the form's options?
  { name: 'form options · visible', query: 'options=form', mustBeReady: true },
  { name: 'form options · hidden (height 0, opacity 0)', query: 'options=form&hidden=1', mustBeReady: true },
  { name: 'minimal {} · visible', query: 'options=minimal', mustBeReady: true },
  { name: 'minimal {} · hidden', query: 'options=minimal&hidden=1', mustBeReady: true },
  { name: 'form options · hidden · + card PaymentElement · + Appearance (as the form)', query: 'options=form&hidden=1&pe=1&appearance=1', mustBeReady: true },
  // bisection: each top-level option alone, and the form without each one
  ...Object.keys(FORM).map((key) => ({ name: `ONLY ${key}`, query: opts({ [key]: FORM[key] }) })),
  ...Object.keys(FORM).map((key) => ({ name: `form WITHOUT ${key}`, query: opts(withoutKey(key)) })),
  // inside paymentMethods: each entry alone
  ...Object.keys(pm).map((key) => ({ name: `ONLY paymentMethods.${key}=${String(pm[key])}`, query: opts({ paymentMethods: { [key]: pm[key] } }) })),
  // inside layout: each entry alone, and the pairs
  ...Object.entries((FORM.layout ?? {}) as Record<string, unknown>).map(([key, value]) => ({ name: `ONLY layout.${key}=${String(value)}`, query: opts({ layout: { [key]: value } }) })),
  { name: 'layout {maxColumns:1,maxRows:1}', query: opts({ layout: { maxColumns: 1, maxRows: 1 } }) },
  { name: "layout {maxRows:1,overflow:'never'}", query: opts({ layout: { maxRows: 1, overflow: 'never' } }) },
  { name: "layout {maxColumns:1,overflow:'never'}", query: opts({ layout: { maxColumns: 1, overflow: 'never' } }) },
  { name: "layout {maxColumns:1,maxRows:2,overflow:'never'}", query: opts({ layout: { maxColumns: 1, maxRows: 2, overflow: 'never' } }) },
  { name: "layout {maxColumns:1,maxRows:1,overflow:'auto'}", query: opts({ layout: { maxColumns: 1, maxRows: 1, overflow: 'auto' } }) },
  { name: "layout {maxColumns:1,overflow:'auto'}", query: opts({ layout: { maxColumns: 1, overflow: 'auto' } }) },
].filter((v) => !process.env.ECE_ONLY || v.name.includes(process.env.ECE_ONLY));

test.describe('real Stripe.js · Express Checkout Element', () => {
  for (const variant of VARIANTS) {
    test(variant.name, async ({ page }, info) => {
      const pk = publishableKey();
      test.skip(!pk.startsWith('pk_test_'), 'no pk_test_ key in mobile/.env EXPO_PUBLIC_STRIPE_PK (nothing is run with a live key)');
      await page.addInitScript(([key, opts, appearance]) => {
        const w = window as unknown as Record<string, unknown>;
        w.__PK = key; w.__FORM_OPTIONS = opts; w.__APPEARANCE = appearance;
      }, [pk, formWalletOptions(), APPEARANCE] as const);
      await page.route('**/__ece-probe.html*', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: PAGE }));
      await page.goto(`/__ece-probe.html?${variant.query}`, { waitUntil: 'load' });
      await page.waitForFunction(() => (window as unknown as { __done?: boolean }).__done === true, null, { timeout: 15_000 });
      // wait for an answer (ready or loaderror) up to 15 s, then report whatever happened
      await page.waitForFunction(() => {
        const ev = (window as unknown as { __events: { name: string }[] }).__events;
        return ev.some((e) => e.name === 'ready' || e.name === 'loaderror');
      }, null, { timeout: 15_000 }).catch(() => undefined);
      const events = (await page.evaluate(() => (window as unknown as { __events: Ev[] }).__events)) as Ev[];
      const box = await page.evaluate(() => { const r = document.getElementById('ece')!.getBoundingClientRect(); return { width: Math.round(r.width), height: Math.round(r.height) }; });
      const answered = events.find((e) => e.name === 'ready' || e.name === 'loaderror');
      results.push({ project: info.project.name, variant: variant.name, answer: answered?.name ?? 'NONE (no ready, no loaderror in 15 s)', events, container: box });
      console.log(`[${info.project.name}] ${variant.name} → ${answered?.name ?? 'NO ANSWER'} ${JSON.stringify(answered?.detail ?? '')}  events=${events.map((e) => e.name).join(',')}`);
      expect(events.some((e) => e.name === 'mounted')).toBe(true);
      // the form's own options (and the minimal ones) must get an answer from the real Stripe.js — and it must be `ready`, not `loaderror`
      if (variant.mustBeReady) expect(answered?.name, `${variant.name}: ${JSON.stringify(answered?.detail ?? 'no ready, no loaderror in 15 s')}`).toBe('ready');
    });
  }

  test.afterAll(() => {
    const dir = join(root, 'e2e', 'artifacts');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `ece-real-results-${process.env.ECE_TAG ?? 'run'}.json`), JSON.stringify(results, null, 2));
  });
});
