// Text/background pairs of the main screens, found in the code and checked against WCAG AA in light and dark. See contrast-main-screens.test.mjs.
//
// What it finds (TypeScript AST): inside ONE object literal (a style, inline or in StyleSheet.create) that declares both `color: X` and
// `backgroundColor: Y`, where X and Y are theme tokens: `c.textPrimary` (useThemeColors) or `palette.onBrand`. Each pair is resolved for
// the dark and the light scheme and must reach 4.5:1 (3:1 when the same object has fontSize >= 24, WCAG "large text"). A translucent
// background (rgba) is flattened over the screen's bgBase and bgSurface, the two surfaces it sits on.
// LIMITS (on purpose, heuristic): it only sees a pair declared together. A text color whose background comes from a PARENT element, or a
// token chosen at runtime (`color: isOwn ? a : b`), is not seen: the token-vs-surface table in theme-contrast.test.mjs covers those roles.
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { MAIN_SCREEN_FILES } from './a11y-main-screens.mjs';

const mobile = new URL('..', import.meta.url).pathname;
const opts = { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } };

async function loadTheme() {
  const dir = mkdtempSync(join(tmpdir(), 'contrast-screens-'));
  const read = (p) => readFileSync(join(mobile, p), 'utf8');
  writeFileSync(join(dir, 'tokens.mjs'), ts.transpileModule(read('theme/tokens.ts'), opts).outputText);
  const colors = ts.transpileModule(read('theme/colors.ts'), opts).outputText
    .replace(/import \{ useColorScheme \} from 'react-native';/, 'const useColorScheme = () => "dark";')
    .replace(/from '\.\/tokens'/g, "from './tokens.mjs'");
  writeFileSync(join(dir, 'colors.mjs'), colors);
  const { palette } = await import(pathToFileURL(join(dir, 'tokens.mjs')).href);
  const { darkColors, lightColors } = await import(pathToFileURL(join(dir, 'colors.mjs')).href);
  return { palette, schemes: { dark: darkColors, light: lightColors } };
}

function rgba(value) {
  if (typeof value !== 'string') return null;
  if (value.startsWith('#')) {
    const h = value.length === 4 ? `#${[...value.slice(1)].map((x) => x + x).join('')}` : value;
    return { r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16), a: h.length === 9 ? parseInt(h.slice(7, 9), 16) / 255 : 1 };
  }
  const m = value.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const [r, g, b, a = '1'] = m[1].split(',').map((x) => x.trim());
  return { r: +r, g: +g, b: +b, a: +a };
}
const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
const lum = ({ r, g, b }) => {
  const [R, G, B] = [r, g, b].map((v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
};
export const ratio = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

/** Pairs [{file, line, text: 'c.textPrimary', bg: 'c.bgBase', large}] declared in one object literal. */
export function findPairs(code, file) {
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out = [];
  const tokenOf = (init) => (init && ts.isPropertyAccessExpression(init) && /^(c|palette)$/.test(init.expression.getText()) ? init.getText() : null);
  const visit = (node) => {
    if (ts.isObjectLiteralExpression(node)) {
      let text = null; let bg = null; let size = 0;
      for (const p of node.properties) {
        if (!ts.isPropertyAssignment(p)) continue;
        const k = p.name.getText();
        if (k === 'color') text = tokenOf(p.initializer);
        else if (k === 'backgroundColor') bg = tokenOf(p.initializer);
        else if (k === 'fontSize' && ts.isNumericLiteral(p.initializer)) size = Number(p.initializer.text);
      }
      if (text && bg) out.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, text, bg, large: size >= 24 });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

function resolve(token, scheme, theme) {
  const name = token.split('.')[1];
  const source = token.startsWith('c.') ? theme.schemes[scheme] : theme.palette;
  return source[name];
}

/** Checks every pair of the main screens; returns the pairs below the minimum and the ones it could not resolve. */
export async function checkMainScreens(files = MAIN_SCREEN_FILES) {
  const theme = await loadTheme();
  const failures = []; const unresolved = []; let checked = 0;
  for (const rel of files) {
    let code; try { code = readFileSync(join(mobile, rel), 'utf8'); } catch { continue; }
    for (const pair of findPairs(code, rel)) {
      for (const scheme of ['dark', 'light']) {
        const fg = rgba(resolve(pair.text, scheme, theme));
        const bgv = rgba(resolve(pair.bg, scheme, theme));
        if (!fg || !bgv) { unresolved.push(`${rel}:${pair.line} ${pair.text} on ${pair.bg} (${scheme})`); continue; }
        const surfaces = bgv.a < 1 ? [theme.schemes[scheme].bgBase, theme.schemes[scheme].bgSurface].map(rgba) : [null];
        for (const surface of surfaces) {
          const bg = surface ? over(bgv, surface) : bgv;
          const min = pair.large ? 3 : 4.5;
          const r = ratio(over(fg, bg), bg);
          checked += 1;
          if (r < min) failures.push(`${rel}:${pair.line} ${scheme}: ${pair.text} on ${pair.bg} = ${r.toFixed(2)}:1 (< ${min})`);
        }
      }
    }
  }
  return { failures, unresolved, checked };
}

/**
 * Tier 2 (a hint, never a failure): every text token a file uses (`color: c.x`) against every surface token the SAME file uses
 * (`backgroundColor: c.y`), for the cases where the text and its background are declared in different elements. Pairs that never
 * meet on screen can show up here, so this list is for a person to read, not for the build to enforce.
 */
export async function crossPairs(files = MAIN_SCREEN_FILES) {
  const theme = await loadTheme();
  const doubtful = [];
  for (const rel of files) {
    let code; try { code = readFileSync(join(mobile, rel), 'utf8'); } catch { continue; }
    const sf = ts.createSourceFile(rel, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const texts = new Set(); const bgs = new Set();
    const visit = (node) => {
      if (ts.isPropertyAssignment(node) && ts.isPropertyAccessExpression(node.initializer) && /^(c|palette)$/.test(node.initializer.expression.getText())) {
        const k = node.name.getText();
        if (k === 'color') texts.add(node.initializer.getText());
        if (k === 'backgroundColor') bgs.add(node.initializer.getText());
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    for (const t of texts) for (const b of bgs) {
      for (const scheme of ['dark', 'light']) {
        const fg = rgba(resolve(t, scheme, theme)); const bgv = rgba(resolve(b, scheme, theme));
        if (!fg || !bgv || bgv.a < 1) continue;
        const r = ratio(over(fg, bgv), bgv);
        if (r < 4.5) doubtful.push(`${rel} ${scheme}: ${t} on ${b} = ${r.toFixed(2)}:1`);
      }
    }
  }
  return doubtful;
}
