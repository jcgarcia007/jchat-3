/**
 * JChat 3.0 — web audit helpers (e2e/web/audit.spec.ts).
 *
 * Read-only: the collector never clicks anything on its own; the spec decides what to open. Every screen goes through
 * `Audit.screen(name)`, which takes a screenshot and runs the same battery of checks:
 *   console errors / pageerror / React warnings · failed (4xx/5xx/aborted) and hanging requests · elements outside the
 *   480 px app column at desktop widths · horizontal scroll at phone widths · empty buttons and icons · broken images ·
 *   cut or mid-word-split text · touch targets < 40×40 · axe-core serious/critical violations.
 * Findings are written to artifacts/web-audit/data/<combo>.json and merged into REPORTE.md by web/audit-report.mjs.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { Page, Request } from '@playwright/test';

export type Severity = 'bloqueante' | 'alta' | 'media' | 'baja';

export interface Finding {
  severity: Severity;
  kind: string;
  screen: string;
  size: string;
  theme: string;
  lang: string;
  message: string;
  detail?: string;
  /** testID / aria-label / text of the element, to find the component */
  target?: string;
  shot?: string;
}

export interface AuditMeta {
  suite: string; // e.g. "app" | "app-public" | "next-prod"
  size: string; // "390x844"
  theme: 'light' | 'dark';
  lang: 'es' | 'en';
}

export const AUDIT_DIR = path.resolve(__dirname, '..', 'artifacts', 'web-audit');

/** Network / console noise that is expected, with the reason (documented in the report). */
export const EXPECTED_NOISE: { test: RegExp; why: string }[] = [
  { test: /expo-notifications.*not yet fully supported on web/i, why: 'expo-notifications on web: no push listener (known limitation)' },
  { test: /useNativeDriver.*not supported/i, why: 'react-native-web falls back to JS animation (known, harmless)' },
  { test: /\/favicon\.ico/i, why: 'favicon probe' },
];

const SHAPES = 'path,circle,rect,line,polyline,polygon,ellipse';

/** Runs inside the page. Returns raw issues; the Node side turns them into Findings. */
const DOM_CHECKS = `(opts) => {
  const out = [];
  const SHAPES = ${JSON.stringify(SHAPES)};
  const vw = window.innerWidth, vh = window.innerHeight;
  const label = (el) => {
    const t = el.getAttribute('data-testid');
    const a = el.getAttribute('aria-label');
    const x = (el.innerText || '').trim().replace(/\\s+/g, ' ').slice(0, 40);
    return [t && 'testID=' + t, a && 'aria="' + a.slice(0, 40) + '"', x && 'text="' + x + '"'].filter(Boolean).join(' ') || el.tagName.toLowerCase();
  };
  const isVisible = (el) => {
    try { return el.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true }); } catch { return true; }
  };
  const clip = (el) => {
    const r = el.getBoundingClientRect();
    let l = r.left, t = r.top, rt = r.right, b = r.bottom;
    let p = el.parentElement;
    while (p && p !== document.documentElement) {
      const cs = getComputedStyle(p);
      if (cs.position !== 'fixed') {
        const pr = p.getBoundingClientRect();
        if (cs.overflowX !== 'visible') { l = Math.max(l, pr.left); rt = Math.min(rt, pr.right); }
        if (cs.overflowY !== 'visible') { t = Math.max(t, pr.top); b = Math.min(b, pr.bottom); }
      }
      p = p.parentElement;
    }
    return rt - l > 0.5 && b - t > 0.5 ? { l, t, r: rt, b, w: rt - l, h: b - t } : null;
  };
  const root = document.getElementById('root') || document.body;
  const all = Array.from(root.querySelectorAll('*')).filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && isVisible(el);
  });

  // 1. App column + frame check (desktop). The column is the first ~480 px wide, near full-height element.
  let col = null;
  if (opts.desktop) {
    const c = all.find((el) => { const r = el.getBoundingClientRect(); return Math.abs(r.width - 480) <= 1 && r.height >= vh * 0.9; });
    if (c) { const r = c.getBoundingClientRect(); col = { l: r.left, r: r.right }; }
    if (!col && opts.expectColumn) out.push({ kind: 'frame', msg: 'no se encontró la columna de 480 px de la app', target: '' });
  }
  // Side panel (profile / menu at >= 900 px): the first ancestor of its ✕ button that is a real panel-sized box.
  const panels = [];
  document.querySelectorAll('[data-testid="profile-sheet-close"],[data-testid="menu-sheet-close"],[data-testid="menu-sheet-content"]').forEach((el) => {
    let p = el;
    while (p && p !== document.body) {
      const r = p.getBoundingClientRect();
      if (r.width > 300 && r.width < vw - 1) { panels.push({ l: r.left, r: r.right }); return; }
      p = p.parentElement;
    }
  });
  const inPanel = (c) => panels.some((p) => c.l >= p.l - 1 && c.r <= p.r + 1);
  if (col) {
    const seen = new Set();
    for (const el of all) {
      const cs = getComputedStyle(el);
      const ownText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
      const leaf = ownText || /^(IMG|SVG|VIDEO|INPUT|TEXTAREA|CANVAS)$/i.test(el.tagName) || el.getAttribute('role') === 'button';
      const overlay = cs.position === 'fixed' && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent';
      if (!leaf && !overlay) continue;
      const c = overlay ? (() => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, w: r.width, h: r.height }; })() : clip(el);
      if (!c) continue;
      if (c.l < col.l - 1 || c.r > col.r + 1) {
        if (inPanel(c)) continue;
        const key = label(el);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ kind: overlay ? 'frame-overlay' : 'frame', msg: (overlay ? 'fondo/overlay' : 'elemento') + ' fuera de la columna: x ' + Math.round(c.l) + '→' + Math.round(c.r) + ' (columna ' + Math.round(col.l) + '→' + Math.round(col.r) + ')', target: key });
      }
    }
  }

  // 2. Horizontal scroll at phone width.
  if (opts.phone) {
    const de = document.documentElement;
    if (de.scrollWidth > vw + 1 || document.body.scrollWidth > vw + 1) out.push({ kind: 'hscroll', msg: 'scroll horizontal: scrollWidth ' + Math.max(de.scrollWidth, document.body.scrollWidth) + ' > ' + vw, target: '' });
    const seen = new Set();
    for (const el of all) {
      const ownText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!ownText && !/^(IMG|INPUT|TEXTAREA)$/i.test(el.tagName) && el.getAttribute('role') !== 'button') continue;
      const c = clip(el);
      if (c && (c.l < -1 || c.r > vw + 1)) {
        const key = label(el);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ kind: 'hscroll-el', msg: 'elemento visible fuera del ancho de pantalla: x ' + Math.round(c.l) + '→' + Math.round(c.r) + ' (ancho ' + vw + ')', target: key });
      }
    }
  }

  // 3. Clickables: empty / unnamed buttons, empty SVG icons, small touch targets.
  const clickSel = 'button,[role=button],[role=link],a[href],[role=tab],[role=switch],[role=checkbox],[role=radio],[role=menuitem]';
  const seenClick = new Set();
  for (const el of Array.from(root.querySelectorAll(clickSel))) {
    if (!isVisible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    const c = clip(el);
    if (!c) continue;
    if (el.getAttribute('aria-hidden') === 'true') continue;
    const name = (el.getAttribute('aria-label') || el.getAttribute('title') || (el.innerText || '').trim() ||
      Array.from(el.querySelectorAll('img[alt]')).map((i) => i.getAttribute('alt')).join('').trim() ||
      (el.getAttribute('aria-labelledby') ? (document.getElementById(el.getAttribute('aria-labelledby')) || {}).innerText : '') || '').trim();
    const svgs = Array.from(el.querySelectorAll('svg'));
    const emptySvg = svgs.filter((s) => s.querySelectorAll(SHAPES).length === 0);
    const hasIcon = svgs.some((s) => s.querySelectorAll(SHAPES).length > 0) || el.querySelector('img') || getComputedStyle(el).backgroundImage !== 'none';
    const key = label(el) + '@' + Math.round(c.l) + ',' + Math.round(c.t);
    if (seenClick.has(key)) continue;
    seenClick.add(key);
    if (!name && !hasIcon) out.push({ kind: 'empty-button', msg: 'botón sin texto, sin ícono visible y sin aria-label (' + Math.round(c.w) + '×' + Math.round(c.h) + ')', target: label(el) });
    else if (!name) out.push({ kind: 'unnamed-button', msg: 'botón solo con ícono y sin aria-label/nombre accesible (' + Math.round(c.w) + '×' + Math.round(c.h) + ')', target: label(el) });
    if (emptySvg.length > 0 && !hasIcon) out.push({ kind: 'empty-icon', msg: 'ícono SVG sin formas dentro de un clicable', target: label(el) });
    if (opts.phone && (c.w < 39.5 || c.h < 39.5)) out.push({ kind: 'small-target', msg: 'objetivo táctil ' + Math.round(c.w) + '×' + Math.round(c.h) + ' < 40×40', target: label(el) });
  }
  // SVGs without shapes anywhere (even outside a clickable) = broken icon
  for (const s of Array.from(root.querySelectorAll('svg'))) {
    const r = s.getBoundingClientRect();
    if (r.width < 6 || r.height < 6 || !isVisible(s)) continue;
    if (s.querySelectorAll(SHAPES).length === 0 && !s.querySelector('image,use,text,foreignObject')) {
      const key = 'svg@' + Math.round(r.left) + ',' + Math.round(r.top);
      if (!seenClick.has(key)) { seenClick.add(key); out.push({ kind: 'empty-icon', msg: 'SVG visible sin formas (ícono vacío) ' + Math.round(r.width) + '×' + Math.round(r.height), target: label(s.parentElement || s) }); }
    }
  }

  // 4. Broken images.
  for (const img of Array.from(document.images)) {
    if (!img.currentSrc && !img.src) continue;
    const r = img.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || !isVisible(img)) continue;
    if (img.complete && img.naturalWidth === 0) out.push({ kind: 'broken-image', msg: 'imagen rota (naturalWidth 0): ' + (img.currentSrc || img.src).slice(0, 120), target: label(img) });
  }

  // 5. Cut text (ellipsis / clamped / clipped) and words split across lines.
  const seenText = new Set();
  for (const el of all) {
    const ownText = Array.from(el.childNodes).filter((n) => n.nodeType === 3 && n.textContent.trim());
    if (ownText.length === 0) continue;
    const cs = getComputedStyle(el);
    const text = ownText.map((n) => n.textContent).join(' ').trim();
    if (text.length < 4) continue;
    const clipsX = cs.overflowX !== 'visible' && el.scrollWidth > el.clientWidth + 1;
    const clipsY = cs.overflowY !== 'visible' && el.scrollHeight > el.clientHeight + 1;
    if ((clipsX || clipsY) && cs.overflowX !== 'scroll' && cs.overflowX !== 'auto' && cs.overflowY !== 'scroll' && cs.overflowY !== 'auto') {
      const key = 'cut:' + text.slice(0, 30);
      if (!seenText.has(key)) { seenText.add(key); out.push({ kind: 'cut-text', msg: 'texto cortado/truncado: "' + text.slice(0, 60) + '"', target: label(el) }); }
    }
    for (const n of ownText) {
      const s = n.textContent;
      const re = /[\\p{L}\\p{N}'’]{5,}/gu;
      let m;
      while ((m = re.exec(s))) {
        const rg = document.createRange();
        rg.setStart(n, m.index);
        rg.setEnd(n, m.index + m[0].length);
        const rects = Array.from(rg.getClientRects()).filter((x) => x.width > 0);
        if (rects.length > 1 && Math.abs(rects[0].top - rects[rects.length - 1].top) > 3) {
          const key = 'split:' + m[0];
          if (!seenText.has(key)) { seenText.add(key); out.push({ kind: 'split-word', msg: 'palabra partida a mitad: "' + m[0] + '"', target: label(el) }); }
        }
      }
    }
  }
  return out;
}`;

const SEVERITY: Record<string, Severity> = {
  pageerror: 'alta',
  'console-error': 'media',
  'console-warning': 'baja',
  'http-5xx': 'alta',
  'http-4xx': 'media',
  'request-failed': 'media',
  'request-hanging': 'media',
  frame: 'alta',
  'frame-overlay': 'alta',
  hscroll: 'alta',
  'hscroll-el': 'media',
  'empty-button': 'alta',
  'unnamed-button': 'media',
  'empty-icon': 'alta',
  'broken-image': 'alta',
  'cut-text': 'baja',
  'split-word': 'media',
  'small-target': 'baja',
  'axe-critical': 'alta',
  'axe-serious': 'media',
  navigation: 'media',
};

export class Audit {
  findings: Finding[] = [];
  private current = 'init';
  private buffer: { kind: string; message: string; detail?: string }[] = [];
  private pending = new Map<Request, number>();
  private shots = 0;
  readonly screens: string[] = [];
  readonly noise = new Map<string, number>();

  constructor(
    readonly page: Page,
    readonly meta: AuditMeta,
    private readonly expectColumn = true,
  ) {
    const noisy = (text: string) => EXPECTED_NOISE.find((n) => n.test.test(text));
    const note = (why: string) => this.noise.set(why, (this.noise.get(why) ?? 0) + 1);
    page.on('console', (msg) => {
      const t = msg.type();
      if (t !== 'error' && t !== 'warning') return;
      const text = msg.text();
      const known = noisy(text);
      if (known) return note(known.why);
      const loc = msg.location();
      const isReact = /Warning:|React|validateDOMNesting|Each child in a list|act\(/i.test(text);
      this.buffer.push({
        kind: t === 'error' ? 'console-error' : 'console-warning',
        message: (isReact ? '[React] ' : '') + text.slice(0, 300),
        detail: loc?.url ? `${loc.url.split('/').slice(-1)[0].slice(0, 60)}:${loc.lineNumber}` : undefined,
      });
    });
    page.on('pageerror', (err) => this.buffer.push({ kind: 'pageerror', message: err.message.slice(0, 300) }));
    page.on('request', (req) => this.pending.set(req, Date.now()));
    page.on('requestfinished', (req) => this.pending.delete(req));
    page.on('requestfailed', (req) => {
      this.pending.delete(req);
      const err = req.failure()?.errorText ?? '';
      const url = req.url();
      const known = noisy(url);
      if (known) return note(known.why);
      // Aborted by navigation / unmount (net::ERR_ABORTED) is normal churn, counted but not a finding.
      if (/ERR_ABORTED/.test(err)) return note('requests aborted by navigation/unmount (net::ERR_ABORTED)');
      this.buffer.push({ kind: 'request-failed', message: `${req.method()} ${redact(url)} → ${err}` });
    });
    page.on('response', (res) => {
      const s = res.status();
      if (s < 400) return;
      const url = res.url();
      const known = noisy(url);
      if (known) return note(known.why);
      this.buffer.push({ kind: s >= 500 ? 'http-5xx' : 'http-4xx', message: `${res.request().method()} ${redact(url)} → ${s}` });
    });
  }

  /** Runs `fn`; a thrown error becomes a navigation finding instead of aborting the walk. Returns whether it worked. */
  async step(name: string, fn: () => Promise<void>): Promise<boolean> {
    this.current = name;
    try {
      await fn();
      return true;
    } catch (e) {
      const msg = String((e as Error)?.message ?? e).split('\n')[0].slice(0, 220);
      this.push({ kind: 'navigation', screen: name, message: `No se pudo completar el paso "${name}": ${msg}` });
      return false;
    }
  }

  push(f: { kind: string; screen?: string; message: string; detail?: string; target?: string; shot?: string; severity?: Severity }) {
    this.findings.push({
      severity: f.severity ?? SEVERITY[f.kind] ?? 'media',
      kind: f.kind,
      screen: f.screen ?? this.current,
      size: this.meta.size,
      theme: this.meta.theme,
      lang: this.meta.lang,
      message: f.message,
      detail: f.detail,
      target: f.target,
      shot: f.shot,
    });
  }

  /** Screenshot + the whole battery of checks for the screen that is showing now. */
  async screen(name: string, opts: { axe?: boolean; settleMs?: number } = {}) {
    const { page, meta } = this;
    this.current = name;
    this.screens.push(name);
    await page.waitForTimeout(opts.settleMs ?? 700);
    const shotRel = `shots/${meta.suite}/${meta.size}-${meta.theme}-${meta.lang}/${String(++this.shots).padStart(2, '0')}-${slug(name)}.png`;
    const shotAbs = path.join(AUDIT_DIR, shotRel);
    mkdirSync(path.dirname(shotAbs), { recursive: true });
    await page.screenshot({ path: shotAbs }).catch(() => undefined);

    const [w] = meta.size.split('x').map(Number);
    const raw = (await page
      .evaluate(`(${DOM_CHECKS})(${JSON.stringify({ desktop: w >= 900, phone: w <= 480, expectColumn: this.expectColumn })})`)
      .catch((e) => [{ kind: 'navigation', msg: `check failed: ${String(e).slice(0, 120)}`, target: '' }])) as { kind: string; msg: string; target: string }[];
    for (const r of raw) this.push({ kind: r.kind, message: r.msg, target: r.target, shot: shotRel });

    const now = Date.now();
    for (const [req, t] of this.pending) {
      if (now - t > 10_000 && req.resourceType() !== 'eventsource' && req.resourceType() !== 'websocket') {
        this.push({ kind: 'request-hanging', message: `${req.method()} ${redact(req.url())} sin terminar tras ${Math.round((now - t) / 1000)} s`, shot: shotRel });
        this.pending.delete(req);
      }
    }

    // Dedupe buffered console/network entries per screen.
    const seen = new Set<string>();
    for (const b of this.buffer.splice(0)) {
      const key = b.kind + b.message;
      if (seen.has(key)) continue;
      seen.add(key);
      this.push({ kind: b.kind, message: b.message, detail: b.detail, shot: shotRel });
    }

    if (opts.axe !== false) {
      try {
        const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        for (const v of res.violations) {
          if (v.impact !== 'serious' && v.impact !== 'critical') continue;
          const nodes = v.nodes.slice(0, 3).map((n) => n.target.join(' ').slice(0, 90));
          this.push({
            kind: v.impact === 'critical' ? 'axe-critical' : 'axe-serious',
            message: `axe ${v.id}: ${v.help} (${v.nodes.length} nodo${v.nodes.length === 1 ? '' : 's'})`,
            detail: nodes.join(' | '),
            target: nodes[0],
            shot: shotRel,
          });
        }
      } catch (e) {
        this.push({ kind: 'navigation', message: `axe falló: ${String(e).slice(0, 100)}`, shot: shotRel });
      }
    }
  }

  save() {
    const dir = path.join(AUDIT_DIR, 'data');
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${this.meta.suite}-${this.meta.size}-${this.meta.theme}-${this.meta.lang}.json`);
    writeFileSync(file, JSON.stringify({ meta: this.meta, screens: this.screens, noise: Object.fromEntries(this.noise), findings: this.findings }, null, 1));
  }
}

function slug(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
}

/** Never write tokens / QR table tokens / query secrets into reports. */
function redact(url: string) {
  try {
    const u = new URL(url);
    u.search = u.search ? '?…' : '';
    return u.toString().replace(/\/t\/[^/]+/, '/t/<token>').replace(/[A-Za-z0-9_-]{40,}/g, '<redacted>').slice(0, 160);
  } catch {
    return url.slice(0, 100);
  }
}
