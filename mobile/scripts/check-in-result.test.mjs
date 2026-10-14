// Unit tests for utils/checkInResult.ts (check_in RPC row → CheckInResult). Run from mobile/:
//   node --test scripts/check-in-result.test.mjs

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'check-in-result-'));
const out = join(dir, 'checkInResult.mjs');
writeFileSync(out, ts.transpileModule(readFileSync(new URL('../utils/checkInResult.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
const { mapCheckInResponse } = await import(pathToFileURL(out).href);

const ID = '0b4895d0-5dc5-4c7f-8303-52748d0fe823'; // synthetic
const rpc = (row) => ({ data: [row], error: null });

test('checked_in → ok with the id and the visit count', () => {
  assert.deepEqual(mapCheckInResponse(rpc({ ok: true, reason: 'checked_in', check_in_id: ID, visit_count: 3 })), { ok: true, checkInId: ID, visitCount: 3 });
  assert.deepEqual(mapCheckInResponse(rpc({ ok: true, reason: 'checked_in', check_in_id: ID, visit_count: null })), { ok: true, checkInId: ID, visitCount: 1 }, 'no count → 1');
});

test('every refusal of the server has its own reason', () => {
  for (const reason of ['not_present', 'already_checked_in_24h', 'owner', 'invalid_business', 'business_inactive', 'auth_required']) {
    assert.deepEqual(mapCheckInResponse(rpc({ ok: false, reason, check_in_id: null, visit_count: null })), { ok: false, reason }, reason);
  }
  // already checked in carries the visit count on the wire, the UI does not need it
  assert.deepEqual(mapCheckInResponse(rpc({ ok: false, reason: 'already_checked_in_24h', check_in_id: null, visit_count: 4 })), { ok: false, reason: 'already_checked_in_24h' });
});

test('a network / server error is db_error and never a success', () => {
  assert.deepEqual(mapCheckInResponse({ data: null, error: { message: 'Failed to fetch' } }), { ok: false, reason: 'db_error', message: 'Failed to fetch' });
  assert.deepEqual(mapCheckInResponse({ data: null, error: {} }), { ok: false, reason: 'db_error', message: 'rpc_error' });
});

test('unexpected answers are db_error (the client never invents a check-in)', () => {
  for (const response of [
    { data: [], error: null },
    { data: null, error: null },
    { data: 'ok', error: null },
    rpc({ ok: true, reason: 'checked_in', check_in_id: null, visit_count: 1 }), // success without an id
    rpc({ ok: true, reason: 'something_else', check_in_id: ID, visit_count: 1 }),
    rpc({ ok: false, reason: 'brand_new_reason' }),
    rpc({ ok: false, reason: null }),
    rpc({}),
    rpc({ ok: 'true', reason: 'checked_in', check_in_id: ID }),
  ]) {
    const result = mapCheckInResponse(response);
    assert.equal(result.ok, false, JSON.stringify(response));
    assert.equal(result.reason, 'db_error', JSON.stringify(response));
  }
});
