#!/usr/bin/env node
/**
 * Re-encodes the photos already stored in the `menu-photos` bucket into the new two-size layout:
 *   full  — webp, longest side ≤ 1280 px, q80       → <name>_r.webp
 *   thumb — webp, longest side ≤  400 px, q75       → <name>_r_thumb.webp   (convention: .webp → _thumb.webp)
 *
 * SAFE BY CONSTRUCTION
 *   • default is --dry-run: it only lists objects and estimates the saving (it downloads a sample to measure the
 *     real compression ratio); nothing is written anywhere.
 *   • --apply writes NEW paths only (upsert:false, never overwrites an object) and writes a CSV with
 *     old_url,new_url,thumb_url,old_bytes,new_bytes. It NEVER touches the database: pointing menu_item_photos /
 *     menu_items.photo_url at the new URLs is a separate, reviewed step done from that CSV.
 *   • the service key is read from the environment only and is never printed.
 *
 * USAGE (node ≥ 18; sharp and supabase-js are resolved from ../../web/node_modules, no new dependency)
 *   SUPABASE_URL=https://<ref>.supabase.co SB_SECRET_KEY=… node scripts/menu-photos/reprocess.mjs --dry-run
 *   … --dry-run --sample 20 --prefix <business_id>/
 *   … --apply --csv /path/out.csv --limit 200
 *   node scripts/menu-photos/reprocess.mjs --local ./some/folder          # offline test on local image files
 */
import { createRequire } from 'node:module';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(new URL('../../web/package.json', import.meta.url));
const sharp = require('sharp');

const FULL_MAX = 1280;
const THUMB_MAX = 400;
const BUCKET = 'menu-photos';
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const apply = flag('apply');
const localDir = opt('local', null);
const prefix = opt('prefix', '');
const limit = Number(opt('limit', '0')) || Infinity;
const sampleSize = Number(opt('sample', '10'));
const csvPath = opt('csv', 'menu-photos-reprocess.csv');

const mb = (bytes) => `${(bytes / 1048576).toFixed(2)} MB`;

/** Returns { full, thumb } webp buffers for an image buffer (EXIF orientation applied, never upscaled). */
async function variantsOf(input) {
  const base = sharp(input, { failOn: 'none' }).rotate();
  const full = await base.clone().resize({ width: FULL_MAX, height: FULL_MAX, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  const thumb = await base.clone().resize({ width: THUMB_MAX, height: THUMB_MAX, fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
  return { full, thumb };
}

/** Objects that still need the new layout: not a thumb, not already a reprocessed file. */
const needsWork = (name) => IMAGE_EXT.test(name) && !/_thumb\.webp$/i.test(name) && !/_r\.webp$/i.test(name);

// ── offline mode ────────────────────────────────────────────────────────────
if (localDir) {
  const names = (await readdir(localDir)).filter((n) => IMAGE_EXT.test(n)).slice(0, limit);
  let before = 0;
  let after = 0;
  for (const name of names) {
    const buf = await readFile(path.join(localDir, name));
    const { full, thumb } = await variantsOf(buf);
    before += buf.length;
    after += full.length;
    console.log(`${name}: ${mb(buf.length)} → full ${mb(full.length)} + thumb ${mb(thumb.length)}`);
  }
  console.log(`TOTAL ${names.length} files: ${mb(before)} → ${mb(after)} (thumbs extra)`);
  process.exit(0);
}

// ── bucket mode ─────────────────────────────────────────────────────────────
const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.SB_SECRET_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SB_SECRET_KEY in the environment (or use --local <dir>).');
  process.exit(2);
}
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(url, key, { auth: { persistSession: false } });
const bucket = supabase.storage.from(BUCKET);

/** Recursive listing: folders have no id; files carry metadata.size. */
async function listAll(dir) {
  const files = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await bucket.list(dir, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const entry of data) {
      const full = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.id === null) files.push(...(await listAll(full)));
      else files.push({ path: full, size: entry.metadata?.size ?? 0 });
    }
    if (data.length < 100) break;
  }
  return files;
}

const publicUrl = (p) => bucket.getPublicUrl(p).data.publicUrl;
const all = (await listAll(prefix.replace(/\/$/, ''))).filter((f) => needsWork(f.path)).slice(0, limit);
const totalBytes = all.reduce((sum, f) => sum + f.size, 0);
console.log(`${all.length} photos to process, ${mb(totalBytes)} today.`);

async function download(p) {
  const { data, error } = await bucket.download(p);
  if (error) throw error;
  return Buffer.from(await data.arrayBuffer());
}

if (!apply) {
  // Dry run: measure the real ratio on a sample, then extrapolate per original size.
  const sample = all.slice(0, sampleSize);
  let sampleBefore = 0;
  let sampleAfter = 0;
  for (const f of sample) {
    const buf = await download(f.path);
    const { full } = await variantsOf(buf);
    sampleBefore += buf.length;
    sampleAfter += full.length;
    console.log(`  ${f.path}: ${mb(buf.length)} → ${mb(full.length)}`);
  }
  const ratio = sampleBefore > 0 ? sampleAfter / sampleBefore : 1;
  const estimate = totalBytes * ratio;
  console.log(`DRY RUN — sample of ${sample.length}: ${mb(sampleBefore)} → ${mb(sampleAfter)} (ratio ${(ratio * 100).toFixed(1)} %).`);
  console.log(`Estimated for all: ${mb(totalBytes)} → ${mb(estimate)} (saves ${mb(totalBytes - estimate)}), plus ~${mb(all.length * 15 * 1024)} of thumbs.`);
  console.log('Nothing was written. Re-run with --apply to write NEW paths and the CSV.');
  process.exit(0);
}

const rows = ['old_url,new_url,thumb_url,old_bytes,new_bytes'];
let done = 0;
for (const f of all) {
  const newFull = f.path.replace(/\.[^./]+$/, '_r.webp');
  const newThumb = newFull.replace(/\.webp$/, '_thumb.webp');
  try {
    const buf = await download(f.path);
    const { full, thumb } = await variantsOf(buf);
    const up1 = await bucket.upload(newFull, full, { contentType: 'image/webp', upsert: false });
    if (up1.error) throw up1.error;
    const up2 = await bucket.upload(newThumb, thumb, { contentType: 'image/webp', upsert: false });
    if (up2.error) throw up2.error;
    rows.push([publicUrl(f.path), publicUrl(newFull), publicUrl(newThumb), buf.length, full.length].join(','));
    done += 1;
    console.log(`ok  ${f.path} → ${newFull}`);
  } catch (error) {
    console.error(`ERR ${f.path}: ${error.message ?? error}`);
  }
}
await writeFile(csvPath, rows.join('\n') + '\n');
console.log(`${done}/${all.length} written. CSV: ${csvPath}. The database was not touched.`);
