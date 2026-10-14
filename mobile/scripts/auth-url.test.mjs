// Unit tests for utils/authUrl.ts (what the app does with jchat://confirm links). Run from mobile/:
//   node --test scripts/auth-url.test.mjs

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'auth-url-'));
const out = join(dir, 'authUrl.mjs');
writeFileSync(out, ts.transpileModule(readFileSync(new URL('../utils/authUrl.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
const { classifyAuthUrl, readAuthCode, carriesSessionTokens } = await import(pathToFileURL(out).href);

const CODE = 'a1b2c3d4-e5f6-4789-8abc-def012345678'; // synthetic

test('confirm link with a code → exchange', () => {
  assert.deepEqual(classifyAuthUrl(`jchat://confirm?code=${CODE}`), { kind: 'exchange', code: CODE });
  assert.deepEqual(classifyAuthUrl(`jchat://confirm/?code=${CODE}&x=1`), { kind: 'exchange', code: CODE });
});

test('confirm link with tokens in the fragment → rejected (the session-fixation shape)', () => {
  assert.deepEqual(classifyAuthUrl('jchat://confirm#access_token=attacker.jwt&refresh_token=attacker&type=signup'), { kind: 'rejected', reason: 'tokens_in_url' });
  assert.deepEqual(classifyAuthUrl('jchat://confirm#access_token=a&refresh_token=b&expires_in=3600'), { kind: 'rejected', reason: 'tokens_in_url' });
});

test('tokens next to a code are still rejected, never mixed', () => {
  assert.deepEqual(classifyAuthUrl(`jchat://confirm?code=${CODE}#access_token=a&refresh_token=b`), { kind: 'rejected', reason: 'tokens_in_url' });
  assert.deepEqual(classifyAuthUrl('jchat://confirm?access_token=a&refresh_token=b'), { kind: 'rejected', reason: 'tokens_in_url' });
});

test('confirm link without a usable code → rejected', () => {
  for (const url of ['jchat://confirm', 'jchat://confirm?code=', 'jchat://confirm?code=x', 'jchat://confirm#error=access_denied&error_code=otp_expired', `jchat://confirm?code=${'a'.repeat(600)}`, 'jchat://confirm?code=%E0%A4%A']) {
    assert.deepEqual(classifyAuthUrl(url), { kind: 'rejected', reason: 'no_code' }, url);
  }
});

test('foreign or look-alike URLs are ignored', () => {
  for (const url of [
    'jchat://v/bar-xzx-omd2',
    'jchat://room/abc',
    'jchat://confirmation?code=' + CODE,
    'jchat://confirmx?code=' + CODE,
    'https://evil.example/?next=jchat://confirm?code=' + CODE,
    'https://jchat.cloud/confirm?code=' + CODE,
    'jchat://auth/callback?code=' + CODE,
    '',
  ]) {
    assert.deepEqual(classifyAuthUrl(url), { kind: 'ignore' }, url);
  }
});

test('readAuthCode reads only ?code= (never the fragment)', () => {
  assert.equal(readAuthCode(`jchat://auth/callback?code=${CODE}`), CODE);
  assert.equal(readAuthCode(`jchat://auth/callback#code=${CODE}`), null);
  assert.equal(readAuthCode('jchat://auth/callback#access_token=a&refresh_token=b'), null);
  assert.equal(readAuthCode('jchat://auth/callback'), null);
});

test('carriesSessionTokens', () => {
  assert.equal(carriesSessionTokens('jchat://auth/callback#access_token=a&refresh_token=b'), true);
  assert.equal(carriesSessionTokens(`jchat://auth/callback?code=${CODE}`), false);
});
