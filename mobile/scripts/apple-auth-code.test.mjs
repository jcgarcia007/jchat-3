import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const src = readFileSync(new URL('../utils/appleAuthCode.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const { pickAuthorizationCode } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

test('returns the trimmed code', () => {
  assert.equal(pickAuthorizationCode({ authorizationCode: '  c123.0.abc  ' }), 'c123.0.abc');
});
test('null when missing, blank or not a string', () => {
  assert.equal(pickAuthorizationCode({ authorizationCode: null }), null);
  assert.equal(pickAuthorizationCode({ authorizationCode: '   ' }), null);
  assert.equal(pickAuthorizationCode({}), null);
  assert.equal(pickAuthorizationCode(undefined), null);
  assert.equal(pickAuthorizationCode({ authorizationCode: 5 }), null);
});
test('the iOS login sends the code to apple-token and never blocks on failure', () => {
  const login = readFileSync(new URL('../services/appleSignIn.ios.ts', import.meta.url), 'utf8');
  assert.match(login, /functions\.invoke\('apple-token'/);
  assert.match(login, /try \{\s*await supabase\.functions\.invoke\('apple-token'[\s\S]*?\} catch/);
});
