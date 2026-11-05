// Static test for DT-1 (Dynamic Type / Android fontScale). Run from mobile/:  node --test scripts/dynamic-type.test.mjs
// (a) the global cap exists and is wired at the entry point; (b) the controls listed in dynamic-type-targets.json use minHeight, not
// a fixed height; (c) the short-label files cap their text at LABEL_TEXT_CAP; (d) no content Text turns allowFontScaling off.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const targets = JSON.parse(read('scripts/dynamic-type-targets.json'));

/** The body of the style rule `selector: { ... }` (multi-line block or one-liner). */
function styleBlock(source, selector) {
  const m = source.match(new RegExp(`^( *)${selector}: \\{(.*?)(?:\\n\\1\\},|\\},?$)`, 'ms'));
  return m ? m[0] : null;
}

test('(a) the global cap exists and is installed before any screen', () => {
  const scale = read('theme/textScale.ts');
  assert.match(scale, /CONTENT_TEXT_CAP = 1\.6/);
  assert.match(scale, /LABEL_TEXT_CAP = 1\.3/);
  const polyfill = read('polyfills/textScaleCap.native.ts');
  assert.match(polyfill, /maxFontSizeMultiplier \?\? CONTENT_TEXT_CAP/);
  assert.match(polyfill, /defineProperty\(RN, 'Text'/);
  assert.match(polyfill, /defineProperty\(RN, 'TextInput'/);
  assert.doesNotMatch(polyfill, /allowFontScaling/);
  // statics of the base component (TextInput.State, ...) are copied onto the wrapper
  assert.match(polyfill, /for \(const key of Object\.getOwnPropertyNames\(Base\)\)/);
  assert.match(polyfill, /SKIPPED_STATICS = new Set\(\['length', 'name', 'prototype', '\$\$typeof', 'render'/);
  assert.match(polyfill, /Object\.defineProperty\(Wrapped, key, descriptor\)/);
  const entry = read('index.ts');
  const capAt = entry.indexOf("import './polyfills/textScaleCap'");
  assert.ok(capAt > 0, 'index.ts imports the cap');
  assert.ok(capAt < entry.indexOf("import App from './App'"), 'the cap is installed before App');
});

for (const [file, selectors] of Object.entries(targets.minHeightSelectors)) {
  test(`(b) ${file}: ${selectors.join(', ')} use minHeight`, () => {
    const source = read(file);
    for (const selector of selectors) {
      const block = styleBlock(source, selector);
      assert.ok(block, `style rule ${selector} exists in ${file}`);
      assert.doesNotMatch(block, /(?<![A-Za-z])height:/, `${selector} must not have a fixed height`);
      assert.match(block, /minHeight:/, `${selector} must have a minHeight`);
    }
  });
}

for (const file of targets.labelCapFiles) {
  test(`(c) ${file}: every <Text> of the short-label file is capped at LABEL_TEXT_CAP`, () => {
    const source = read(file);
    assert.match(source, /import \{ (LABEL_TEXT_CAP|typeCap)/);
    const texts = source.match(/<Text(?=[\s>])[^>]*>/gs) ?? [];
    assert.ok(texts.length > 0);
    for (const tag of texts) {
      assert.ok(/maxFontSizeMultiplier=\{(LABEL_TEXT_CAP|typeCap\('\w+'\)|1\.\d+)\}/.test(tag), `uncapped <Text> in ${file}: ${tag.slice(0, 60)}`);
    }
  });
}

test('(c2) the Messages title does not split and is capped', () => {
  const source = read('screens/dms/MessagesScreen.tsx');
  const titles = source.match(/<Text[^>]*styles\.title[^>]*>/g) ?? [];
  assert.equal(titles.length, 2);
  for (const tag of titles) assert.match(tag, /maxFontSizeMultiplier=\{LABEL_TEXT_CAP\}.*numberOfLines=\{1\}/s);
});

test('(c3) the chat input line height follows the capped font scale', () => {
  const source = read('components/chat/ChatInput.tsx');
  assert.match(source, /Math\.min\(PixelRatio\.getFontScale\(\), CONTENT_TEXT_CAP\)/);
});

function walk(dir, out = []) {
  for (const name of readdirSync(join(root, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) walk(rel, out);
    else if (/\.tsx?$/.test(name)) out.push(rel);
  }
  return out;
}

test('(d) no <Text> / <TextInput> turns allowFontScaling off', () => {
  const offenders = [];
  for (const dir of ['screens', 'components', 'navigation']) {
    for (const file of walk(dir)) {
      if (/allowFontScaling=\{false\}/.test(read(file))) offenders.push(file);
    }
  }
  assert.deepEqual(offenders, []);
});
