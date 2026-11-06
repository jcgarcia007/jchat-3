// Fase C — native build settings, checked on the OUTPUT of `expo config --type introspect` on a clean project (the local
// ios/ and android/ folders are an old prebuild and are NOT what EAS builds). Read-only: see scripts/introspect-clean.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { introspectClean } from './introspect-clean.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const require = createRequire(import.meta.url);
const cfg = introspectClean();
const plist = cfg.ios.infoPlist;
const perms = cfg.android.permissions;

test('C1 (B10-1): the only background mode is bluetooth-central, once; no media-playback foreground service', () => {
  assert.deepEqual(plist.UIBackgroundModes, ['bluetooth-central']);
  assert.ok(!perms.some((p) => /FOREGROUND_SERVICE/.test(p)), `foreground-service permissions left: ${perms.filter((p) => /FOREGROUND_SERVICE/.test(p))}`);
  assert.match(read('app.config.ts'), /enableBackgroundPlayback: false/);
  assert.match(read('app.config.ts'), /enableBackgroundRecording: false/);
});

test('C2 (B10-2): no NSBluetoothPeripheralUsageDescription (the Terminal plugin writes it unless a plugin deletes it after it)', () => {
  assert.equal(plist.NSBluetoothPeripheralUsageDescription, undefined);
  const src = read('app.config.ts');
  assert.ok(!/bluetoothPeripheralPermission/.test(src));
  // Order: the deleting plugin is registered BEFORE the Terminal plugin (Expo runs the later plugin's Info.plist mod first).
  assert.ok(src.indexOf("withoutBluetoothPeripheral'") > 0 && src.indexOf("withoutBluetoothPeripheral'") < src.indexOf("'@stripe/stripe-terminal-react-native'"));
});

test('C2 (B10-3): Face ID and local-network texts mention payments and network printers, es and en', () => {
  const FACE = { en: 'JChat uses Face ID to unlock the app and confirm payments.', es: 'JChat usa Face ID para desbloquear la app y confirmar pagos.' };
  const NET = {
    en: 'JChat uses the local network to connect to WiFi card readers and network printers at the venue.',
    es: 'JChat usa la red local para conectarse a lectores de tarjetas con WiFi y a impresoras de red del local.',
  };
  assert.equal(plist.NSFaceIDUsageDescription, FACE.en);
  assert.equal(plist.NSLocalNetworkUsageDescription, NET.en);
  for (const l of ['en', 'es']) {
    const ios = JSON.parse(read(`assets/locales/${l}.json`)).ios;
    assert.equal(ios.NSFaceIDUsageDescription, FACE[l], `${l} Face ID`);
    assert.equal(ios.NSLocalNetworkUsageDescription, NET[l], `${l} local network`);
    assert.equal(ios.NSBluetoothPeripheralUsageDescription, undefined, `${l} still has the peripheral key`);
  }
});

test('C2 (C-12): allowBackup is false; USE_FINGERPRINT and MODIFY_AUDIO_SETTINGS stay on purpose (real use, normal permissions)', () => {
  assert.equal(cfg.android.allowBackup, false);
  // USE_FINGERPRINT: androidx.biometric's FingerprintManager path on Android 8.0/8.1 (minSdk 26). MODIFY_AUDIO_SETTINGS: expo-audio's
  // setAudioModeAsync (used by VoiceBubble / VoiceRecorderBar) calls AudioManager.setMode / setSpeakerphoneOn. Both are normal permissions.
  assert.ok(perms.includes('android.permission.USE_FINGERPRINT'));
  assert.ok(perms.includes('android.permission.MODIFY_AUDIO_SETTINGS'));
  for (const p of ['READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE', 'READ_MEDIA_IMAGES', 'READ_MEDIA_VIDEO', 'ACCESS_BACKGROUND_LOCATION', 'SYSTEM_ALERT_WINDOW']) {
    assert.ok(cfg.android.blockedPermissions.some((b) => b.endsWith(p)), `${p} must stay blocked`);
  }
});

test('C3 (B7-2): the plugin adds fontScale and density to MainActivity configChanges, once, keeping the rest', () => {
  const plugin = require('../config-plugins/withAndroidFontScaleConfigChanges.js');
  const manifest = { manifest: { application: [{ activity: [
    { $: { 'android:name': '.MainActivity', 'android:configChanges': 'keyboard|keyboardHidden|orientation|screenSize|uiMode|locale' } },
    { $: { 'android:name': '.Other', 'android:configChanges': 'orientation' } },
  ] }] } };
  assert.equal(plugin.addFontScaleConfigChanges(manifest), true);
  const [main, other] = manifest.manifest.application[0].activity;
  assert.equal(main.$['android:configChanges'], 'keyboard|keyboardHidden|orientation|screenSize|uiMode|locale|fontScale|density');
  assert.equal(other.$['android:configChanges'], 'orientation');
  plugin.addFontScaleConfigChanges(manifest); // idempotent
  assert.equal(main.$['android:configChanges'].split('|').filter((t) => t === 'fontScale').length, 1);
  assert.equal(plugin.withTokens('fontScale|density'), 'fontScale|density');
  assert.equal(plugin.addFontScaleConfigChanges({ manifest: { application: [{ activity: [] }] } }), false);
  assert.match(read('app.config.ts'), /withAndroidFontScaleConfigChanges/);
});

test('C3 (B7-2): nothing caches the font scale at module level; the chat input reads it reactively', () => {
  const input = read('components/chat/ChatInput.tsx');
  assert.match(input, /useWindowDimensions\(\)\.fontScale/);
  assert.doesNotMatch(input, /PixelRatio\.getFontScale\(\)/);
});

// C4 (B10-4): the Stripe Terminal SDK (beta) is evaluated only when Work Mode is opened.
import { readdirSync, statSync } from 'node:fs';
function sourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(join(root, dir))) {
    const rel = `${dir}/${name}`;
    if (['node_modules', 'ios', 'android', 'scripts', 'web-stubs', 'dist', '.expo'].includes(name)) continue;
    if (statSync(join(root, rel)).isDirectory()) out.push(...sourceFiles(rel));
    else if (/\.(ts|tsx)$/.test(name)) out.push(rel);
  }
  return out;
}
const ALL = ['screens', 'components', 'hooks', 'navigation', 'services', 'contexts', 'utils', 'theme'].flatMap((d) => { try { return sourceFiles(d); } catch { return []; } }).concat(['App.tsx', 'index.ts']);

test('C4 (B10-4): PosNavigator is loaded with import() on native; no static import of it outside the POS tree', () => {
  const lazy = read('navigation/lazyScreens.tsx');
  assert.match(lazy, /lazyScreen\(\(\) => import\('\.\/PosNavigator'\)\)/);
  assert.doesNotMatch(lazy, /import PosNavigator/);
  for (const f of ALL) {
    if (f.startsWith('screens/settings/Pos') || f === 'navigation/PosNavigator.tsx') continue;
    const src = read(f);
    assert.doesNotMatch(src, /^import (?!type)[^;]*from ['"][^'"]*\/PosNavigator['"]/m, `${f}: static value import of PosNavigator`);
  }
});

test('C4 (B10-4): nothing imports @stripe/stripe-terminal-react-native except services/terminalSdk.ts (lazy require) and the web stub', () => {
  for (const f of ALL) {
    const src = read(f);
    const imports = src.match(/^import[^;]*from ['"]@stripe\/stripe-terminal-react-native['"]/m);
    assert.equal(imports, null, `${f}: static import of the Terminal SDK`);
  }
  assert.match(read('services/terminalSdk.ts'), /require\('@stripe\/stripe-terminal-react-native'\)/);
});

test('C4 (B10-4): only the POS tree and terminalSdk.ts import services/terminalSdk', () => {
  const allowed = new Set(['navigation/PosNavigator.tsx', 'hooks/usePosReader.ts', 'services/terminalSdk.ts']);
  for (const f of ALL) {
    if (allowed.has(f) || f.startsWith('screens/settings/Pos')) continue;
    assert.doesNotMatch(read(f), /from ['"][^'"]*\/terminalSdk['"]/, `${f} imports terminalSdk`);
  }
});

test('C5: the production iOS build is pinned to the EAS image for SDK 57 / Xcode 26.6 (iOS 26 SDK), never `latest` (Xcode 27)', () => {
  const eas = JSON.parse(read('eas.json'));
  assert.equal(eas.build.production.ios.image, 'macos-tahoe-26.5-xcode-26.6');
  assert.equal(eas.build.production.autoIncrement, true);
  assert.equal(eas.cli.appVersionSource, 'remote');
  assert.equal(cfg.version, '1.0.0'); // the build number is EAS's (remote + autoIncrement)
});
