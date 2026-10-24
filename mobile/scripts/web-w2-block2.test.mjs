// W2 block 2: the 3-step web onboarding (devices keep their 4), "Saltar" on every web step, "Empezar" at the end,
// and the entry order account → onboarding → location → chat. Run from mobile/:  node --test scripts/web-w2-block2.test.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const screen = read('screens/onboarding/OnboardingScreen.tsx');
const json = (l) => JSON.parse(read(`i18n/locales/${l}/onboarding.json`));

test('web has 3 steps of its own, devices keep the 4 current ones', () => {
  assert.match(screen, /const WEB_STEPS: StepConfig\[\] = \[/);
  assert.equal((screen.match(/key: 'webStep[123]'/g) ?? []).length, 3);
  const native = screen.slice(screen.indexOf('const NATIVE_STEPS'), screen.indexOf('const IS_WEB'));
  assert.equal((native.match(/key: 'step[1-4]'/g) ?? []).length, 4);
  assert.doesNotMatch(native, /webStep/);
  assert.match(screen, /const STEPS: StepConfig\[\] = IS_WEB \? WEB_STEPS : NATIVE_STEPS;/);
});

test('"Saltar" shows on every web step; devices still hide Skip on the last one', () => {
  assert.match(screen, /pointerEvents=\{isLastStep && !IS_WEB \? 'none' : 'auto'\}/);
  assert.match(screen, /\{\(!isLastStep \|\| IS_WEB\) && \(/);
  assert.match(screen, /t\(IS_WEB \? 'skipWeb' : 'skip'\)/);
});

test('the last web step says "Empezar" and offers "Descargar la app"; finishing is the same handler as before', () => {
  assert.match(screen, /t\(IS_WEB \? 'start' : 'exploreMap'\)/);
  assert.match(screen, /IS_WEB && isLastStep \? \(/);
  assert.match(screen, /storeLinkFor\(detectStorePlatform\(/);
  // Both the primary button and Skip end in handleFinish → completeOnboarding + navigation.replace('Tabs') (unchanged).
  assert.match(screen, /const handleNext = \(\) => \{\s*if \(isLastStep\) \{\s*void handleFinish\(\);/);
  assert.match(screen, /navigation\.replace\('Tabs'\)/);
});

test('es / en: the web copy exists with the same keys', () => {
  const es = json('es');
  const en = json('en');
  assert.deepEqual(Object.keys(es).sort(), Object.keys(en).sort());
  assert.deepEqual(Object.keys(es.steps).sort(), Object.keys(en.steps).sort());
  for (const k of ['webStep1', 'webStep2', 'webStep3']) {
    assert.ok(es.steps[k].title && es.steps[k].description && en.steps[k].title && en.steps[k].description, k);
  }
  assert.equal(es.skipWeb, 'Saltar');
  assert.equal(es.start, 'Empezar');
  assert.equal(es.skip, 'Omitir', 'the device copy is untouched');
  assert.equal(es.exploreMap, 'Explorar el mapa', 'the device copy is untouched');
});

test('entry order: a pending entry waits for the onboarding, then EntryBridge consumes it (no change needed)', () => {
  const nav = read('navigation/AppNavigator.tsx');
  // EntryBridge is inactive until the onboarding check resolved AND the current route is not Onboarding.
  assert.match(nav, /onboardingResolvedFor === user\.id &&\s*currentRoute !== null &&\s*currentRoute !== 'Onboarding'/);
  // Finishing the onboarding replaces the route with Tabs → currentRoute changes → `active` → consume().
  assert.match(nav, /if \(active\) void consume\(\);/);
});
