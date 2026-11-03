// B2-13: an age rejection is remembered on the device for 24 h (only the time) and the sign-up does not open meanwhile.
// Run from mobile/:  node --test scripts/age-rejection.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const js = ts.transpileModule(read('utils/ageRejection.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', js)(mod, mod.exports);
const { isAgeRejectionActive, parseAgeRejection, AGE_REJECTION_TTL_MS } = mod.exports;

const T0 = 1_800_000_000_000;

test('the block lasts 24 h: active just after, active at 23 h 59 min, over at 24 h', () => {
  assert.equal(isAgeRejectionActive(T0, T0), true);
  assert.equal(isAgeRejectionActive(T0, T0 + AGE_REJECTION_TTL_MS - 60_000), true);
  assert.equal(isAgeRejectionActive(T0, T0 + AGE_REJECTION_TTL_MS), false);
  assert.equal(isAgeRejectionActive(T0, T0 + 3 * AGE_REJECTION_TTL_MS), false);
});

test('nothing stored, garbage, or a time in the future (clock moved back) does not block', () => {
  assert.equal(isAgeRejectionActive(null, T0), false);
  assert.equal(isAgeRejectionActive(undefined, T0), false);
  assert.equal(isAgeRejectionActive(NaN, T0), false);
  assert.equal(isAgeRejectionActive(T0 + 1000, T0), false, 'a future timestamp is not trusted');
  assert.equal(parseAgeRejection(null), null);
  assert.equal(parseAgeRejection(''), null);
  assert.equal(parseAgeRejection('abc'), null);
  assert.equal(parseAgeRejection('-5'), null);
  assert.equal(parseAgeRejection(String(T0)), T0);
});

test('wiring: the three sign-up entries use the gate, step 1 re-checks on focus, step 2 and ConfirmAge record the rejection', () => {
  for (const f of ['WelcomeScreen', 'LoginScreen', 'LoginEmailScreen']) {
    const src = read(`screens/auth/${f}.tsx`);
    assert.match(src, /useRegistrationEntry\(\(\) => navigation\.navigate\('RegisterStep1'\)\)/, f);
    assert.doesNotMatch(src, /onPress=\{\(\) => navigation\.navigate\('RegisterStep1'\)\}/, `${f} no longer opens the form directly`);
  }
  assert.match(read('screens/auth/RegisterStep1Screen.tsx'), /useFocusEffect[\s\S]*hasActiveAgeRejection\(\)[\s\S]*navigation\.goBack\(\)/);
  const step2 = read('screens/auth/RegisterStep2Screen.tsx');
  assert.match(step2, /await recordAgeRejection\(\);[^\n]*\n\s+showAlert\(\n?\s*t\('register\.alerts\.ageTitle'\)/);
  assert.match(step2, /if \(await hasActiveAgeRejection\(\)\)/);
  assert.match(step2, /if \(ageResult === 'underage'\) \{\n\s+await recordAgeRejection\(\);/);
  assert.match(read('screens/auth/ConfirmAgeScreen.tsx'), /await recordAgeRejection\(\);[^\n]*\n\s+await deleteMyAccount\(\);/);
});

test('the dialog never states the requirement or the age (neutral text, es and en), and only a timestamp is stored', () => {
  for (const lang of ['en', 'es']) {
    const auth = JSON.parse(read(`i18n/locales/${lang}/auth.json`));
    const texts = [auth.register.alerts.ageMessage, auth.age.notEligibleMessage].join(' ');
    assert.doesNotMatch(texts, /\b(18|dieciocho|eighteen|años|years)\b/i, lang);
  }
  assert.doesNotMatch(read('services/ageRejection.ts'), /birth|dob/i);
  assert.match(read('services/ageRejection.ts'), /setItem\(AGE_REJECTION_KEY, String\(now\)\)/, 'the stored value is the timestamp');
});
