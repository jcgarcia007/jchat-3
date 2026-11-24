// Unit tests for lib/clientIp.ts (which header the rate-limit IP comes from). Run from web/:  node --test scripts/client-ip.test.mjs

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'client-ip-'));
const out = join(dir, 'clientIp.mjs');
writeFileSync(out, ts.transpileModule(readFileSync(new URL('../lib/clientIp.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
const { clientIp } = await import(pathToFileURL(out).href);

const h = (o) => new Headers(o);

test('the Vercel header wins over anything a client can send', () => {
  assert.equal(clientIp(h({ 'x-vercel-forwarded-for': '203.0.113.7', 'x-real-ip': '198.51.100.1', 'x-forwarded-for': '6.6.6.6, 203.0.113.7' })), '203.0.113.7');
});

test('no Vercel header → x-real-ip', () => {
  assert.equal(clientIp(h({ 'x-real-ip': '198.51.100.1', 'x-forwarded-for': '6.6.6.6' })), '198.51.100.1');
});

test('last resort → first entry of x-forwarded-for', () => {
  assert.equal(clientIp(h({ 'x-forwarded-for': ' 6.6.6.6 , 10.0.0.1' })), '6.6.6.6');
});

test('nothing → empty string (unknown)', () => {
  assert.equal(clientIp(h({})), '');
});
