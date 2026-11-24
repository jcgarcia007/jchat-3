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

test('C1 (B10-1): no background mode at all (bluetooth-central is gone with the POS hardware); no media-playback foreground service', () => {
  assert.equal(plist.UIBackgroundModes, undefined);
  assert.ok(!perms.some((p) => /FOREGROUND_SERVICE/.test(p)), `foreground-service permissions left: ${perms.filter((p) => /FOREGROUND_SERVICE/.test(p))}`);
  assert.match(read('app.config.ts'), /enableBackgroundPlayback: false/);
  assert.match(read('app.config.ts'), /enableBackgroundRecording: false/);
});

test('C2 (consumer build): no Bluetooth / local-network / accessory keys in the Info.plist, and none of the three POS hardware packages is linked', () => {
  for (const k of ['NSBluetoothPeripheralUsageDescription', 'NSBluetoothAlwaysUsageDescription', 'UISupportedExternalAccessoryProtocols']) {
    assert.equal(plist[k], undefined, `${k} is still in the Info.plist`);
  }
  // NSLocalNetworkUsageDescription: the only one left is expo-dev-launcher's own text (dev-client builds). Its "[Expo Dev Launcher] Strip Local Network Keys
  // for Release" build phase deletes it (and the _expo._tcp Bonjour service) from every non-Debug build, so the store binary has neither.
  assert.ok(plist.NSLocalNetworkUsageDescription === undefined || /Expo Dev Launcher/.test(plist.NSLocalNetworkUsageDescription), 'a non-dev-launcher local-network text is in the Info.plist');
  const src = read('app.config.ts');
  for (const gone of ['@stripe/stripe-terminal-react-native', 'withBluetoothClassicPermissions', 'withoutBluetoothPeripheral', 'bluetoothBackgroundMode']) {
    assert.ok(!src.includes(gone), `app.config.ts still mentions ${gone}`);
  }
  const exclude = JSON.parse(read('package.json')).expo?.autolinking?.exclude ?? [];
  for (const pkg of ['@stripe/stripe-terminal-react-native', 'react-native-bluetooth-classic', 'react-native-tcp-socket']) {
    assert.ok(exclude.includes(pkg), `${pkg} must be in expo.autolinking.exclude`);
  }
  // Their JS side resolves to the inert stubs on every platform (the package is not linked, so importing it for real would crash).
  const metro = read('metro.config.js');
  assert.match(metro, /const HARDWARE_STUBS = \{/);
  assert.match(read('constants/posHardware.ts'), /export const POS_HARDWARE_ENABLED = false;/);
  for (const perm of ['BLUETOOTH', 'BLUETOOTH_ADMIN', 'BLUETOOTH_SCAN', 'BLUETOOTH_CONNECT', 'NFC', 'READ_PHONE_STATE', 'HIDE_OVERLAY_WINDOWS', 'ACCESS_WIFI_STATE', 'CHANGE_NETWORK_STATE']) {
    assert.ok(!perms.some((p) => p.endsWith(`.${perm}`)), `${perm} declared by the app config`);
  }
});

test('C2 (B10-3): Face ID text mentions payments, es and en; no Bluetooth or local-network text in the locales; the location text no longer mentions card readers', () => {
  const FACE = { en: 'JChat uses Face ID to unlock the app and confirm payments.', es: 'JChat usa Face ID para desbloquear la app y confirmar pagos.' };
  assert.equal(plist.NSFaceIDUsageDescription, FACE.en);
  assert.doesNotMatch(plist.NSLocationWhenInUseUsageDescription, /card reader/i);
  for (const l of ['en', 'es']) {
    const ios = JSON.parse(read(`assets/locales/${l}.json`)).ios;
    assert.equal(ios.NSFaceIDUsageDescription, FACE[l], `${l} Face ID`);
    for (const k of ['NSBluetoothPeripheralUsageDescription', 'NSBluetoothAlwaysUsageDescription', 'NSLocalNetworkUsageDescription']) assert.equal(ios[k], undefined, `${l} still has ${k}`);
    assert.doesNotMatch(ios.NSLocationWhenInUseUsageDescription, /lector|reader/i, `${l} location text mentions readers`);
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
