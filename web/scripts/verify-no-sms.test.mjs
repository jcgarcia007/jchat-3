// Guards for the 2026-10-17 decision "the SMS step leaves v1" (business verification = identity + code/selfie + manual admin
// approval). Source-level checks: the route needs the service-role client and the cookie session, so it is not imported here.
// Run from web/:  node --test scripts/verify-no-sms.test.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const route = read('app/api/verify/route.ts');
const page = stripComments(read('app/business/verify/page.tsx')); // the page's header comment explains the removal, so only code is checked

test('every verification action answers 410 Gone { error: "verification_steps_removed" } (kept in the switch, not a generic 400)', () => {
  const gone = /((?:case "[a-z_]+":\s*)+)return NextResponse\.json\(\{ error: "verification_steps_removed" \}, \{ status: 410 \}\)/.exec(route);
  assert.ok(gone, 'one group of cases answers 410');
  for (const action of ['identity_status', 'generate_code', 'submit_selfie', 'send_sms', 'verify_sms']) assert.match(gone[1], new RegExp(`case "${action}"`));
});

test('the route no longer knows Twilio, SMS codes or a 503 kill-switch', () => {
  assert.doesNotMatch(route, /TWILIO/);
  assert.doesNotMatch(route, /isTwilioConfigured/);
  assert.doesNotMatch(route, /sms_code|sms_expires_at/);
  assert.doesNotMatch(route, /Verification flow not available yet/);
});

test('the JWT + ownership gate still runs before the action switch (P0-3), and nobody flips the business to verified here', () => {
  const sw = route.indexOf('switch (action)');
  assert.ok(sw > 0);
  for (const gate of ['createSupabaseServerClient()', 'serverClient.auth.getUser()', 'assertOwnerOrAdmin(business_id, user.id)']) {
    const at = route.indexOf(gate);
    assert.ok(at > 0 && at < sw, `${gate} must come before the switch`);
  }
  assert.doesNotMatch(route, /status:\s*["']verified["']/, 'the owner-facing route must never write businesses.status = verified');
});

test('the owner page has no SMS and no steps, and never calls /api/verify', () => {
  assert.doesNotMatch(page, /Step3SMS|handleSendSMS|send_sms|verify_sms|__dev_code|Dev mode|Phone SMS|Twilio|sms_verified/);
  assert.doesNotMatch(page, /api\/verify/);
  assert.match(page, /tr\("reviewMessage"\)/);
});

test('the new texts exist in es and en, and only the legacy chip labels mention the old steps', () => {
  const en = JSON.parse(read('messages/en.json'));
  const es = JSON.parse(read('messages/es.json'));
  for (const key of ['pageTitle', 'reviewMessage', 'verifiedTitle', 'goToDashboard']) {
    assert.ok(typeof en.businessVerify?.[key] === 'string' && en.businessVerify[key].trim(), `en.businessVerify.${key}`);
    assert.ok(typeof es.businessVerify?.[key] === 'string' && es.businessVerify[key].trim(), `es.businessVerify.${key}`);
  }
  assert.match(en.businessVerify.reviewMessage, /24 hours/);
  assert.match(es.businessVerify.reviewMessage, /24 h/);
  assert.doesNotMatch(JSON.stringify(en.businessVerify) + JSON.stringify(es.businessVerify), /SMS|Twilio|Selfie|Stripe Identity|Step|Paso/i);
  assert.match(en.superAdmin.verification.stepSmsLabel, /legacy/i);
  assert.match(es.superAdmin.verification.stepSmsLabel, /heredado/i);
  assert.match(en.superAdmin.verification.stepIdentityLabel, /legacy/i);
  assert.match(es.superAdmin.verification.stepSelfieLabel, /heredado/i);
});
