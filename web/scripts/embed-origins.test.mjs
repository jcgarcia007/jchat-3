// Unit tests for lib/embedOrigins.ts (who may embed the public menu / receive its postMessage). Run from web/:
//   node --test scripts/embed-origins.test.mjs

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'embed-origins-'));
const file = join(dir, 'embedOrigins.mjs');
writeFileSync(file, ts.transpileModule(readFileSync(new URL('../lib/embedOrigins.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
const { frameAncestorsForEmbed, isAllowedParentOrigin, resolveParentOrigin } = await import(pathToFileURL(file).href);

test('production frame-ancestors: self + our domains only, never *.vercel.app, never a bare *', () => {
  const v = frameAncestorsForEmbed(true);
  assert.equal(v, "'self' https://jchat.cloud https://jchat-app-web.vercel.app https://*.jchat.cloud");
  assert.ok(!v.includes('*.vercel.app'));
  assert.ok(!/(^| )\*( |$)/.test(v));
  assert.ok(!v.includes('localhost') && !v.includes('127.0.0.1'));
});

test('outside production the local test origins are added', () => {
  const v = frameAncestorsForEmbed(false);
  assert.ok(v.includes('http://localhost:*') && v.includes('http://127.0.0.1:*'));
  assert.ok(v.startsWith(frameAncestorsForEmbed(true)));
});

test('allowed parents: our origins; subdomains of jchat.cloud over https; localhost only outside production', () => {
  for (const ok of ['https://jchat.cloud', 'https://jchat-app-web.vercel.app', 'https://app.jchat.cloud']) assert.equal(isAllowedParentOrigin(ok, true), true, ok);
  assert.equal(isAllowedParentOrigin('http://localhost:4173', false), true);
  assert.equal(isAllowedParentOrigin('http://127.0.0.1:4173', false), true);
  assert.equal(isAllowedParentOrigin('http://localhost:4173', true), false);
});

test('refused: other vercel projects, look-alikes, plain http, paths, nothing', () => {
  for (const bad of ['https://evil.vercel.app', 'https://jchat.cloud.evil.com', 'https://eviljchat.cloud', 'http://jchat.cloud', 'https://jchat.cloud/', 'https://jchat.cloud/x', 'null', '', null, undefined, 'https://.jchat.cloud']) {
    assert.equal(isAllowedParentOrigin(bad, true), false, String(bad));
  }
});

test('the parent is resolved from ancestorOrigins / referrer, first allowed one wins, anything else → null (nothing is posted)', () => {
  assert.equal(resolveParentOrigin(['https://jchat-app-web.vercel.app'], true), 'https://jchat-app-web.vercel.app');
  assert.equal(resolveParentOrigin(['https://evil.example', 'https://jchat.cloud/some/page?x=1'], true), 'https://jchat.cloud');
  assert.equal(resolveParentOrigin(['', null, 'not a url'], true), null);
  assert.equal(resolveParentOrigin(['https://evil.example'], true), null);
  assert.equal(resolveParentOrigin(['http://localhost:4173/x'], true), null);
  assert.equal(resolveParentOrigin(['http://localhost:4173/x'], false), 'http://localhost:4173');
});
