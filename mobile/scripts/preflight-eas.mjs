// Before every `eas build`: the packages with native code in node_modules must be byte-identical to what the registry serves for the version in
// package-lock.json (EAS installs from the lockfile and recomputes the fingerprint there). A local build (Gradle, pod install, prebuild) leaves files
// inside node_modules (android/build, a stripped AndroidManifest `package`, HAVE_GOOGLE_MAPS 0...) and the build fails in "Configure expo-updates"
// with "Runtime version mismatch" (EAS build 11, 2026-10-29: masked-view and react-native-maps).
// Run from mobile/:  node scripts/preflight-eas.mjs   (NOT an npm script: package.json scripts are part of the EAS fingerprint, adding one changes the runtime version and breaks OTA compatibility with the installed build; reads only; downloads each tarball with `npm pack` into a mktemp folder; exit 1 on any difference)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Top-level lockfile entries that ship native code (an android/ or ios/ folder) and come from the registry. */
export function nativePackages(root) {
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')).packages ?? {};
  const out = [];
  for (const [key, entry] of Object.entries(lock)) {
    if (!key.startsWith('node_modules/') || key.indexOf('node_modules/', 'node_modules/'.length) > 0) continue;
    if (entry.link || !entry.resolved || !entry.version) continue;
    const dir = join(root, key);
    if (existsSync(join(dir, 'android')) || existsSync(join(dir, 'ios'))) out.push({ name: key.slice('node_modules/'.length), version: entry.version, dir });
  }
  return out;
}

function files(dir) {
  const found = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const path = join(d, name);
      if (statSync(path).isDirectory()) { if (name !== 'node_modules') walk(path); } else found.push(relative(dir, path));
    }
  };
  walk(dir);
  return found.sort();
}

/** Build output of a local Gradle/Xcode run: EXTRA files under any build/, .gradle/, .cxx/ or Pods/ folder. The fingerprint ignores them (28 packages with android/build or android/.cxx never showed up in EAS's diff), so it is only a warning. A file whose content differs or that is missing is never ignored. */
export const BUILD_OUTPUT = /^extra in node_modules: (?:.*\/)?(build|\.gradle|\.cxx|Pods)\//;

/** Differences between a pristine folder and an installed one: files only in one side, and files whose bytes differ. */
export function diffTrees(pristine, installed) {
  const a = new Set(files(pristine));
  const b = new Set(files(installed));
  const diffs = [];
  for (const f of a) if (!b.has(f)) diffs.push(`missing in node_modules: ${f}`);
  for (const f of b) if (!a.has(f)) diffs.push(`extra in node_modules: ${f}`);
  for (const f of a) if (b.has(f) && !readFileSync(join(pristine, f)).equals(readFileSync(join(installed, f)))) diffs.push(`content differs: ${f}`);
  return diffs;
}

/** Runtime versions (= `expo-updates fingerprint:generate`) of the builds that exist. An OTA only reaches a build whose runtime equals the one it was published for. */
export const RUNTIMES = {
  build11: { ios: '3760a588d7f43619b331660b4527b716db128d5a', android: '1237ce003f532b7083ac3b41a60c2d0cc4dabf35' }, // installed (build 11, 2026-10-29)
  // Fase C (native changes: no audio background mode, no peripheral key, new permission texts, allowBackup false, fontScale configChanges,
  // iOS image Xcode 26.6). Computed on fix/c-native-build; they MUST be the hashes in the EAS log of build 12 (recompute if app.config.ts,
  // config-plugins, eas.json or a native dependency changes before the build).
  build12: { ios: '04e88e9740e9a5811cc2e003033e99c0bdf0a25a', android: '6b8d88666a255a5cec8cfbbeb2e686fe0e7ea4a0' },
  // Build 13 (M3 reservations + expo-calendar + privacy manifest, 2026-11). runtimeVersion of each build as reported by EAS (build_info):
  //   iOS      build 14  EAS 1b50d7c9-aba9-47fa-970b-f4024a107dbf  commit e6250128
  //   Android  build 13  EAS ad07d0dc-4876-4bc3-9387-93e5b475007d  commit 46477515
  // (iOS build 13, EAS 5420c0e4, failed on InfoPlist.strings and does not count.) The next build gets its own entry, copied the same way from the EAS
  // log / build_info and checked with `npx expo-updates fingerprint:generate --platform ios|android` on the same commit.
  build13: { ios: 'dbdfeaeab820021354ccf7b8a061b3b962e3a04e', android: 'f7d420cd34d516f36a04ca63411df939d7f66e34' },
  // Build 15 (consumer build: no Stripe Terminal / Bluetooth Classic / TCP printers in the binary, expo-secure-store for the session; branch fix/l1-consumer-native).
  // Fill in with the runtimeVersion of the EAS log of the build (see the note of build 13); the fingerprints computed on the branch are in the report.
  build15: { ios: null, android: null },
};
// The build that OTAs may target. Build 15 changes the native graph (runtime), so it cannot receive OTAs from builds 13 / 14 nor give them any.
export const ACTIVE_RUNTIME = 'build15';

/** { ok, lines } comparing the current fingerprints with the runtime an OTA is allowed to target. */
export function compareRuntime(current, expected = RUNTIMES[ACTIVE_RUNTIME]) {
  const lines = [];
  let ok = true;
  for (const platform of ['ios', 'android']) {
    if (expected[platform] == null) {
      ok = false;
      lines.push(`… ${platform}: ${current[platform]} (hash of this build not filled in RUNTIMES yet: copy it from the EAS log of the build)`);
      continue;
    }
    const same = current[platform] === expected[platform];
    if (!same) ok = false;
    lines.push(`${same ? '✔' : '✖'} ${platform}: ${current[platform]}${same ? '' : ` (expected ${expected[platform]})`}`);
  }
  return { ok, lines };
}

function currentRuntimes(root) {
  const out = {};
  for (const platform of ['ios', 'android']) {
    out[platform] = JSON.parse(execFileSync('npx', ['expo-updates', 'fingerprint:generate', '--platform', platform], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).hash;
  }
  return out;
}

function main() {
  const forOta = process.argv.includes('--ota');
  const root = process.cwd();
  const work = mkdtempSync(join(tmpdir(), 'preflight-eas-'));
  const packages = nativePackages(root);
  console.log(`preflight:eas: ${packages.length} packages with native code, tarballs in ${work}`);
  let bad = 0;
  let ignored = 0;
  for (const { name, version, dir } of packages) {
    const installedVersion = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version;
    const problems = [];
    if (installedVersion !== version) problems.push(`version ${installedVersion} installed, ${version} in the lockfile`);
    else {
      const [{ filename }] = JSON.parse(execFileSync('npm', ['pack', `${name}@${version}`, '--json', '--pack-destination', work], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
      const target = join(work, `${name.replace(/\W+/g, '_')}-${version}`);
      execFileSync('mkdir', ['-p', target]);
      execFileSync('tar', ['-xzf', join(work, filename), '-C', target]);
      for (const d of diffTrees(join(target, 'package'), dir)) (BUILD_OUTPUT.test(d) ? (ignored++, []) : problems).push(d);
    }
    if (problems.length) {
      bad++;
      console.log(`✖ ${name}@${version}`);
      for (const p of problems.slice(0, 8)) console.log(`    ${p}`);
      if (problems.length > 8) console.log(`    … and ${problems.length - 8} more`);
    }
  }
  if (bad) {
    console.log(`\n${bad} package(s) differ from the registry. Reinstall them (move the folder away, npm ci or npm install <name>@<version>) and run this again before eas build.`);
    process.exit(1);
  }
  if (ignored) console.log(`(${ignored} extra build-output files from local Gradle runs (build/, .gradle/, .cxx/): ignored by the fingerprint, harmless)`);
  console.log('✔ all native packages are identical to the registry: safe to run eas build');
  // --ota: before `eas update`. The runtime of this code must be the one of the build that is installed (ACTIVE_RUNTIME); if it changed, something
  // native entered and an OTA must NOT be published. Without --ota (before `eas build`) the runtime is only printed.
  const current = currentRuntimes(root);
  const { ok, lines } = compareRuntime(current);
  console.log(`runtime (active: ${ACTIVE_RUNTIME}):`);
  for (const l of lines) console.log(`  ${l}`);
  if (!ok && forOta) {
    console.log('\n✖ the runtime changed: native code entered. DO NOT publish an OTA from here; it needs a new build.');
    process.exit(1);
  }
  if (!ok) console.log('  (differs from the active runtime: expected before a new build; `--ota` would fail)');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
