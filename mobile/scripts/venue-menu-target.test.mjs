// Unit tests for utils/venueMenuTarget.ts (where the venue menu button leads, web vs native). Run from mobile/:
//   node --test scripts/venue-menu-target.test.mjs

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'venue-menu-'));
const compile = (rel, out, fix) => {
  let src = readFileSync(new URL(rel, import.meta.url), 'utf8');
  if (fix) src = src.replace(/from '\.\.\/constants\/appLinks'/, "from './appLinks.mjs'");
  writeFileSync(join(dir, out), ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
};
compile('../constants/appLinks.ts', 'appLinks.mjs');
compile('../utils/venueMenuTarget.ts', 'venueMenuTarget.mjs', true);
const { venueMenuTarget, publicMenuUrl } = await import(pathToFileURL(join(dir, 'venueMenuTarget.mjs')).href);

const t = (platform, menuMode, slug, externalUrl) => venueMenuTarget({ platform, menuMode, slug, externalUrl });

test('web: a slug opens the PUBLIC menu in a new tab (no ?app=1), whatever the menu mode', () => {
  for (const mode of ['web', 'native', null, undefined, 'something']) {
    assert.deepEqual(t('web', mode, 'bar-xzx-omd2', null), { kind: 'web-tab', url: 'https://jchat.cloud/m/bar-xzx-omd2' });
  }
  assert.ok(!t('web', 'web', 'bar', null).url.includes('app=1'));
});

test('web: an external menu still opens its own URL, even without a slug', () => {
  assert.deepEqual(t('web', 'external', 'bar', 'https://menu.example/x'), { kind: 'external', url: 'https://menu.example/x' });
  assert.deepEqual(t('web', 'external', null, 'https://menu.example/x'), { kind: 'external', url: 'https://menu.example/x' });
});

test('web: no slug (and no usable external URL) → nothing to open, the button is hidden', () => {
  assert.deepEqual(t('web', 'web', null, null), { kind: 'none' });
  assert.deepEqual(t('web', null, '  ', null), { kind: 'none' });
  assert.deepEqual(t('web', 'external', null, null), { kind: 'none' });
  assert.deepEqual(t('web', 'external', null, '   '), { kind: 'none' });
  // external mode without a URL falls back to the public menu when there is a slug
  assert.deepEqual(t('web', 'external', 'bar', null), { kind: 'web-tab', url: 'https://jchat.cloud/m/bar' });
});

test('native is unchanged: external → URL, web mode + slug → embedded preview, anything else → native menu', () => {
  for (const platform of ['ios', 'android']) {
    assert.deepEqual(t(platform, 'external', 'bar', 'https://menu.example/x'), { kind: 'external', url: 'https://menu.example/x' });
    assert.deepEqual(t(platform, 'web', 'bar', null), { kind: 'screen-web-preview' });
    assert.deepEqual(t(platform, 'web', null, null), { kind: 'screen-menu' });
    assert.deepEqual(t(platform, 'native', 'bar', null), { kind: 'screen-menu' });
    assert.deepEqual(t(platform, null, null, null), { kind: 'screen-menu' });
    assert.deepEqual(t(platform, 'external', 'bar', null), { kind: 'screen-menu' });
  }
});

test('the slug is URL-encoded and the base URL lives in one place', () => {
  assert.equal(publicMenuUrl('a b/c'), 'https://jchat.cloud/m/a%20b%2Fc');
});
