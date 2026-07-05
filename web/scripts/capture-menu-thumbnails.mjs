// ─────────────────────────────────────────────────────────────────────────────
// Menu template thumbnail generator
//
// Captures a phone-viewport screenshot of each PORTED menu template and writes a
// downscaled vertical thumbnail (300×649, phone ratio) to
// public/menu-templates/<slug>.png. These feed the template selector in the
// dashboard, so the thumbnail = exactly what the customer receives.
//
// Requirements:
//   - Dev server running at http://localhost:3000  (cd web && npm run dev)
//   - A test business with menu_mode='web' and published items (default:
//     bar-xzx-omd2). Override with CAPTURE_BIZ / CAPTURE_BASE env vars.
//   - Dev deps: playwright (+ chromium) and sharp.
//
// Run:
//   cd web && node scripts/capture-menu-thumbnails.mjs            # all ported slugs
//   cd web && node scripts/capture-menu-thumbnails.mjs left-drawer  # a subset
//
// How it forces each template: the ?preview_template=<slug> override on
// /m/[slug] renders any template on the same business WITHOUT changing its saved
// menu_template_id (no DB writes).
//
// Adding a newly-ported template: add its slug to SLUGS below. If the template
// has a defining open/active state (a drawer, a sheet, an expanded panel), add a
// PRE_CAPTURE entry that opens it so the thumbnail shows the distinctive feature.
// Non-ported templates get NO image — the selector shows a "Próximamente"
// placeholder for those.
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from "playwright";
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.CAPTURE_BASE ?? "http://localhost:3000";
const TEST_SLUG = process.env.CAPTURE_BIZ ?? "bar-xzx-omd2";
const OUT_DIR = path.resolve("public/menu-templates");

// Ported templates only (others show a "Próximamente" placeholder in the selector).
const SLUGS = process.argv.slice(2).length ? process.argv.slice(2) : ["classic", "left-drawer"];

// Per-slug action run right before the screenshot, so the thumbnail captures the
// template's defining state (e.g. an open drawer). Slugs without an entry are
// captured as-is. Keep selectors in sync with the template components.
const PRE_CAPTURE = {
  "left-drawer": async (page) => {
    await page.click('[aria-label="Abrir categorías"]');
    await page.waitForTimeout(450); // let the slide-in settle
  },
};

const VIEWPORT = { width: 390, height: 844 };
const THUMB_WIDTH = 300; // phone ratio preserved → height ≈ 300 * 844/390 ≈ 649

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
});
const page = await context.newPage();

await mkdir(OUT_DIR, { recursive: true });

for (const slug of SLUGS) {
  const url = `${BASE}/m/${TEST_SLUG}?preview_template=${slug}`;
  console.log(`→ ${slug}: ${url}`);
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  // Give images/fonts a beat to settle.
  await page.waitForTimeout(1200);

  // Open/activate the template's defining state, if any.
  if (PRE_CAPTURE[slug]) {
    await PRE_CAPTURE[slug](page);
  }

  const shot = await page.screenshot({ type: "png" }); // 780×1688 (viewport @2x)
  const outPath = path.join(OUT_DIR, `${slug}.png`);
  await sharp(shot).resize({ width: THUMB_WIDTH }).png({ quality: 90 }).toFile(outPath);

  const meta = await sharp(outPath).metadata();
  console.log(`  ✓ ${outPath}  ${meta.width}×${meta.height}`);
}

await browser.close();
console.log("done");
