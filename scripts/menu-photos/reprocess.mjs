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
 *   • the secret key comes from the environment or, if absent, from web/.env.local (SB_SECRET_KEY); it is never printed.
 *
 * FLAGS
 *   --only-referenced  process ONLY the photos some database column uses today (menu_items.photo_url / image_url,
 *                      menu_item_photos.url + storage_path, menu_categories.icon_url, businesses.logo_url / cover_url /
 *                      icon_url / gallery_urls / brand_kit). Same behaviour as --apply otherwise: NEW paths only, never
 *                      overwrites or deletes. The CSV gains a `referenced_by` column so the update can be reviewed per column.
 *   --report-orphans   write (nothing is deleted) a CSV of the bucket objects NO column references, and print their total
 *                      size. A referenced photo keeps its companions: <name>_thumb.webp, <name>_r.webp, <name>_r_thumb.webp.
 *   --csv <file>       override the CSV path (default: scripts/menu-photos/out/<kind>-<timestamp>.csv, ignored by git)
 *
 * USAGE (node ≥ 18; sharp and supabase-js are resolved from ../../web/node_modules, no new dependency)
 *   SUPABASE_URL=https://<ref>.supabase.co SB_SECRET_KEY=… node scripts/menu-photos/reprocess.mjs --dry-run
 *   … --dry-run --sample 20 --prefix <business_id>/
 *   … --apply --csv /path/out.csv --limit 200
 *   … --only-referenced --dry-run | --only-referenced --apply
 *   … --report-orphans
 *   node scripts/menu-photos/reprocess.mjs --local ./some/folder          # offline test on local image files
 */
import { createRequire } from 'node:module';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
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
const onlyReferenced = flag('only-referenced');
const reportOrphans = flag('report-orphans');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = fileURLToPath(new URL('./out/', import.meta.url));
const csvPath = opt('csv', path.join(outDir, `${onlyReferenced ? 'referenced' : 'reprocess'}-${stamp}.csv`));
const orphansPath = opt('csv', path.join(outDir, `orphans-${stamp}.csv`));

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
/** KEY=VALUE pairs of web/.env.local (values are never printed). Missing file → empty. */
async function readEnvLocal() {
  const out = {};
  try {
    const text = await readFile(fileURLToPath(new URL('../../web/.env.local', import.meta.url)), 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch {
    // no file: rely on the environment
  }
  return out;
}
const envLocal = await readEnvLocal();
const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? envLocal.SUPABASE_URL ?? envLocal.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SB_SECRET_KEY || envLocal.SB_SECRET_KEY;
if (!url || !key) {
  console.error('Set SB_SECRET_KEY (environment or web/.env.local) and SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), or use --local <dir>.');
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
      else files.push({ path: full, size: entry.metadata?.size ?? 0, updated: entry.updated_at ?? entry.created_at ?? '' });
    }
    if (data.length < 100) break;
  }
  return files;
}

const publicUrl = (p) => bucket.getPublicUrl(p).data.publicUrl;

// ── which objects does the database reference? (read-only) ───────────────────
/** [table, columns, kind] — kind 'text' (one URL / path), 'array' (text[]), 'json' (any URL inside a jsonb). */
const REFERENCE_COLUMNS = [
  ['menu_items', 'photo_url', 'text'],
  ['menu_items', 'image_url', 'text'],
  ['menu_item_photos', 'url', 'text'],
  ['menu_item_photos', 'storage_path', 'text'],
  ['menu_categories', 'icon_url', 'text'],
  ['businesses', 'logo_url', 'text'],
  ['businesses', 'cover_url', 'text'],
  ['businesses', 'icon_url', 'text'],
  ['businesses', 'gallery_urls', 'array'],
  ['businesses', 'brand_kit', 'json'],
];

/** Object path inside the bucket for a public URL (or a bare storage path); null when it is not ours. */
function pathOf(value) {
  if (typeof value !== 'string' || !value) return null;
  const marker = `/${BUCKET}/`;
  const i = value.indexOf(marker);
  if (i >= 0) {
    try {
      return decodeURIComponent(value.slice(i + marker.length).split('?')[0]);
    } catch {
      return value.slice(i + marker.length).split('?')[0];
    }
  }
  return /^https?:/i.test(value) ? null : value.replace(/^\/+/, '');
}

/** Map<path, Set<'table.column'>>. Pages through every table (PostgREST caps a page at 1000 rows). */
async function referencedPaths() {
  const refs = new Map();
  const add = (p, label) => {
    if (!p) return;
    if (!refs.has(p)) refs.set(p, new Set());
    refs.get(p).add(label);
  };
  for (const [table, column, kind] of REFERENCE_COLUMNS) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from(table).select(column).range(from, from + 999);
      if (error) {
        console.error(`WARN ${table}.${column}: ${error.message} — skipped (its photos would look unreferenced)`);
        break;
      }
      for (const row of data ?? []) {
        const v = row[column];
        const label = `${table}.${column}`;
        if (kind === 'text') add(pathOf(v), label);
        else if (kind === 'array') for (const item of v ?? []) add(pathOf(item), label);
        else if (v) for (const m of JSON.stringify(v).match(/https?:[^"\\]+/g) ?? []) add(pathOf(m), label);
      }
      if (!data || data.length < 1000) break;
    }
  }
  return refs;
}

const withExt = (p, suffix) => p.replace(/\.[^./]+$/, suffix);
/** A referenced path plus the files that belong to it (thumb, reprocessed copy and its thumb). */
function companionsOf(p) {
  const r = withExt(p, '_r.webp');
  const thumbOf = (x) => withExt(x, '_thumb.webp');
  return [p, thumbOf(p), r, thumbOf(r)];
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
let everything = null; // listing of the whole bucket, shared by the modes that need it
const listing = async () => (everything ??= await listAll(prefix.replace(/\/$/, '')));

if (reportOrphans) {
  const refs = await referencedPaths();
  const keep = new Set([...refs.keys()].flatMap(companionsOf));
  const objects = (await listing());
  const orphans = objects.filter((f) => !keep.has(f.path));
  const bytes = orphans.reduce((sum, f) => sum + f.size, 0);
  await mkdir(path.dirname(orphansPath), { recursive: true });
  await writeFile(orphansPath, ['path,url,bytes,updated_at', ...orphans.map((f) => [csvCell(f.path), csvCell(publicUrl(f.path)), f.size, csvCell(f.updated)].join(','))].join('\n') + '\n');
  const missing = [...refs.keys()].filter((p) => !objects.some((o) => o.path === p)).length;
  console.log(`${objects.length} objects in the bucket, ${refs.size} referenced paths (${missing} referenced but not in the bucket).`);
  console.log(`ORPHANS: ${orphans.length} objects, ${mb(bytes)}. CSV: ${orphansPath}. Nothing was deleted.`);
  process.exit(0);
}

let referencedBy = new Map();
let all = (await listing()).filter((f) => needsWork(f.path));
if (onlyReferenced) {
  referencedBy = await referencedPaths();
  all = all.filter((f) => referencedBy.has(f.path));
  console.log(`--only-referenced: ${referencedBy.size} distinct paths referenced by the database.`);
}
all = all.slice(0, limit);
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

const rows = [onlyReferenced ? 'old_url,new_url,thumb_url,old_bytes,new_bytes,referenced_by' : 'old_url,new_url,thumb_url,old_bytes,new_bytes'];
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
    const cells = [publicUrl(f.path), publicUrl(newFull), publicUrl(newThumb), buf.length, full.length];
    if (onlyReferenced) cells.push(csvCell([...(referencedBy.get(f.path) ?? [])].join(' ')));
    rows.push(cells.join(','));
    done += 1;
    console.log(`ok  ${f.path} → ${newFull}`);
  } catch (error) {
    console.error(`ERR ${f.path}: ${error.message ?? error}`);
  }
}
await mkdir(path.dirname(csvPath), { recursive: true });
await writeFile(csvPath, rows.join('\n') + '\n');
console.log(`${done}/${all.length} written. CSV: ${csvPath}. The database was not touched.`);
