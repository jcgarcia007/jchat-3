// Read-only introspection of the Expo config on a CLEAN project: the local ios/ and android/ folders are an old prebuild
// (git-ignored) and `expo config --type introspect` would merge them into the result; EAS builds without them. This copies
// only what the config needs into a temp dir (stub Firebase files, node_modules linked) and runs the introspection there.
// Nothing is written to the repo, nothing is prebuilt. Usage: node scripts/introspect-clean.mjs > introspect.json
import { cpSync, existsSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function introspectClean() {
  const dir = mkdtempSync(join(tmpdir(), 'jchat-introspect-'));
  try {
    for (const f of ['app.config.ts', 'package.json', 'tsconfig.json']) if (existsSync(join(root, f))) cpSync(join(root, f), join(dir, f));
    for (const d of ['config-plugins', 'assets']) cpSync(join(root, d), join(dir, d), { recursive: true });
    symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'));
    writeFileSync(join(dir, 'google-services.json'), '{"project_info":{"project_number":"0","project_id":"stub"},"client":[],"configuration_version":"1"}');
    writeFileSync(join(dir, 'GoogleService-Info.plist'), '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CLIENT_ID</key><string>stub</string><key>REVERSED_CLIENT_ID</key><string>stub</string></dict></plist>');
    const r = spawnSync('npx', ['expo', 'config', '--type', 'introspect', '--json'], { cwd: dir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, CI: '1' } });
    if (r.status !== 0) throw new Error(`expo config failed: ${r.stderr?.slice(0, 400)}`);
    return JSON.parse(r.stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.stdout.write(JSON.stringify(introspectClean(), null, 2));
