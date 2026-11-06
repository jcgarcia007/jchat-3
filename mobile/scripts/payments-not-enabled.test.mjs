// Unit tests for utils/paymentsNotEnabled.ts. Run from mobile/:  node --test scripts/payments-not-enabled.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'pay-not-enabled-'));
const src = readFileSync(new URL('../utils/paymentsNotEnabled.ts', import.meta.url), 'utf8');
writeFileSync(join(dir, 'm.mjs'), ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
const { isPaymentsNotEnabled } = await import(pathToFileURL(join(dir, 'm.mjs')).href);

test('server code, any case', () => {
  assert.equal(isPaymentsNotEnabled({ code: 'payments_not_enabled', status: 409 }), true);
  assert.equal(isPaymentsNotEnabled({ code: 'PAYMENTS_NOT_ENABLED' }), true);
});
test('legacy server message without code', () => {
  assert.equal(isPaymentsNotEnabled(new Error('This business is not set up to accept payments yet')), true);
  assert.equal(isPaymentsNotEnabled({ message: 'this business is NOT SET UP TO ACCEPT PAYMENTS yet', code: undefined }), true);
});
test('other errors are not it', () => {
  assert.equal(isPaymentsNotEnabled({ code: 'venue_closed' }), false);
  assert.equal(isPaymentsNotEnabled(new Error('This business is pending verification')), false);
  assert.equal(isPaymentsNotEnabled(new Error('This business has not completed Stripe onboarding')), false);
  assert.equal(isPaymentsNotEnabled(new Error('Network request failed')), false);
  assert.equal(isPaymentsNotEnabled(null), false);
  assert.equal(isPaymentsNotEnabled(undefined), false);
  assert.equal(isPaymentsNotEnabled('x'), false);
});
