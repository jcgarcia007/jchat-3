// preflight:eas must catch exactly what broke EAS build 11 (local build leftovers inside node_modules) and nothing else.
// Run from mobile/:  node --test scripts/preflight-eas.test.mjs
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { ACTIVE_RUNTIME, BUILD_OUTPUT, RUNTIMES, compareRuntime, diffTrees, nativePackages } from './preflight-eas.mjs';

const tree = (spec) => {
  const root = mkdtempSync(join(tmpdir(), 'preflight-test-'));
  for (const [path, content] of Object.entries(spec)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
};

test('identical trees: no difference (a nested node_modules is ignored, as npm pack does not ship it)', () => {
  const a = tree({ 'package.json': '{}', 'android/src/Main.java': 'x' });
  const b = tree({ 'package.json': '{}', 'android/src/Main.java': 'x', 'node_modules/dep/index.js': 'y' });
  assert.deepEqual(diffTrees(a, b), []);
});

test('the three leftovers of a local build are reported: extra android/build, edited manifest, edited header', () => {
  const pristine = tree({
    'android/src/main/AndroidManifest.xml': '<manifest package="org.x">',
    'ios/AirMaps/RNMapsDefines.h': '#define HAVE_GOOGLE_MAPS 1',
  });
  const installed = tree({
    'android/src/main/AndroidManifest.xml': '<manifest >',
    'ios/AirMaps/RNMapsDefines.h': '#define HAVE_GOOGLE_MAPS 0',
    'android/build/generated/x.bin': '1',
  });
  assert.deepEqual(diffTrees(pristine, installed).sort(), [
    'content differs: android/src/main/AndroidManifest.xml',
    'content differs: ios/AirMaps/RNMapsDefines.h',
    'extra in node_modules: android/build/generated/x.bin',
  ]);
});

test('build output (android/build, android/.cxx, ios/Pods) is classified as harmless, a real file is not', () => {
  for (const d of ['extra in node_modules: android/build/generated/x.bin', 'extra in node_modules: android/.cxx/Debug/a.json', 'extra in node_modules: ios/Pods/x.h', 'extra in node_modules: expo-updates-gradle-plugin/.gradle/9.3.1/x.bin', 'extra in node_modules: expo-updates-gradle-plugin/build/classes/A.class']) assert.match(d, BUILD_OUTPUT, d);
  for (const d of ['content differs: android/src/main/AndroidManifest.xml', 'content differs: ios/AirMaps/RNMapsDefines.h', 'content differs: android/build/real.json', 'missing in node_modules: android/build/real.json', 'extra in node_modules: android/src/Real.java', 'missing in node_modules: android/build.gradle']) assert.doesNotMatch(d, BUILD_OUTPUT, d);
});

test('a file missing from node_modules is reported', () => {
  assert.deepEqual(diffTrees(tree({ 'a.js': '1', 'b.js': '2' }), tree({ 'a.js': '1' })), ['missing in node_modules: b.js']);
});

test('only top-level registry packages with an android/ or ios/ folder are checked', () => {
  const root = tree({
    'node_modules/native-one/android/Main.java': 'x',
    'node_modules/native-two/ios/Main.m': 'x',
    'node_modules/plain/index.js': 'x',
    'node_modules/linked/android/Main.java': 'x',
    'node_modules/native-one/node_modules/nested/android/Main.java': 'x',
    'package-lock.json': JSON.stringify({
      packages: {
        '': { name: 'app' },
        'node_modules/native-one': { version: '1.0.0', resolved: 'https://registry/native-one.tgz' },
        'node_modules/native-two': { version: '2.0.0', resolved: 'https://registry/native-two.tgz' },
        'node_modules/plain': { version: '3.0.0', resolved: 'https://registry/plain.tgz' },
        'node_modules/linked': { version: '1.0.0', link: true },
        'node_modules/native-one/node_modules/nested': { version: '9.9.9', resolved: 'https://registry/nested.tgz' },
      },
    }),
  });
  assert.deepEqual(nativePackages(root).map((p) => `${p.name}@${p.version}`), ['native-one@1.0.0', 'native-two@2.0.0']);
});

test('runtime: build 15 is the active one (hashes pending until the EAS log); build 13 and older stay recorded', () => {
  assert.equal(ACTIVE_RUNTIME, 'build15');
  assert.deepEqual(RUNTIMES.build15, { ios: null, android: null }); // filled in from the EAS log of the build
  // while build 15 has no hashes, an OTA check against the active runtime is refused even for a plausible fingerprint
  assert.equal(compareRuntime({ ios: 'a'.repeat(40), android: 'b'.repeat(40) }).ok, false);
  // runtimeVersion of iOS build 14 (EAS 1b50d7c9) and Android build 13 (EAS ad07d0dc), as reported by EAS build_info
  assert.deepEqual(RUNTIMES.build13, { ios: 'dbdfeaeab820021354ccf7b8a061b3b962e3a04e', android: 'f7d420cd34d516f36a04ca63411df939d7f66e34' });
  assert.equal(compareRuntime(RUNTIMES.build13, RUNTIMES.build13).ok, true); // the recorded build 13 still passes against itself
  assert.equal(compareRuntime(RUNTIMES.build13).ok, false); // …and is NOT the active runtime any more
  // an entry whose hashes are not filled in yet never says ok (an OTA is refused until they are)
  const pending = compareRuntime({ ios: 'a'.repeat(40), android: 'b'.repeat(40) }, { ios: null, android: null });
  assert.equal(pending.ok, false);
  assert.match(pending.lines.join('\n'), /not filled in RUNTIMES yet/);
  assert.deepEqual(compareRuntime(RUNTIMES.build12, RUNTIMES.build12).ok, true);
  const r = compareRuntime(RUNTIMES.build11, RUNTIMES.build12);
  assert.equal(r.ok, false);
  assert.match(r.lines.join('\n'), /✖ ios/);
  assert.deepEqual(compareRuntime(RUNTIMES.build11, RUNTIMES.build11).ok, true);
  for (const [name, b] of Object.entries(RUNTIMES)) {
    if (name === ACTIVE_RUNTIME && b.ios === null && b.android === null) continue; // the active build waits for its EAS log
    for (const h of Object.values(b)) assert.match(h, /^[0-9a-f]{40}$/);
  }
});
