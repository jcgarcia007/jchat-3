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

test('send_sms and verify_sms answer 410 Gone { error: "sms_verification_removed" } (kept in the switch, not a generic 400)', () => {
  const sms = /case "send_sms":\s*case "verify_sms": \{([\s\S]*?)\n    \}/.exec(route);
  assert.ok(sms, 'both actions share one case in the switch');
  assert.match(sms[1], /error: "sms_verification_removed"/);
  assert.match(sms[1], /status: 410/);
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

test('the owner page has two steps and no SMS step, and ends on the "an administrator will review" screen', () => {
  assert.doesNotMatch(page, /Step3SMS|handleSendSMS|send_sms|verify_sms|__dev_code|Dev mode|Phone SMS|Twilio/);
  assert.doesNotMatch(page, /all 3 steps|Step 3/i);
  assert.equal((/const STEPS = \[([\s\S]*?)\n\];/.exec(page)?.[1].match(/number:/g) ?? []).length, 2, 'two entries in STEPS');
  assert.match(page, /step < 2/, 'completeStep ends at step 2');
  assert.match(page, /tr\("doneMessage"\)/);
  assert.doesNotMatch(page, /sms_verified/, 'the resume logic ignores the SMS flag');
});

test('the new texts exist in es and en, and only the legacy SMS chip label mentions SMS', () => {
  const en = JSON.parse(read('messages/en.json'));
  const es = JSON.parse(read('messages/es.json'));
  for (const key of ['intro', 'sendForReview', 'doneTitle', 'doneSubtitle', 'doneMessage', 'goToDashboard']) {
    assert.ok(typeof en.businessVerify?.[key] === 'string' && en.businessVerify[key].trim(), `en.businessVerify.${key}`);
    assert.ok(typeof es.businessVerify?.[key] === 'string' && es.businessVerify[key].trim(), `es.businessVerify.${key}`);
  }
  assert.match(en.businessVerify.doneMessage, /24 hours/);
  assert.match(es.businessVerify.doneMessage, /24 h/);
  assert.doesNotMatch(JSON.stringify(en.businessVerify) + JSON.stringify(es.businessVerify), /SMS|Twilio/i);
  assert.match(en.superAdmin.verification.stepSmsLabel, /legacy/i);
  assert.match(es.superAdmin.verification.stepSmsLabel, /heredado/i);
});
