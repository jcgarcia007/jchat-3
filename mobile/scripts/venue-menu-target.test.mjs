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
const { venueMenuTarget, publicMenuUrl, embeddedMenuUrl, safeExternalMenuUrl } = await import(pathToFileURL(join(dir, 'venueMenuTarget.mjs')).href);

const t = (platform, menuMode, slug, externalUrl) => venueMenuTarget({ platform, menuMode, slug, externalUrl });

test('web: a slug opens the public menu in the SHEET (?embed=1, never ?app=1), whatever the menu mode', () => {
  for (const mode of ['web', 'native', null, undefined, 'something']) {
    assert.deepEqual(t('web', mode, 'bar-xzx-omd2', null), { kind: 'web-sheet', url: 'https://jchat.cloud/m/bar-xzx-omd2?embed=1' });
  }
  assert.ok(!t('web', 'web', 'bar', null).url.includes('app=1'));
  assert.ok(t('web', 'web', 'bar', null).url.endsWith('?embed=1'));
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
  assert.deepEqual(t('web', 'external', 'bar', null), { kind: 'web-sheet', url: 'https://jchat.cloud/m/bar?embed=1' });
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
  assert.equal(embeddedMenuUrl('bar'), 'https://jchat.cloud/m/bar?embed=1');
});

test('H-009: only an https: URL is an external menu; any other scheme, text with spaces or junk counts as no external menu', () => {
  const bad = ['tel:+15551234567', 'sms:+15551234567', 'javascript:alert(1)', 'http://menu.example/x', 'whatsapp://send?text=hi', 'mailto:a@b.co', 'data:text/html,hi', 'file:///etc/passwd', 'menu.example/x', 'https://menu example/x', 'https:// menu.example', 'https:', 'https://', '   ', 'https:///ruta', 'https://user@host', 'https://user:pw@host/x', 'https://@host', 'https:///', 'https://?x=1', 'https://#a', 'https://menu.example/x\ny', 'https://menu.example/\tx', 'https://menu.example\u0000', 'https:\\\\menu.example', 'ftp://menu.example/x', 'https//menu.example'];
  for (const url of bad) {
    assert.equal(safeExternalMenuUrl(url), null, url);
    // native + external mode: falls back to the app's menu (or the embedded web preview when the venue uses the web menu)
    assert.deepEqual(t('ios', 'external', 'bar', url), { kind: 'screen-menu' }, url);
    // web: falls back to the public menu sheet when there is a slug, else nothing to open
    assert.deepEqual(t('web', 'external', 'bar', url), { kind: 'web-sheet', url: 'https://jchat.cloud/m/bar?embed=1' }, url);
    assert.deepEqual(t('web', 'external', null, url), { kind: 'none' }, url);
  }
  assert.equal(safeExternalMenuUrl('  https://menu.example/x?a=1  '), 'https://menu.example/x?a=1');
  assert.equal(safeExternalMenuUrl('HTTPS://Menu.Example/x'), 'HTTPS://Menu.Example/x');
  assert.deepEqual(t('android', 'external', 'bar', ' https://menu.example/x '), { kind: 'external', url: 'https://menu.example/x' });
});

test('H-009 (vuelta 2): safeExternalMenuUrl does not use URL at all (a throwing or odd URL in Hermes must not hide every external menu)', () => {
  const src = readFileSync(new URL('../utils/venueMenuTarget.ts', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('export function safeExternalMenuUrl'), src.indexOf('export function venueMenuTarget'));
  assert.ok(!/new URL\(/.test(body) && !/\.hostname/.test(body) && !/\.protocol/.test(body) && !/try\s*\{/.test(body), 'plain string checks only');
  // it keeps working even if the global URL is broken
  const OriginalURL = globalThis.URL;
  globalThis.URL = function Broken() { throw new TypeError('URL is broken'); };
  try {
    assert.equal(safeExternalMenuUrl('https://ejemplo.com'), 'https://ejemplo.com');
    assert.equal(safeExternalMenuUrl('HTTPS://Ejemplo.com/menu?x=1'), 'HTTPS://Ejemplo.com/menu?x=1');
    assert.equal(safeExternalMenuUrl('https://ejemplo.com#frag'), 'https://ejemplo.com#frag');
    assert.equal(safeExternalMenuUrl('https://ejemplo.com?x=1'), 'https://ejemplo.com?x=1');
    assert.equal(safeExternalMenuUrl('https://127.0.0.1:8080/m'), 'https://127.0.0.1:8080/m');
    assert.equal(safeExternalMenuUrl('https://a'), 'https://a');
    assert.equal(safeExternalMenuUrl('https://ejemplo.com/ruta@algo'), 'https://ejemplo.com/ruta@algo'); // an @ AFTER the host is just part of the path
    assert.deepEqual(t('ios', 'external', 'bar', 'HTTPS://Ejemplo.com/menu?x=1'), { kind: 'external', url: 'HTTPS://Ejemplo.com/menu?x=1' });
    for (const bad of ['https://', 'https:///ruta', 'https://user@host', 'http://ejemplo.com', 'tel:+1555', 'sms:+1555', 'javascript:alert(1)', 'whatsapp://send', 'https://ej emplo.com', 'https://ejemplo.com\n/menu', 'texto cualquiera']) {
      assert.equal(safeExternalMenuUrl(bad), null, bad);
    }
  } finally {
    globalThis.URL = OriginalURL;
  }
});
