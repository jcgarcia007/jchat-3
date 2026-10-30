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

function main() {
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
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
