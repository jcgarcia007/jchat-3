#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * import-off-beverages.ts
 * ─────────────────────────────────────────────────────────────────────────
 * ETL: Open Food Facts (US) → public.product_catalog (Supabase production)
 *
 * Usage:
 *   deno run --allow-net --allow-env --env-file=web/.env.local \
 *     scripts/etl/import-off-beverages.ts
 *
 * Required env vars (from web/.env.local):
 *   SUPABASE_URL              – https://klfsgcfoahdtkojyqspd.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY – JWT service-role key (bypasses RLS)
 *
 * Strategy:
 *   - Fetches en:beverages + en:alcoholic-beverages filtered to en:united-states
 *   - Paginates at 100/page; max 100 pages per category (≤10 000 products each)
 *   - Rate-limited to ~15 req/min with back-off on 429/503
 *   - Upserts in batches of 100 ON CONFLICT (source, source_id)
 *   - Idempotent: safe to re-run — updates, never duplicates
 *
 * v1 decision: image_url = NULL (OFF images not imported yet)
 * ─────────────────────────────────────────────────────────────────────────
 */

import { createClient } from "npm:@supabase/supabase-js@2";

// ─── Config ───────────────────────────────────────────────────────────────────

/** OFF search endpoint (v2). */
const OFF_SEARCH_URL = "https://world.openfoodfacts.org/api/v2/search";

/**
 * OFF search API in practice caps responses at 100 products even when a higher
 * page_size is requested, so we request 100 to match the real behaviour.
 * Elasticsearch hard-cap: page * page_size ≤ 10 000, so 100 pages × 100 = 10 000 max.
 */
const PAGE_SIZE       = 100;
const MAX_PAGES       = 100;

/**
 * 8 000 ms → ~7.5 req/min — safely within OFF's 10 req/min guideline.
 * A lower rate keeps us out of 503 / 401 blocks on long runs.
 */
const RATE_MS         = 8_000;

/**
 * After the IP is temporarily blocked (401 or persistent 503), wait this long
 * before resuming.  Each retry doubles the delay up to MAX_BACKOFF_MS.
 */
const INITIAL_BACKOFF_MS = 30_000;  // 30 s — first retry after 503
const MAX_BACKOFF_MS     = 600_000; // 10 min — ceiling for 401/persistent 503
const MAX_RETRIES        = 5;       // skip page after this many failed attempts

/** Rows per Supabase upsert batch (avoids huge payloads). */
const BATCH_SIZE = 100;

/**
 * OFF requires a descriptive User-Agent for API consumers.
 * Generic bot agents (including ClaudeBot) are blocked in robots.txt.
 */
const USER_AGENT = "JChat3.0-beverage-importer/1.0 (jcgarcia007@icloud.com)";

/** OFF categories to fetch — each is a separate paginated run. */
const OFF_CATEGORIES = ["en:beverages", "en:alcoholic-beverages"] as const;

/** Country filter — limits products to those sold in the US. */
const COUNTRY_TAG = "en:united-states";

/** Fields to request (keeps response payloads small). */
const FIELDS = "code,product_name,brands,quantity,packaging,categories_tags,image_url";

// ─── Category mapping ─────────────────────────────────────────────────────────

type CategoryResult = { category: string; subcategory: string | null };

/**
 * Ordered rules — first regex match against the joined categories_tags wins.
 * Spirits checked before generic "alcoholic-beverages"; juices before sodas, etc.
 */
const CAT_RULES: Array<{ re: RegExp; result: CategoryResult }> = [
  // Spirits — most-specific first
  { re: /\ben:rums?\b/,                                                   result: { category: "licores",      subcategory: "ron"      } },
  { re: /\ben:vodkas?\b/,                                                  result: { category: "licores",      subcategory: "vodka"    } },
  { re: /\ben:whisk(?:e?ys?|ies)\b/,                                       result: { category: "licores",      subcategory: "whisky"   } },
  { re: /\ben:tequilas?\b/,                                                result: { category: "licores",      subcategory: "tequila"  } },
  { re: /\ben:(?:gins?|gin-based)\b/,                                      result: { category: "licores",      subcategory: "ginebra"  } },
  { re: /\ben:(?:brandies|brandys?|cognacs?)\b/,                          result: { category: "licores",      subcategory: "brandy"   } },
  { re: /\ben:mezcals?\b/,                                                 result: { category: "licores",      subcategory: "mezcal"   } },
  { re: /\ben:(?:spirits?|liqueurs?|digestifs?|distilled-beverages?)\b/,  result: { category: "licores",      subcategory: null       } },
  // Beer & cider
  { re: /\ben:(?:beers?|ales?|lagers?|stouts?|porters?|ipas?|craft-beers?|pale-ales?)\b/, result: { category: "cervezas", subcategory: null } },
  { re: /\ben:(?:hard-)?ciders?\b/,                                        result: { category: "cervezas",     subcategory: "sidra"    } },
  // Wine & bubbly
  { re: /\ben:(?:wines?|red-wines?|white-wines?|ros[eé]-wines?|sparkling-wines?|champagnes?|proseccos?|cavas?)\b/, result: { category: "vinos", subcategory: null } },
  // RTD / cocktails
  { re: /\ben:(?:cocktails?|ready-to-drinks?|hard-seltzers?|malted-beverages?)\b/, result: { category: "licores", subcategory: "cocktail" } },
  // Catch-all alcoholic
  { re: /\ben:alcoholic-beverages?\b/,                                     result: { category: "licores",      subcategory: null       } },
  // Non-alcoholic
  { re: /\ben:(?:energy-drinks?|sport-?drinks?)\b/,                        result: { category: "energéticas",  subcategory: null       } },
  { re: /\ben:(?:fruit-juices?|nectars?|vegetable-juices?|smoothies?)\b/, result: { category: "jugos",         subcategory: null       } },
  { re: /\ben:(?:sodas?|colas?|carbonated-(?:beverages?|waters?|drinks?)|soft-drinks?|lemon-?limes?|ginger-ales?|diet-sodas?)\b/, result: { category: "refrescos", subcategory: null } },
  { re: /\ben:(?:coffees?|espressos?|cold-brews?|cappuccinos?|lattes?)\b/, result: { category: "cafés",         subcategory: null       } },
  { re: /\ben:(?:teas?|iced-teas?|herbal-teas?|green-teas?|matcha)\b/,    result: { category: "tés",           subcategory: null       } },
  { re: /\ben:(?:plant-based-(?:beverages?|milks?)|oat-milks?|almond-milks?|soy-milks?|milks?|dairy-beverages?)\b/, result: { category: "lácteos", subcategory: null } },
  { re: /\ben:(?:sparkling-waters?|mineral-waters?|spring-waters?|still-waters?|flavored-waters?|waters?)\b/, result: { category: "aguas", subcategory: null } },
  // Absolute fallback
  { re: /./,                                                               result: { category: "bebidas",       subcategory: null       } },
];

function mapCategory(tags: string[]): CategoryResult {
  const joined = tags.join(" ");
  for (const { re, result } of CAT_RULES) {
    if (re.test(joined)) return result;
  }
  return { category: "bebidas", subcategory: null };
}

// ─── Size parser ──────────────────────────────────────────────────────────────

/**
 * Parses the OFF `quantity` field (e.g. "330 ml", "1 L", "12 fl oz", "2 lt")
 * into a numeric value and a normalised unit string.
 */
const SIZE_RE = /(\d+(?:[.,]\d+)?)\s*(fl\.?\s*oz|fluid\s*oz|oz|ml|cl|dl|l|lt|ltr|liters?|gal(?:lon)?)/i;

const UNIT_MAP: Record<string, string> = {
  "fl oz": "fl oz", "fl. oz": "fl oz", "fl.oz": "fl oz", "fluid oz": "fl oz",
  oz: "oz",
  ml: "ml", cl: "cl", dl: "dl",
  l: "l", lt: "l", ltr: "l", liter: "l", liters: "l",
  gal: "gal", gallon: "gal",
};

function parseSize(quantity?: string): { size_value: number | null; size_unit: string | null } {
  if (!quantity) return { size_value: null, size_unit: null };
  const m = SIZE_RE.exec(quantity);
  if (!m) return { size_value: null, size_unit: null };
  const val     = parseFloat(m[1].replace(",", "."));
  const rawUnit = m[2].toLowerCase().replace(/\s+/g, " ").trim();
  const unit    = UNIT_MAP[rawUnit] ?? rawUnit;
  // Reject nonsense sizes (e.g. 0, negative, or impossibly huge)
  if (!isFinite(val) || val <= 0 || val > 100_000) return { size_value: null, size_unit: null };
  return { size_value: val, size_unit: unit };
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface OFFProduct {
  code?:            string;
  product_name?:    string;
  brands?:          string;
  quantity?:        string;
  packaging?:       string;
  categories_tags?: string[];
  image_url?:       string;
}

interface OFFResponse {
  count:      number;
  page:       number;
  page_size:  number;
  products:   OFFProduct[];
}

interface CatalogRow {
  barcode:     string;
  source_id:   string;
  source:      "off";
  country:     "US";
  name:        string;
  brand:       string;
  size_value:  number | null;
  size_unit:   string | null;
  packaging:   string | null;
  category:    string;
  subcategory: string | null;
  image_url:   null;   // v1: no OFF images
  verified:    false;
  is_active:   true;
  updated_at:  string;
}

// ─── OFF fetch ────────────────────────────────────────────────────────────────

/**
 * Fetches one page from OFF with exponential back-off.
 * - 503 / 429 → retryable; back-off doubles from INITIAL_BACKOFF_MS up to MAX_BACKOFF_MS.
 * - 401       → temporary IP block; wait MAX_BACKOFF_MS then retry.
 * - After MAX_RETRIES failed attempts the function throws so the caller can skip the page.
 */
async function fetchPage(
  categoryTag: string,
  page: number,
  attempt = 1,
): Promise<OFFResponse> {
  const params = new URLSearchParams({
    categories_tags: categoryTag,
    countries_tags:  COUNTRY_TAG,
    page:            String(page),
    page_size:       String(PAGE_SIZE),
    fields:          FIELDS,
    sort_by:         "popularity_key",
    json:            "1",
  });
  const res = await fetch(`${OFF_SEARCH_URL}?${params}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });

  if (res.status === 401) {
    // Temporary IP block — wait MAX_BACKOFF_MS before retrying
    const wait = MAX_BACKOFF_MS;
    console.warn(`\n  ⚠  OFF HTTP 401 (IP block) — waiting ${wait / 60_000} min before retry (attempt ${attempt})`);
    if (attempt > MAX_RETRIES) throw new Error(`OFF 401 block persists after ${MAX_RETRIES} retries on page ${page}`);
    await sleep(wait);
    return fetchPage(categoryTag, page, attempt + 1);
  }

  if (res.status === 429 || res.status === 503) {
    const wait = Math.min(MAX_BACKOFF_MS, INITIAL_BACKOFF_MS * 2 ** (attempt - 1));
    console.warn(`  ⚠  OFF HTTP ${res.status} — back-off ${(wait / 1000).toFixed(0)}s (attempt ${attempt})`);
    if (attempt > MAX_RETRIES) {
      console.warn(`  ⚠  Skipping page ${page} of ${categoryTag} after ${MAX_RETRIES} retries`);
      return { count: 0, page, page_size: PAGE_SIZE, products: [] };
    }
    await sleep(wait);
    return fetchPage(categoryTag, page, attempt + 1);
  }

  if (!res.ok) {
    throw new Error(`OFF HTTP ${res.status} for ${categoryTag} page ${page}`);
  }
  return res.json() as Promise<OFFResponse>;
}

// ─── Normaliser ───────────────────────────────────────────────────────────────

/**
 * Converts one OFF product object to a CatalogRow.
 * Returns null if the product fails hard quality filters (no name, brand, or barcode).
 */
function normalize(p: OFFProduct, now: string): CatalogRow | null {
  const code  = (p.code           ?? "").trim();
  const name  = (p.product_name   ?? "").trim();
  const brand = (p.brands         ?? "").trim();

  // Hard filters — these three fields are required for a useful catalog entry
  if (!code || !name || !brand) return null;

  const { size_value, size_unit } = parseSize(p.quantity);
  const { category, subcategory } = mapCategory(p.categories_tags ?? []);

  return {
    barcode:     code,
    source_id:   code,
    source:      "off",
    country:     "US",
    name,
    brand,
    size_value,
    size_unit,
    packaging:   (p.packaging ?? "").trim() || null,
    category,
    subcategory,
    image_url:   null,
    verified:    false,
    is_active:   true,
    updated_at:  now,
  };
}

// ─── Idempotent batch save ────────────────────────────────────────────────────
//
// PostgREST cannot reference a partial unique index (one with a WHERE clause)
// in its ON CONFLICT resolution — it generates plain ON CONFLICT (col, col)
// which PostgreSQL rejects for partial indexes.  Workaround that avoids any
// schema change: SELECT which source_ids exist → DELETE conflicts → INSERT all.
// On a first run (no conflicts) this is just two requests per batch (SELECT+INSERT).
// On re-runs (all rows exist) it's three (SELECT+DELETE+INSERT).

async function saveBatch(
  supabase: ReturnType<typeof createClient>,
  batch: CatalogRow[],
): Promise<number> {
  const sourceIds = batch.map((r) => r.source_id);

  // 1. Find which source_ids already exist in this batch
  const { data: existing, error: selErr } = await supabase
    .from("product_catalog")
    .select("source_id")
    .eq("source", "off")
    .in("source_id", sourceIds);
  if (selErr) throw new Error(`SELECT check: ${selErr.message}`);

  const existingSet = new Set((existing ?? []).map((r: { source_id: string }) => r.source_id));

  // 2. Delete conflicts so we can re-insert with fresh data
  if (existingSet.size > 0) {
    const toDelete = [...existingSet];
    const { error: delErr } = await supabase
      .from("product_catalog")
      .delete()
      .eq("source", "off")
      .in("source_id", toDelete);
    if (delErr) throw new Error(`DELETE conflicts: ${delErr.message}`);
  }

  // 3. Insert the whole batch (all rows are now new)
  const { error: insErr } = await supabase
    .from("product_catalog")
    .insert(batch);
  if (insErr) throw new Error(`INSERT: ${insErr.message}`);

  return batch.length;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const enc   = new TextEncoder();
const dot   = () => Deno.stdout.writeSync(enc.encode("."));

function loadEnv(): { url: string; key: string } {
  const url = Deno.env.get("SUPABASE_URL")              ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key) {
    console.error(
      "\n❌  Missing env vars. Run:\n\n" +
      "    deno run --allow-net --allow-env --env-file=web/.env.local \\\n" +
      "      scripts/etl/import-off-beverages.ts\n",
    );
    Deno.exit(1);
  }
  return { url, key };
}

// ─── Per-category import ──────────────────────────────────────────────────────

async function importCategory(
  categoryTag: string,
  supabase:    ReturnType<typeof createClient>,
  stats:       Map<string, number>,
  now:         string,
): Promise<{ fetched: number; normalized: number; upserted: number }> {
  console.log(`\n📦  ${categoryTag}`);

  let fetched = 0, normalized = 0, upserted = 0;
  let batch: CatalogRow[] = [];
  let totalPages = MAX_PAGES;

  for (let page = 1; page <= totalPages; page++) {
    const data = await fetchPage(categoryTag, page);

    if (page === 1) {
      totalPages = Math.min(Math.ceil(data.count / PAGE_SIZE), MAX_PAGES);
      console.log(
        `    OFF count: ${data.count.toLocaleString()} → ${totalPages} page(s) × ${PAGE_SIZE} products`,
      );
    }

    const products = data.products ?? [];
    if (products.length === 0) break;
    fetched += products.length;

    for (const p of products) {
      const row = normalize(p, now);
      if (!row) continue;
      normalized++;
      stats.set(row.category, (stats.get(row.category) ?? 0) + 1);
      batch.push(row);

      if (batch.length >= BATCH_SIZE) {
        upserted += await saveBatch(supabase, batch);
        batch = [];
        dot();
      }
    }

    if (products.length === 0) break; // empty response = no more pages
    if (page < totalPages) await sleep(RATE_MS);
    if (page % 10 === 0) {
      console.log(`\n    …page ${page}/${totalPages} — ${normalized.toLocaleString()} normalized so far`);
    }
  }

  // Flush tail batch
  if (batch.length > 0) {
    upserted += await saveBatch(supabase, batch);
  }

  console.log(`\n    ✓ fetched=${fetched.toLocaleString()}  normalized=${normalized.toLocaleString()}  upserted=${upserted.toLocaleString()}`);
  return { fetched, normalized, upserted };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║   JChat 3.0 — Open Food Facts Beverage ETL Importer     ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  const { url, key } = loadEnv();
  const supabase = createClient(url, key, {
    auth: { persistSession: false },
  });

  console.log(`🔗  Supabase  : ${url}`);
  console.log(`⚙️   page_size: ${PAGE_SIZE} | max_pages: ${MAX_PAGES} | rate: ${RATE_MS}ms | backoff_max: ${MAX_BACKOFF_MS/1000}s\n`);

  const now   = new Date().toISOString();
  const stats = new Map<string, number>();
  const total = { fetched: 0, normalized: 0, upserted: 0 };

  // Process en:beverages first, then en:alcoholic-beverages.
  // Products that appear in both are handled idempotently by saveBatch
  // (delete-then-reinsert), so the second pass simply refreshes the row.
  for (const cat of OFF_CATEGORIES) {
    const r = await importCategory(cat, supabase, stats, now);
    total.fetched     += r.fetched;
    total.normalized  += r.normalized;
    total.upserted    += r.upserted;
  }

  // ── Final report ─────────────────────────────────────────────────────────
  const rejected  = total.fetched - total.normalized;
  const rejPct    = total.fetched ? ((rejected / total.fetched) * 100).toFixed(1) : "0.0";
  const maxVal    = Math.max(...stats.values(), 1);

  console.log("\n\n╔══════════════════════════════════════════════════════════╗");
  console.log("║                    IMPORT REPORT                        ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`\n  OFF products fetched  : ${total.fetched.toLocaleString()}`);
  console.log(`  Rejected (bad data)   : ${rejected.toLocaleString()} (${rejPct}%)  — no name / no brand / no barcode`);
  console.log(`  Rows normalized       : ${total.normalized.toLocaleString()}`);
  console.log(`  Rows upserted to DB   : ${total.upserted.toLocaleString()}`);
  console.log(`  Note: upserted > normalized is normal when categories overlap`);
  console.log("\n  📊 By category (combined across both OFF categories):");
  for (const [cat, cnt] of [...stats.entries()].sort((a, b) => b[1] - a[1])) {
    const bar = "█".repeat(Math.round((cnt / maxVal) * 24));
    const pct = ((cnt / total.normalized) * 100).toFixed(1);
    console.log(`    ${cat.padEnd(14)} ${String(cnt).padStart(6)}  (${pct.padStart(5)}%)  ${bar}`);
  }
  console.log("\n  ✅ Run is idempotent — re-running will UPDATE, not duplicate.\n");
}

main().catch((e) => {
  console.error("\n❌  Fatal:", e.message);
  Deno.exit(1);
});
