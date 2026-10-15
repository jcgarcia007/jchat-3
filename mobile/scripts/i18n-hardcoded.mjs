// Shared scanner: user-visible literals that do not go through t() (TypeScript AST). See i18n-hardcoded.test.mjs.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

// Where it looks: every .ts/.tsx under mobile/ except these folders.
const SKIP_DIRS = new Set(['node_modules', 'dist-web', 'dist-web-audit', 'ios', 'android', 'scripts', '.expo', '.maestro', 'assets', 'web-stubs', 'i18n', 'theme', 'types']);

/**
 * JSX props whose string value a person can see or hear. `title` / `label` / `message` / `subtitle` / `hint` / `placeholder`
 * are the names this codebase uses for visible text on its own components; the a11y ones are read by screen readers.
 */
export const VISIBLE_PROPS = new Set([
  'placeholder', 'accessibilityLabel', 'accessibilityHint', 'aria-label', 'aria-description', 'alt',
  'title', 'label', 'message', 'subtitle', 'hint', 'description', 'sublabel', 'helperText', 'errorText', 'confirmText', 'cancelText',
  'caption', 'headline', 'tooltip', 'okText', 'buttonText',
]);

/** Object-literal keys that hold visible text in this codebase's option lists, toasts and dialogs (`{ label: 'Hola' }`). */
const TEXT_KEYS = new Set(['label', 'title', 'message', 'subtitle', 'description', 'placeholder', 'hint', 'text', 'sublabel', 'confirmText', 'cancelText', 'body', 'headline', 'caption', 'buttonText', 'okText', 'tooltip', 'name_es', 'name_en']);

/** State setters / helpers that put a string on screen (`setError('No se pudo…')`). */
const TEXT_SETTERS = /^(setError|setErrorMessage|setMessage|setNotice|setToast|setHint|setStatusText|setInfo|setWarning|setFeedback|showNotice|showError|showMessage)$/;

/** Calls whose string arguments are shown to the person (alert titles / messages, toasts, confirmations). */
const DIALOG_CALLS = new Set(['Alert.alert', 'showAlert', 'confirm', 'showToast', 'toast', 'notify', 'announceForAccessibility', 'AccessibilityInfo.announceForAccessibility']);

/**
 * WHITELIST (documented on purpose; a literal that is exactly one of these, ignoring case and surrounding punctuation, is
 * not a translatable sentence): brand and product names, protocol / format words and universal abbreviations.
 */
export const WHITELIST = new Set([
  'jchat', 'tab pos', 'match', 'truth or dare', 'stripe', 'apple', 'google', 'face id', 'touch id', 'qr', 'pin', 'ok', 'wifi', 'wi-fi',
  'bluetooth', 'usb', 'gps', 'url', 'id', 'sms', 'pdf', 'csv', 'vip', 'pos', 'kds', 'esc/pos', 'escpos', 'tcp', 'ip', 'iva', 'am', 'pm',
  'es', 'en', 'english', 'español', 'espanol', 'instagram', 'tiktok', 'facebook', 'whatsapp', 'x', 'twitter', 'youtube', 'snapchat',
  'visa', 'mastercard', 'amex', 'american express', 'discover', 'apple pay', 'google pay',
  'bt', 'mm', 'cm', 'km', 'ml', 'kg', // unit / transport abbreviations (printer paper width, Bluetooth badge…)
]);

const LETTERS = /[A-Za-zÀ-ÖØ-öø-ÿ]{2,}/; // at least one word of two letters: "x", "•", "$", "1/2", emoji → not a sentence

/** True when the text is something a person reads and has to be translated. */
export function isTranslatable(raw) {
  const s = raw.replace(/\s+/g, ' ').trim();
  if (!s || !LETTERS.test(s)) return false;
  const key = s.toLowerCase().replace(/^[^a-zà-ÿ]+|[^a-zà-ÿ]+$/gi, '');
  if (WHITELIST.has(key)) return false;
  if (/^[a-z0-9_.\-/:]+$/i.test(s) && /[._/:]/.test(s) && !/\s/.test(s)) return false; // an id, an i18n key ('main.previewDm'), a path or a url, not a sentence
  return true;
}

function literalText(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map((s) => s.literal.text).join(' ');
  return null;
}

/** Every string literal that can be what the expression renders: literal, a ?: / && / || / ?? / + with literals. */
function renderedLiterals(node) {
  const out = [];
  const visit = (n) => {
    const text = literalText(n);
    if (text != null) return void out.push({ node: n, text });
    if (ts.isParenthesizedExpression(n)) return visit(n.expression);
    if (ts.isConditionalExpression(n)) { visit(n.whenTrue); visit(n.whenFalse); return; }
    if (ts.isBinaryExpression(n)) {
      const op = n.operatorToken.kind;
      if (op === ts.SyntaxKind.AmpersandAmpersandToken) return visit(n.right);
      if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.PlusToken) { visit(n.left); visit(n.right); }
    }
  };
  visit(node);
  return out;
}

function calleeName(expr) {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return `${calleeName(expr.expression)}.${expr.name.text}`;
  return '';
}

/** `// i18n-ignore: reason` on the same or the previous line silences one finding (use sparingly, with a reason). */
function ignored(sf, node) {
  const text = sf.text;
  const start = node.getStart(sf);
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const prevStart = text.lastIndexOf('\n', lineStart - 2) + 1;
  const lineEnd = text.indexOf('\n', start);
  const here = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
  const prev = text.slice(prevStart, lineStart);
  return /i18n-ignore:\s*\S/.test(here) || /i18n-ignore:\s*\S/.test(prev);
}

export function scanSource(text, fileName = 'x.tsx') {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.ES2020, true, fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found = [];
  const report = (node, kind, value) => {
    if (ignored(sf, node)) return;
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    found.push({ line: line + 1, kind, text: value.replace(/\s+/g, ' ').trim() });
  };

  const visit = (node) => {
    // Demo / mock / fixture data of a business (shown only when Supabase is not configured): out of scope on purpose.
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && /^(DEMO|MOCK|SAMPLE|FIXTURE)_/.test(node.name.text)) return;
    // 1. Text written directly between tags: <Text>Hola</Text>
    if (ts.isJsxText(node)) {
      const value = node.getText(sf);
      if (isTranslatable(value)) report(node, 'jsx-text', value);
    }
    // 2. {'Hola'} / {cond ? 'Sí' : 'No'} rendered as a child (not inside an attribute)
    if (ts.isJsxExpression(node) && node.expression && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      for (const lit of renderedLiterals(node.expression)) if (isTranslatable(lit.text)) report(lit.node, 'jsx-expression', lit.text);
    }
    // 3. Visible props: placeholder="…", accessibilityLabel={'…'}, title={cond ? '…' : '…'}
    if (ts.isJsxAttribute(node) && node.initializer && VISIBLE_PROPS.has(node.name.getText(sf))) {
      const init = node.initializer;
      const lits = ts.isStringLiteral(init) ? [{ node: init, text: init.text }] : ts.isJsxExpression(init) && init.expression ? renderedLiterals(init.expression) : [];
      for (const lit of lits) if (isTranslatable(lit.text)) report(lit.node, `prop:${node.name.getText(sf)}`, lit.text);
    }
    // 5. `{ label: 'Hola' }` / `{ title: cond ? 'Sí' : 'No' }` option lists
    if (ts.isPropertyAssignment(node) && ts.isObjectLiteralExpression(node.parent) && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) && TEXT_KEYS.has(node.name.text)) {
      for (const lit of renderedLiterals(node.initializer)) if (isTranslatable(lit.text)) report(lit.node, `object:${node.name.text}`, lit.text);
    }
    // 6. setError('…') and friends
    if (ts.isCallExpression(node) && TEXT_SETTERS.test(calleeName(node.expression))) {
      for (const arg of node.arguments.slice(0, 1)) for (const lit of renderedLiterals(arg)) if (isTranslatable(lit.text)) report(lit.node, `setter:${calleeName(node.expression)}`, lit.text);
    }
    // 4. Dialogs: Alert.alert('Título', 'Mensaje'), showAlert('…')
    if (ts.isCallExpression(node) && DIALOG_CALLS.has(calleeName(node.expression))) {
      for (const arg of node.arguments.slice(0, 2)) {
        for (const lit of renderedLiterals(arg)) if (isTranslatable(lit.text)) report(lit.node, `dialog:${calleeName(node.expression)}`, lit.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

export function listSources(root) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (SKIP_DIRS.has(name) || name.startsWith('.')) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(tsx|ts)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(full);
    }
  };
  walk(root);
  return out;
}

export function scanProject(root) {
  const results = [];
  for (const file of listSources(root)) {
    for (const f of scanSource(readFileSync(file, 'utf8'), file)) results.push({ file: relative(root, file), ...f });
  }
  return results;
}
