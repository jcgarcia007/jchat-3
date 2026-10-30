// preflight:eas must catch exactly what broke EAS build 11 (local build leftovers inside node_modules) and nothing else.
// Run from mobile/:  node --test scripts/preflight-eas.test.mjs
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { BUILD_OUTPUT, diffTrees, nativePackages } from './preflight-eas.mjs';

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
