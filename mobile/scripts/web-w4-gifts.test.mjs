// W4 block 1: gifts from the browser — the gift_hold service for the web, the WEB_GIFTS_ENABLED switch (off) and the
// dependencies. Run from mobile/:  node --test scripts/web-w4-gifts.test.mjs

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'w4-gifts-'));
const compile = (rel, out) =>
  writeFileSync(join(dir, out), ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
compile('utils/giftHold.ts', 'giftHold.mjs');
compile('constants/features.ts', 'features.mjs');
const { parseGiftHoldData, giftHoldFailure } = await import(pathToFileURL(join(dir, 'giftHold.mjs')).href);
const features = await import(pathToFileURL(join(dir, 'features.mjs')).href);

const OK = { clientSecret: 'pi_3Abc_secret_xyz', publishableKey: 'pk_test_123', serverTotalCents: 1234, ephemeralKey: 'ek', customer: 'cus_1' };

test('the web gifts switch is ON (Stripe test mode, since 2026-10-25)', () => {
  assert.equal(features.WEB_GIFTS_ENABLED, true);
  assert.match(read('constants/features.ts'), /export const WEB_GIFTS_ENABLED = true;/);
});

test('with the switch off the web never offers the gift; devices are never affected', () => {
  const hook = read('hooks/useGiftAvailable.ts');
  assert.match(hook, /const GIFTS_OFF_ON_THIS_PLATFORM = Platform\.OS === 'web' && !WEB_GIFTS_ENABLED;/);
  assert.match(hook, /if \(GIFTS_OFF_ON_THIS_PLATFORM \|\| !businessId \|\| !otherUserId\) \{\s*setAvailable\(false\);/);
});

test('parseGiftHoldData keeps only what Stripe.js needs', () => {
  assert.deepEqual(parseGiftHoldData(OK), { clientSecret: 'pi_3Abc_secret_xyz', publishableKey: 'pk_test_123', totalCents: 1234 });
  assert.equal('ephemeralKey' in parseGiftHoldData(OK), false, 'the ephemeral key (native only) is dropped');
});

test('parseGiftHoldData rejects incomplete or malformed answers', () => {
  assert.equal(parseGiftHoldData(null), null);
  assert.equal(parseGiftHoldData('x'), null);
  assert.equal(parseGiftHoldData({ ...OK, clientSecret: undefined }), null);
  assert.equal(parseGiftHoldData({ ...OK, clientSecret: 'not-a-secret' }), null);
  assert.equal(parseGiftHoldData({ ...OK, publishableKey: 'sk_live_nope' }), null, 'a secret key is never accepted as the publishable key');
  assert.equal(parseGiftHoldData({ ...OK, publishableKey: '' }), null);
  assert.equal(parseGiftHoldData({ ...OK, serverTotalCents: 'x' }).totalCents, 0);
});

test('giftHoldFailure carries the server code (so the app can translate that case) and falls back to the generic text', () => {
  assert.deepEqual(giftHoldFailure({ error: 'gift_unavailable', code: 'gift_unavailable' }, 'generic'), { code: 'gift_unavailable', message: 'gift_unavailable' });
  assert.deepEqual(giftHoldFailure({ error: 'Total is below Stripe minimum ($0.50)' }, 'generic'), { code: 'ServerError', message: 'Total is below Stripe minimum ($0.50)' });
  assert.deepEqual(giftHoldFailure(null, 'generic'), { code: 'ServerError', message: 'generic' });
  assert.deepEqual(giftHoldFailure({ error: 5, code: 7 }, 'generic'), { code: 'ServerError', message: 'generic' });
});

test('the web service calls the SAME server action as the app and never sends an amount', () => {
  const web = read('services/giftHold.web.ts');
  assert.match(web, /supabase\.functions\.invoke\('payments', \{\s*body: \{ action: 'gift_hold', gift_offer_id: giftOfferId \},/);
  const request = web.slice(web.indexOf("invoke('payments'"), web.indexOf('if (error)'));
  assert.doesNotMatch(request, /amount|total_cents|price/i, 'no amount in the request');
  assert.doesNotMatch(web, /stripe-react-native|@stripe\/stripe-js/);
  assert.doesNotMatch(web, /console\.(log|error)\([^)]*(clientSecret|publishableKey)/);
});

test('devices get an inert stub and stripe.ts (the native hold) is untouched by this block', () => {
  assert.match(read('services/giftHold.ts'), /code: 'NotSupported'/);
  const stripe = read('services/stripe.ts');
  assert.match(stripe, /export async function holdGiftPayment\(giftOfferId: string\): Promise<StripeResult>/);
  assert.doesNotMatch(stripe, /giftHold|fetchGiftHold/);
});

// ── Block 2: the card form ──────────────────────────────────────────────────────────────────────────────────────────────
compile('utils/giftPaymentResult.ts', 'giftPaymentResult.mjs');
const { giftPaymentOutcome, stripeLocale } = await import(pathToFileURL(join(dir, 'giftPaymentResult.mjs')).href);

test('requires_capture is the success of the card step: the card is HELD, nothing charged yet', () => {
  assert.deepEqual(giftPaymentOutcome({ paymentIntent: { status: 'requires_capture' } }), { kind: 'held' });
  assert.deepEqual(giftPaymentOutcome({ paymentIntent: { status: 'succeeded' } }), { kind: 'held' });
});

test('a refused or invalid card lets the person try again with Stripe\'s own message', () => {
  assert.deepEqual(giftPaymentOutcome({ error: { type: 'card_error', code: 'card_declined', message: 'Tu tarjeta fue rechazada.' } }), { kind: 'retry', message: 'Tu tarjeta fue rechazada.', declined: true });
  assert.deepEqual(giftPaymentOutcome({ error: { type: 'validation_error', message: 'Número incompleto.' } }), { kind: 'retry', message: 'Número incompleto.', declined: false });
  assert.deepEqual(giftPaymentOutcome({ error: { type: 'card_error' } }), { kind: 'retry', message: null, declined: true });
  assert.deepEqual(giftPaymentOutcome({ paymentIntent: { status: 'requires_payment_method' } }), { kind: 'retry', message: null, declined: true });
});

test('a PaymentIntent the server already closed is "closed", and 3 attempts is the server limit', () => {
  assert.deepEqual(giftPaymentOutcome({ error: { type: 'invalid_request_error', code: 'payment_intent_unexpected_state' } }), { kind: 'closed' });
});

test('processing never counts as paid (and blocks a second payment)', () => {
  assert.deepEqual(giftPaymentOutcome({ paymentIntent: { status: 'processing' } }), { kind: 'processing' });
});

test('anything unexpected is a generic failure carrying a code for the logs only', () => {
  assert.deepEqual(giftPaymentOutcome({ error: { type: 'api_error', code: 'rate_limit' } }), { kind: 'failed', code: 'rate_limit' });
  assert.deepEqual(giftPaymentOutcome({ error: { type: 'api_connection_error' } }), { kind: 'failed', code: 'api_connection_error' });
  assert.deepEqual(giftPaymentOutcome({ paymentIntent: { status: 'canceled' } }), { kind: 'failed', code: 'canceled' });
  assert.deepEqual(giftPaymentOutcome({ paymentIntent: { status: 'requires_action' } }), { kind: 'failed', code: 'requires_action' });
  assert.deepEqual(giftPaymentOutcome({}), { kind: 'failed', code: 'no_payment_intent' });
});

test('Stripe.js locale follows the app language', () => {
  assert.equal(stripeLocale('es'), 'es');
  assert.equal(stripeLocale('es-MX'), 'es');
  assert.equal(stripeLocale('en'), 'en');
  assert.equal(stripeLocale(undefined), 'en');
});

test('the web form confirms the server\'s PaymentIntent in place and never sends an amount', () => {
  const form = read('components/gift/GiftPaymentForm.web.tsx');
  assert.match(form, /from '@stripe\/stripe-js\/pure'/, 'Stripe.js is downloaded only when the form opens');
  assert.match(form, /stripe\.confirmPayment\(\{\s*elements,\s*redirect: 'if_required',/);
  assert.match(form, /giftPaymentOutcome\(result\)/);
  assert.doesNotMatch(form, /^import (?!type)[^\n]*from '@stripe\/stripe-js';/m, 'no value import that loads Stripe.js at startup (types are erased)');
  assert.doesNotMatch(form, /stripe-react-native/);
  assert.doesNotMatch(form, /#[0-9a-fA-F]{3,8}\b/, 'colors come from the theme tokens, no hex');
  assert.doesNotMatch(form, /console\.(log|error)\([^)]*(clientSecret|publishableKey)/);
});

test('devices render nothing for the form, and nothing native imports it', () => {
  assert.match(read('components/gift/GiftPaymentForm.tsx'), /export function GiftPaymentForm\(_props: GiftPaymentFormProps\): null \{\s*return null;/);
  assert.doesNotMatch(read('components/gift/GiftPaymentForm.tsx'), /@stripe\//);
});

test('es / en have the same gift keys, with the card-form strings', () => {
  const j = (l) => JSON.parse(read(`i18n/locales/${l}/chat.json`)).gift;
  assert.deepEqual(Object.keys(j('es')), Object.keys(j('en')));
  for (const k of ['payTitle', 'payButton', 'payBack', 'payProcessing']) assert.ok(j('es')[k] && j('en')[k], k);
  assert.match(j('es').payButton, /\{\{amount\}\}/);
  assert.match(j('en').payButton, /\{\{amount\}\}/);
});

// ── Block 3: GiftSheet on the web ───────────────────────────────────────────────────────────────────────────────────────
test('GiftSheet: the web asks for the hold and shows the card step; devices keep the native PaymentSheet call untouched', () => {
  const sheet = read('components/gift/GiftSheet.tsx');
  const web = sheet.indexOf("if (Platform.OS === 'web') {");
  const native = sheet.indexOf('const result = await holdGiftPayment(id);');
  assert.ok(web > 0 && native > web, 'the web branch comes first and returns before the native call');
  assert.match(sheet, /const hold = await fetchGiftHold\(id\);\s*if \(hold\.ok\) \{\s*setPayParams\(hold\);\s*return;\s*\}/);
  // The native lines are exactly as before.
  assert.match(sheet, /const result = await holdGiftPayment\(id\);\s*if \(result\.ok\) \{\s*heldRef\.current = true;\s*onSent\(\);\s*return;\s*\}/);
  assert.match(sheet, /if \(result\.code === 'Canceled'\) \{/);
});

test('GiftSheet: web errors reuse the translated gift errors (gift_unavailable, gift_not_open…)', () => {
  const sheet = read('components/gift/GiftSheet.tsx');
  assert.match(sheet, /giftErrorCode\(hold\.code\) \?\? giftErrorCode\(hold\.message\)/);
  assert.match(sheet, /knownWeb \? t\(`gift\.errors\.\$\{knownWeb\}`\) : hold\.message/);
});

test('GiftSheet: card on hold → offer is the recipient\'s (never cancelled); "Volver" cancels the unpaid offer; no close while confirming', () => {
  const sheet = read('components/gift/GiftSheet.tsx');
  assert.match(sheet, /const handleHeld = useCallback\(\(\) => \{\s*heldRef\.current = true;\s*setPayParams\(null\);\s*setPayBusy\(false\);\s*onSent\(\);/);
  assert.match(sheet, /const handlePayBack = useCallback\(\(\) => \{\s*cancelUnpaidOffer\(offerId\);\s*setPayParams\(null\);/);
  assert.match(sheet, /const handleClose = useCallback\(\(\) => \{\s*if \(payBusy\) return;/);
  assert.match(sheet, /setPayParams\(null\);\s*setPayBusy\(false\);\s*heldRef\.current = false;/, 'every opening starts clean');
  assert.match(sheet, /\{payParams \? \(/);
  assert.match(sheet, /onBusyChange=\{setPayBusy\}/);
});

test('the web card step scrolls inside a pixel cap so Stripe\'s tall form never pushes Pagar / Volver off the screen', () => {
  const sheet = read('components/gift/GiftSheet.tsx');
  assert.match(sheet, /const \{ height: windowHeight \} = useWindowDimensions\(\);/);
  assert.match(sheet, /const CARD_CHROME = 334;\s*const CARD_CHROME_KEYBOARD = 184;/);
  assert.match(sheet, /const cardFieldMaxHeight = Math\.max\(160, Math\.min\(420, cardSheetMaxHeight - cardChrome\)\);/); // never under 160 px: number + expiry + CVC
  assert.match(sheet, /const cardScrollMaxHeight = Math\.max\(240, cardSheetMaxHeight - \(keyboardOpen \? 60 : 118\)\);/);
  assert.match(sheet, /style=\{\[styles\.payScroll, \{ maxHeight: cardScrollMaxHeight \}\]\}/);
  assert.match(sheet, /fieldMaxHeight=\{cardFieldMaxHeight\}/);
  assert.match(sheet, /payScroll: \{ flexGrow: 0, flexShrink: 1 \},/);
});

test('web card step + keyboard: the sheet is lifted by useKeyboardCover and capped to the visual viewport (web only)', () => {
  const sheet = read('components/gift/GiftSheet.tsx');
  assert.match(sheet, /import \{ useKeyboardCover \} from '\.\.\/\.\.\/hooks\/useKeyboardCover';/);
  assert.match(sheet, /const onCardStep = Platform\.OS === 'web' && payParams !== null;/);
  assert.match(sheet, /const keyboardOpen = onCardStep && keyboardInset > 100;/);
  assert.match(sheet, /const cardSheetMaxHeight = Math\.max\(240, Math\.floor\(visibleHeight - 24\)\);/); // top margin >= 24 px
  assert.match(sheet, /style=\{onCardStep \? \{ paddingBottom: keyboardInset \} : undefined\}/);
  assert.match(sheet, /onCardStep && \{ maxHeight: cardSheetMaxHeight \}/);
  // The long hint folds while the keyboard is open; the form gets a short title and a compact flag.
  assert.match(sheet, /\{keyboardOpen \? null : <Text style=\{\[styles\.hint/);
  assert.match(sheet, /title=\{cardTitle\}\s*compact=\{keyboardOpen\}/);
  // With the keyboard open the header carries the short pay title (the gift title and the handle fold away).
  assert.match(sheet, /\{keyboardOpen && cardTitle \? cardTitle : t\('gift\.title', \{ name: recipient\.name \}\)\}/);
  assert.match(sheet, /\{keyboardOpen \? null : <View style=\{\[styles\.handle/);
  assert.match(sheet, /t\('gift\.payTitleFor', \{ items, amount: formatCents\(payParams\.totalCents\) \}\)/);
  // Devices: the hook is a constant 0 and the new props are optional types the native stub never renders.
  assert.match(read('hooks/useKeyboardCover.ts'), /return 0;/);
  assert.match(read('hooks/useKeyboardCover.web.ts'), /window\.innerHeight - \(viewport\.height \+ viewport\.offsetTop\)/);
  for (const lng of ['es', 'en']) assert.match(read(`i18n/locales/${lng}/chat.json`), /"payTitleFor": "[^"]*\{\{items\}\}[^"]*\{\{amount\}\}"/);
});

test('web card form: Stripe\'s own focus event scrolls the form into view; the fine print folds when compact', () => {
  const form = read('components/gift/GiftPaymentForm.web.tsx');
  assert.match(form, /<PaymentElement onFocus=\{revealForm\} \/>/);
  assert.match(form, /scrollIntoView\?\.\(\{ block: 'center', behavior: 'smooth' \}\)/);
  assert.match(form, /\{compact \|\| !note \? null : <Text style=\{\[styles\.fine, \{ color: c\.textSecondary \}\]\}>\{note\}<\/Text>\}/);
  assert.match(form, /\{compact \? null : <Text style=\{\[styles\.title/); // the form's own title folds when the header carries it
  assert.match(form, /fieldMaxHeight \? \{ maxHeight: fieldMaxHeight, flexGrow: 0 \} : undefined/);
  assert.doesNotMatch(form, /autoComplete|autocomplete/i, 'the PaymentElement keeps Stripe\'s own autofill (iOS card autofill)');
});

test('the form reports "busy" while the card is confirmed and releases it when it goes away', () => {
  const form = read('components/gift/GiftPaymentForm.web.tsx');
  assert.match(form, /const busy = paying \|\| processing;\s*useEffect\(\(\) => \{\s*onBusyChange\?\.\(busy\);/);
  assert.match(form, /useEffect\(\(\) => \(\) => onBusyChange\?\.\(false\), \[onBusyChange\]\);/);
  assert.match(read('components/gift/GiftPaymentForm.tsx'), /onBusyChange\?: \(busy: boolean\) => void;/);
});

test('mobile has the two Stripe.js packages, at the versions the Next site already uses', () => {
  const mobile = JSON.parse(read('package.json')).dependencies;
  const web = JSON.parse(readFileSync(new URL('../../web/package.json', import.meta.url), 'utf8')).dependencies;
  assert.equal(mobile['@stripe/stripe-js'], web['@stripe/stripe-js']);
  assert.equal(mobile['@stripe/react-stripe-js'], web['@stripe/react-stripe-js']);
});

test('the server side keeps the manual-capture hold: a web card form only confirms the PaymentIntent gift_hold creates', () => {
  const payments = readFileSync(new URL('../../supabase/functions/payments/index.ts', import.meta.url), 'utf8');
  assert.match(payments, /capture_method: "manual" as const, \/\/ HOLD only: captured by gift-worker on accept/);
});

test('gift texts: "Pagar", and the hold note names the recipient (same key on the picker and the card step, es + en)', () => {
  const sheet = read('components/gift/GiftSheet.tsx');
  assert.match(sheet, /const holdNote = t\('gift\.holdNote', \{ name: recipient\.name \}\);/);
  assert.match(sheet, /<Text style=\{\[styles\.fine, \{ color: c\.textSecondary \}\]\}>\{holdNote\}<\/Text>/);
  assert.match(sheet, /note=\{holdNote\}/);
  const j = (lng) => JSON.parse(read(`i18n/locales/${lng}/chat.json`)).gift;
  assert.equal(j('es').payButton, 'Pagar {{amount}}');
  assert.equal(j('en').payButton, 'Pay {{amount}}');
  assert.equal(j('es').holdNote, 'Tu tarjeta se autoriza ahora y solo se cobra si {{name}} acepta el regalo. Si no lo acepta en 15 minutos, se libera sola.');
  assert.equal(j('en').holdNote, "Your card is authorized now and charged only if {{name}} accepts the gift. If it isn't accepted within 15 minutes, the hold is released automatically.");
});

test('gift_hold is CARD ONLY on the server (payment_method_types: card) without touching the shared Connect params', () => {
  const server = readFileSync(new URL('../../supabase/functions/payments/index.ts', import.meta.url), 'utf8');
  const gift = server.slice(server.indexOf('// ── gift_hold'));
  assert.match(gift, /const \{ automatic_payment_methods: _automatic, \.\.\.connectParams \} = buildConnectPiParams\(/);
  assert.match(gift, /payment_method_types: \["card"\],\s*capture_method: "manual" as const/);
  const shared = readFileSync(new URL('../../supabase/functions/_shared/connect.ts', import.meta.url), 'utf8');
  assert.match(shared, /automatic_payment_methods: \{ enabled: true \},/); // the order checkout keeps every method
});

test('the table sheet (accepting a gift) is lifted by the keyboard and capped to the visual viewport on the web only', () => {
  const card = read('components/gift/GiftCard.tsx');
  const sheet = card.slice(card.indexOf('function GiftAcceptSheet'));
  assert.match(card, /import \{ useKeyboardCover \} from '\.\.\/\.\.\/hooks\/useKeyboardCover';/);
  assert.match(sheet, /const onWeb = Platform\.OS === 'web';/);
  assert.match(sheet, /const keyboardOpen = onWeb && keyboardInset > 100;/);
  assert.match(sheet, /const webSheetMaxHeight = Math\.max\(240, Math\.floor\(visibleHeight - 24\)\);/); // top margin >= 24 px
  assert.match(sheet, /style=\{onWeb \? \{ paddingBottom: keyboardInset \} : undefined\}/);
  assert.match(sheet, /onWeb && \{ maxHeight: webSheetMaxHeight \}/);
  assert.match(sheet, /paddingBottom: \(keyboardOpen \? 0 : insets\.bottom\) \+ 12/); // devices: insets.bottom + 12, as before
  assert.match(sheet, /KeyboardAvoidingView behavior=\{Platform\.OS === 'ios' \? 'padding' : undefined\}/); // the native handling is untouched
});
