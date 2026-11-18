// Unit tests for lib/jsonLd.ts (H-001: the JSON-LD of the public venue page must not be able to close its <script> element) and its use in
// app/b/[slug]/page.tsx. Run from web/:
//   node --test scripts/json-ld.test.mjs

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const compile = (src) => ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;

const dir = mkdtempSync(join(tmpdir(), 'json-ld-'));
writeFileSync(join(dir, 'appLinks.mjs'), compile(read('lib/appLinks.ts')));
writeFileSync(join(dir, 'jsonLd.mjs'), compile(read('lib/jsonLd.ts')).replace('"./appLinks"', '"./appLinks.mjs"'));
const { safeJsonLd, localBusinessJsonLd } = await import(pathToFileURL(join(dir, 'jsonLd.mjs')).href);

const BS = String.fromCharCode(92);
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

const nasty = [
  '</script><img src=x onerror=alert(1)>',
  '<!-- comment -->',
  'Tom & Jerry <b>bar</b>',
  'quote " and apostrophe \' and backslash ' + BS + ' end',
  'line one\nline two\r\nline three',
  `separators ${LS} and ${PS} inside`,
  '',
];

test('the output holds no angle bracket, ampersand or U+2028 / U+2029, and parses back to the same value', () => {
  for (const text of nasty) {
    const original = { name: text, nested: { list: [text, 1, null, true] }, [text]: 'key too' };
    const out = safeJsonLd(original);
    assert.ok(!/[<>&]/.test(out), `unescaped character in: ${out}`);
    assert.ok(!out.includes(LS) && !out.includes(PS), 'U+2028 / U+2029 must be written as text');
    assert.deepEqual(JSON.parse(out), original);
  }
});

test('the characters are written as backslash, u and four lowercase hex digits', () => {
  const out = safeJsonLd({ v: `<>&${LS}${PS}` });
  assert.equal(out, '{"v":"' + [BS + 'u003c', BS + 'u003e', BS + 'u0026', BS + 'u2028', BS + 'u2029'].join('') + '"}');
});

test('plain values are left alone and undefined becomes null', () => {
  assert.equal(safeJsonLd({ a: 'hola', b: 2 }), '{"a":"hola","b":2}');
  assert.equal(safeJsonLd(undefined), 'null');
});

test('LocalBusiness: canonical URL on the real domain, optional fields dropped', () => {
  const data = localBusinessJsonLd({ slug: 'bar-uno', name: 'Bar Uno', description: null, address: null, cover_url: null });
  assert.equal(data.url, 'https://jchat.cloud/b/bar-uno');
  assert.equal(data['@type'], 'LocalBusiness');
  const parsed = JSON.parse(safeJsonLd(data));
  assert.deepEqual(Object.keys(parsed).sort(), ['@context', '@type', 'name', 'url']);
});

test('page: a venue named with a closing script tag renders ONE script element and no injected element', () => {
  const data = localBusinessJsonLd({
    slug: 'x',
    name: '</script><img src=x onerror=1>',
    description: '<svg onload=1> & more',
    address: '</script><script>alert(1)</script>',
    cover_url: null,
  });
  const html = renderToStaticMarkup(createElement('script', { type: 'application/ld+json', dangerouslySetInnerHTML: { __html: safeJsonLd(data) } }));
  assert.equal(html.split('<script').length - 1, 1, html);
  assert.equal(html.split('</script>').length - 1, 1, html);
  assert.ok(!html.includes('<img') && !html.includes('<svg'), html);
  const inner = html.slice(html.indexOf('>') + 1, html.lastIndexOf('</script>'));
  assert.equal(JSON.parse(inner).name, '</script><img src=x onerror=1>');
});

test('app/b/[slug]/page.tsx emits its JSON-LD through safeJsonLd and no longer points to the old domain', () => {
  const page = read('app/b/[slug]/page.tsx');
  assert.match(page, /__html: safeJsonLd\(/);
  assert.doesNotMatch(page, /JSON\.stringify/);
  assert.doesNotMatch(page, /jchat\.app/);
});
