/**
 * One-time migration: external menu item photos → Supabase menu-photos bucket
 * Business: Bar XZX (0478b8d5-5217-4369-9fa2-128dbe5b38f8)
 *
 * Run from web/ directory:
 *   node scripts/migrate-menu-photos.mjs
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local
 * DO NOT COMMIT WITH KEY VALUES HARDCODED.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Read .env.local ───────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = resolve(__dirname, "../.env.local");
  const lines = readFileSync(envPath, "utf8").split("\n");
  const env = {};
  for (const line of lines) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const BUSINESS_ID = "0478b8d5-5217-4369-9fa2-128dbe5b38f8";
const BUCKET = "menu-photos";

// ── Helpers ───────────────────────────────────────────────────────────────────
function extFromContentType(ct) {
  if (!ct) return "jpg";
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  if (ct.includes("avif")) return "avif";
  return "jpg";
}

function extFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const m = pathname.match(/\.(png|jpg|jpeg|webp|gif|avif)(\?|$)/i);
    return m ? m[1].toLowerCase().replace("jpeg", "jpg") : null;
  } catch {
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log("🔍  Querying external menu item photos for Bar XZX…\n");

const { data: items, error: qErr } = await supabase
  .from("menu_items")
  .select("id, name, photo_url")
  .eq("business_id", BUSINESS_ID)
  .not("photo_url", "is", null)
  .not("photo_url", "like", "%supabase%");

if (qErr) {
  console.error("❌  Query failed:", qErr.message);
  process.exit(1);
}

console.log(`Found ${items.length} items with external photo_url:\n`);
for (const it of items) {
  console.log(`  • ${it.name.padEnd(32)} ${it.photo_url}`);
}
console.log();

const results = { ok: [], failed: [] };

for (const item of items) {
  const label = `[${item.name}]`;
  try {
    // 1. Download
    const resp = await fetch(item.photo_url, {
      signal: AbortSignal.timeout(15_000),
      headers: { "User-Agent": "JChat-migration/1.0" },
    });
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
    }
    const contentType = resp.headers.get("content-type") ?? "";
    const ext = extFromUrl(item.photo_url) ?? extFromContentType(contentType);
    const mime = contentType.split(";")[0].trim() || `image/${ext}`;

    const arrayBuf = await resp.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuf);

    // 2. Upload — path mirrors the real-upload pattern: {bizId}/{itemId}/{uuid}.{ext}
    const storagePath = `${BUSINESS_ID}/migrated/${item.id}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, uint8, { contentType: mime, upsert: true });
    if (upErr) throw new Error(`Upload: ${upErr.message}`);

    // 3. Get public URL
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
    const publicUrl = pub.publicUrl;

    // 4. Update menu_items.photo_url
    const { error: updErr } = await supabase
      .from("menu_items")
      .update({ photo_url: publicUrl })
      .eq("id", item.id);
    if (updErr) throw new Error(`UPDATE menu_items: ${updErr.message}`);

    // 5. Sync menu_item_photos (upsert by storage_path to avoid duplicates on re-run)
    const { error: photoErr } = await supabase
      .from("menu_item_photos")
      .upsert(
        {
          menu_item_id: item.id,
          business_id: BUSINESS_ID,
          url: publicUrl,
          storage_path: storagePath,
          sort: 0,
        },
        { onConflict: "storage_path" }
      );
    // Non-fatal if table/column doesn't exist yet
    if (photoErr && !photoErr.message.includes("does not exist")) {
      console.warn(`  ⚠️  ${label} menu_item_photos insert: ${photoErr.message}`);
    }

    console.log(`  ✅  ${label}`);
    console.log(`       ${item.photo_url.slice(0, 60)}…`);
    console.log(`    → ${publicUrl}`);
    results.ok.push({ name: item.name, url: publicUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ❌  ${label}: ${msg}`);
    results.failed.push({ name: item.name, url: item.photo_url, reason: msg });
  }
  console.log();
}

// ── Verification query ────────────────────────────────────────────────────────
console.log("🔎  Verification query…");
const { data: counts, error: cErr } = await supabase
  .from("menu_items")
  .select("id, name, photo_url")
  .eq("business_id", BUSINESS_ID);

if (!cErr && counts) {
  const inBucket = counts.filter((r) => r.photo_url?.includes("supabase")).length;
  const external = counts.filter(
    (r) => r.photo_url && !r.photo_url.includes("supabase")
  ).length;
  const noPhoto = counts.filter((r) => !r.photo_url).length;
  console.log(`  Total items : ${counts.length}`);
  console.log(`  In bucket   : ${inBucket} ✅`);
  console.log(`  Still ext.  : ${external} ${external > 0 ? "⚠️" : ""}`);
  console.log(`  No photo    : ${noPhoto}`);
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(60)}`);
console.log(`MIGRACIÓN COMPLETA — ${results.ok.length} OK, ${results.failed.length} fallidos`);
if (results.failed.length > 0) {
  console.log("\nFallidos:");
  for (const f of results.failed) {
    console.log(`  ✗ ${f.name}: ${f.reason}`);
    console.log(`    URL: ${f.url}`);
  }
}
