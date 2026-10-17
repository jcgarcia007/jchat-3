// Guard for "no 'Skip for now (Testing)' on /business/verify": the owner page must have no way to bypass Stripe Identity or the
// code + selfie step — not with a button, not behind an env variable. Source-level check (comments are stripped first: the page
// may explain why the bypass is gone).
// Run from web/:  node --test scripts/verify-no-test-skip.test.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const page = stripComments(read('app/business/verify/page.tsx'));

test('the verify page has no skip button, handler or env switch', () => {
  assert.doesNotMatch(page, /skip/i);
  assert.doesNotMatch(page, /showTestSkip|handleTestSkip|HIDE_TEST_SKIP/);
  assert.doesNotMatch(page, /Testing only|bypasses/i);
});

test('the page no longer writes business_verifications from the browser (identity can only come from the server)', () => {
  assert.doesNotMatch(page, /from\("business_verifications"\)\s*\.(update|insert|upsert)/);
  assert.doesNotMatch(page, /identity_status:\s*"approved"/);
});

test('the only way out of step 1 is a server-confirmed approval', () => {
  assert.match(page, /isApproved && \(\s*<button type="button" onClick=\{onComplete\}/);
});
