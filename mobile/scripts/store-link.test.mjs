// Unit tests for utils/storeLink.ts (which store the web "Descargar la app" button opens). Run from mobile/:
//   node --test scripts/store-link.test.mjs

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'store-link-'));
const compile = (rel, out) => {
  const src = readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/from '\.\.\/constants\/appLinks'/, "from './appLinks.mjs'");
  writeFileSync(join(dir, out), ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText);
};
compile('../constants/appLinks.ts', 'appLinks.mjs');
compile('../utils/storeLink.ts', 'storeLink.mjs');
const { detectStorePlatform, storeLinkFor } = await import(pathToFileURL(join(dir, 'storeLink.mjs')).href);

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

test('iPhone / iPad → ios, Android → android, desktop → desktop', () => {
  assert.equal(detectStorePlatform(IPHONE), 'ios');
  assert.equal(detectStorePlatform('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)'), 'ios');
  assert.equal(detectStorePlatform(ANDROID), 'android');
  assert.equal(detectStorePlatform(MAC), 'desktop');
  assert.equal(detectStorePlatform(WINDOWS), 'desktop');
  assert.equal(detectStorePlatform(''), 'desktop');
});

test('iPadOS sends a Mac user agent: a Mac with a touch screen is an iPad', () => {
  assert.equal(detectStorePlatform(MAC, 5), 'ios');
  assert.equal(detectStorePlatform(MAC, 0), 'desktop');
});

test('links: App Store on iOS (download page while there is no listing), Play Store on Android, download page on desktop', () => {
  const urls = { appStore: 'https://apps.apple.com/app/id1', playStore: 'https://play.example/x', downloadPage: 'https://example/download' };
  assert.equal(storeLinkFor('ios', urls), 'https://apps.apple.com/app/id1');
  assert.equal(storeLinkFor('ios', { ...urls, appStore: null }), 'https://example/download');
  assert.equal(storeLinkFor('android', urls), 'https://play.example/x');
  assert.equal(storeLinkFor('desktop', urls), 'https://example/download');
});

test('the shipped defaults are real URLs', () => {
  assert.match(storeLinkFor('android'), /^https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.juangarciacruz\.jchatapp$/);
  assert.match(storeLinkFor('desktop'), /^https:\/\//);
});
