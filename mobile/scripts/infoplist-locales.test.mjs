// assets/locales/*.json feed the generated InfoPlist.strings (@expo/config-plugins build/ios/Locales.js writes `KEY = "value";` with no escaping), so a value
// holding a double quote, a backslash or a line break makes the file unparsable ("Couldn't parse property list", build 13). Run from mobile/:
//   node --test scripts/infoplist-locales.test.mjs
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const dir = new URL('../assets/locales/', import.meta.url);

function* strings(node, path) {
  if (typeof node === 'string') yield [path, node];
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) yield* strings(v, `${path}.${k}`);
}

const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

test('there are locale files to check', () => {
  assert.ok(files.length >= 2, `expected at least en.json and es.json, found: ${files.join(', ')}`);
});

for (const file of files) {
  test(`${file}: no value breaks InfoPlist.strings`, () => {
    const json = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
    const bad = [];
    for (const [path, value] of strings(json, file)) {
      if (/["\\\r\n]/.test(value)) bad.push(path);
    }
    assert.deepEqual(bad, [], `these values contain a double quote, a backslash or a line break (use typographic quotes): ${bad.join(', ')}`);
  });
}
