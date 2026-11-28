// Fase 6 — the help center content (web/content/help). Run from web/:  node --test lib/helpContent.test.mjs
// Both languages must be the same manual: same chapters, sections and blocks; no broken internal link; every image exists and has alt text.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CHAPTERS, HELP_UI, MANUAL_IDS, MANUAL_META, helpPaths, isChapterId, isManualId } from "../content/help/manuals.ts";
import { isAllowedHref, linkTargets, parseInline, stripInline } from "./helpInline.ts";

const WEB = fileURLToPath(new URL("..", import.meta.url));
const LOCALES = ["es", "en"];
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** Pages of the site a help text may link to (besides the help center itself). */
const SITE_PATHS = new Set(["/privacy", "/terms", "/safety", "/support", "/contact", "/account/delete", "/download", "/pricing", "/forgot-password"]);

async function chapterFile(locale, manual, slug) {
  const file = join(WEB, "content/help", locale, manual, `${slug}.ts`);
  assert.ok(existsSync(file), `missing ${locale}/${manual}/${slug}.ts`);
  return (await import(pathToFileURL(file).href)).default;
}

const data = {};
for (const locale of LOCALES) {
  data[locale] = {};
  for (const manual of MANUAL_IDS) {
    data[locale][manual] = {};
    for (const slug of CHAPTERS[manual]) data[locale][manual][slug] = await chapterFile(locale, manual, slug);
  }
}

function texts(chapter) {
  const out = [chapter.title, chapter.summary, chapter.goal];
  for (const s of chapter.sections) {
    out.push(s.title);
    for (const b of s.blocks) {
      if (b.type === "p" || b.type === "note") out.push(b.text);
      else if (b.type === "steps" || b.type === "list") out.push(...b.items);
      else if (b.type === "image") out.push(b.alt);
    }
  }
  return out;
}

test("the manuals, their chapters and the portada texts exist in both languages", () => {
  assert.deepEqual([...MANUAL_IDS], ["users", "business"]);
  for (const manual of MANUAL_IDS) {
    assert.ok(CHAPTERS[manual].length > 0);
    assert.equal(new Set(CHAPTERS[manual]).size, CHAPTERS[manual].length, `duplicated slug in ${manual}`);
    for (const slug of CHAPTERS[manual]) assert.match(slug, KEBAB);
    for (const locale of LOCALES) {
      assert.ok(MANUAL_META[locale][manual].title && MANUAL_META[locale][manual].description, `${locale} ${manual} meta`);
    }
  }
  assert.deepEqual(Object.keys(HELP_UI.es).sort(), Object.keys(HELP_UI.en).sort());
  assert.ok(isManualId("users") && !isManualId("other") && isChapterId("users", "safety") && !isChapterId("users", "nope"));
});

test("each chapter has its id, title, summary, goal and sections", () => {
  for (const locale of LOCALES)
    for (const manual of MANUAL_IDS)
      for (const slug of CHAPTERS[manual]) {
        const c = data[locale][manual][slug];
        const where = `${locale}/${manual}/${slug}`;
        assert.equal(c.id, slug, `${where} id`);
        for (const key of ["title", "summary", "goal"]) assert.ok(typeof c[key] === "string" && c[key].trim().length > 3, `${where} ${key}`);
        assert.ok(c.sections.length >= 1, `${where} sections`);
        const ids = c.sections.map((s) => s.id);
        assert.equal(new Set(ids).size, ids.length, `${where} duplicated section id`);
        for (const s of c.sections) {
          assert.match(s.id, KEBAB, `${where} section id ${s.id}`);
          assert.ok(s.title.trim() && s.blocks.length > 0, `${where}#${s.id} empty`);
          for (const b of s.blocks) {
            if (b.type === "steps" || b.type === "list") assert.ok(b.items.length > 0 && b.items.every((i) => i.trim()), `${where}#${s.id} empty item`);
          }
        }
      }
});

test("Spanish and English are the same manual: same sections and the same blocks, in the same order", () => {
  for (const manual of MANUAL_IDS)
    for (const slug of CHAPTERS[manual]) {
      const es = data.es[manual][slug];
      const en = data.en[manual][slug];
      const where = `${manual}/${slug}`;
      assert.deepEqual(es.sections.map((s) => s.id), en.sections.map((s) => s.id), `${where} section ids`);
      es.sections.forEach((s, i) => {
        const t = en.sections[i];
        assert.deepEqual(s.blocks.map((b) => b.type), t.blocks.map((b) => b.type), `${where}#${s.id} block types`);
        s.blocks.forEach((b, j) => {
          const o = t.blocks[j];
          if (b.type === "steps" || b.type === "list") assert.equal(b.items.length, o.items.length, `${where}#${s.id} block ${j} item count`);
          if (b.type === "note") assert.equal(b.kind, o.kind, `${where}#${s.id} note kind`);
          if (b.type === "image") {
            assert.equal(b.platform, o.platform, `${where}#${s.id} image platform`);
            assert.equal(b.width, o.width);
            assert.equal(b.height, o.height);
          }
        });
      });
    }
});

test("no internal link is broken (chapters, anchors and site pages)", () => {
  const known = new Set(helpPaths());
  for (const locale of LOCALES)
    for (const manual of MANUAL_IDS)
      for (const slug of CHAPTERS[manual])
        for (const text of texts(data[locale][manual][slug])) {
          for (const href of linkTargets(text)) {
            assert.ok(isAllowedHref(href), `${locale}/${manual}/${slug}: ${href} not allowed`);
            if (!href.startsWith("/")) continue;
            const [pathPart, anchor] = href.split("#");
            const path = pathPart.split("?")[0];
            assert.ok(known.has(path) || SITE_PATHS.has(path), `${locale}/${manual}/${slug}: broken link ${href}`);
            if (anchor && path.startsWith("/help/")) {
              const [, , m, c] = path.split("/");
              const target = c ? data[locale][m]?.[c] : null;
              assert.ok(target && target.sections.some((s) => s.id === anchor), `${locale}/${manual}/${slug}: anchor ${href} does not exist`);
            }
          }
        }
});

test("every image exists in public/, has alt text in its language and a size", () => {
  for (const locale of LOCALES)
    for (const manual of MANUAL_IDS)
      for (const slug of CHAPTERS[manual])
        for (const s of data[locale][manual][slug].sections)
          for (const b of s.blocks) {
            if (b.type !== "image") continue;
            const where = `${locale}/${manual}/${slug}: ${b.src}`;
            assert.ok(b.src.startsWith(`/help/${manual}/${slug}/`) && b.src.endsWith(`-${locale}.webp`), `${where} path`);
            assert.ok(existsSync(join(WEB, "public", b.src)), `${where} does not exist`);
            assert.ok(b.alt.trim().length > 5, `${where} alt`);
            assert.ok(["ios", "android", "web"].includes(b.platform), `${where} platform`);
            assert.ok(b.width > 0 && b.height > 0, `${where} size`);
          }
});

test("the texts keep to the rules of the help center", () => {
  const banned = [/modo de prueba/i, /test mode/i, /supabase/i, /\bmigraci[oó]n/i, /\bmigration\b/i, /\bgetMenu\b/, /offercards?/i, /\bRLS\b/];
  for (const locale of LOCALES)
    for (const manual of MANUAL_IDS)
      for (const slug of CHAPTERS[manual])
        for (const text of texts(data[locale][manual][slug])) {
          for (const re of banned) assert.ok(!re.test(text), `${locale}/${manual}/${slug}: forbidden wording ${re} in "${text.slice(0, 60)}"`);
          assert.ok((text.match(/\*\*/g) ?? []).length % 2 === 0, `${locale}/${manual}/${slug}: unbalanced ** in "${text.slice(0, 60)}"`);
          assert.ok(!/<\/?[a-z][^>]*>/i.test(text), `${locale}/${manual}/${slug}: HTML in a text`);
        }
});

test("inline markup: bold, links, and a target that is not allowed stays text", () => {
  assert.deepEqual(parseInline("Toca **Ajustes** y [Privacidad](/privacy)."), [
    { type: "text", text: "Toca " },
    { type: "bold", text: "Ajustes" },
    { type: "text", text: " y " },
    { type: "link", text: "Privacidad", href: "/privacy", external: false },
    { type: "text", text: "." },
  ]);
  assert.deepEqual(linkTargets("[a](https://jchat.cloud/x) [b](mailto:soporte@jchat.cloud) [c](javascript:alert(1)) [d](//evil.com)"), ["https://jchat.cloud/x", "mailto:soporte@jchat.cloud"]);
  assert.equal(stripInline("**Hola** [mundo](/help)"), "Hola mundo");
});
