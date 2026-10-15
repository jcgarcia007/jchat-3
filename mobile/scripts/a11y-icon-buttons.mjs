// Shared scanner: icon-only pressables without an accessibility label (TypeScript AST). See a11y-icon-buttons.test.mjs.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const PRESSABLES = new Set(['Pressable', 'TouchableOpacity', 'TouchableHighlight', 'TouchableWithoutFeedback', 'TouchableNativeFeedback']);
const SKIP_DIRS = new Set(['node_modules', 'dist-web', 'dist-web-audit', 'ios', 'android', 'scripts', '.expo', 'assets', 'web-stubs', 'i18n']);
const LABEL_ATTRS = new Set(['accessibilityLabel', 'aria-label', 'accessibilityLabelledBy', 'aria-labelledby']);

const isIcon = (name) => /^Icon[A-Z0-9]/.test(name);
const isText = (name) => name === 'Text' || name.endsWith('.Text') || name === 'TextInput';

function tagName(node) {
  const tag = ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName;
  return tag.getText();
}

function walkChildren(node, visit) {
  ts.forEachChild(node, (child) => {
    visit(child);
    walkChildren(child, visit);
  });
}

/** What a pressable renders: icons, text, non-empty text nodes, and string-ish expressions that look like labels. */
function inspect(element) {
  const seen = { icon: false, text: false };
  walkChildren(element, (child) => {
    if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
      const name = tagName(child);
      if (isIcon(name)) seen.icon = true;
      else if (isText(name)) seen.text = true;
    } else if (ts.isJsxText(child) && child.getText().trim()) seen.text = true;
  });
  return seen;
}

const attrNames = (opening) => opening.attributes.properties.filter((p) => ts.isJsxAttribute(p)).map((p) => p.name.getText());

/** Children of an empty View: more empty Views only. */
function isUnlabeledScrimInner(view) {
  return view.children.every((c) => (ts.isJsxText(c) ? !c.getText().trim() : !ts.isJsxExpression(c) && tagName(c) === 'View' && (ts.isJsxSelfClosingElement(c) || isUnlabeledScrimInner(c))));
}

/** A full-screen backdrop / click-catcher: has onPress, no label, no `accessible` prop, and renders nothing but empty Views. */
function isUnlabeledScrim(node) {
  const opening = ts.isJsxElement(node) ? node.openingElement : node;
  const names = attrNames(opening);
  if (!names.some((n) => n === 'onPress' || n === 'onPressIn' || n === 'onPressOut')) return false;
  if (names.includes('accessible')) return false;
  if (!ts.isJsxElement(node)) return true; // self-closing: nothing inside
  // Only what is rendered INSIDE (node.children), never the attributes of the opening tag.
  return node.children.every((child) => {
    if (ts.isJsxText(child)) return !child.getText().trim();
    if (ts.isJsxExpression(child)) return false; // opaque: could render anything
    return tagName(child) === 'View' && (ts.isJsxSelfClosingElement(child) || isUnlabeledScrimInner(child));
  });
}

function hasLabel(opening) {
  return opening.attributes.properties.some((p) => ts.isJsxAttribute(p) && LABEL_ATTRS.has(p.name.getText())) ||
    opening.attributes.properties.some((p) => ts.isJsxSpreadAttribute(p)); // {...props}: cannot know → not reported
}

export function scanSource(text, fileName = 'x.tsx') {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.ES2020, true, fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found = [];
  const visit = (node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const name = tagName(node);
      if (PRESSABLES.has(name)) {
        const opening = ts.isJsxElement(node) ? node.openingElement : node;
        if (!hasLabel(opening)) {
          const seen = ts.isJsxElement(node) ? inspect(node) : { icon: false, text: false };
          if (seen.icon && !seen.text) {
            const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
            found.push({ line: line + 1, tag: name, rule: 'icon-only without accessibilityLabel' });
          } else if (isUnlabeledScrim(node)) {
            const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
            found.push({ line: line + 1, tag: name, rule: 'backdrop without accessible={false} (or a label)' });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

export function* sourceFiles(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sourceFiles(path);
    else if (/\.tsx$/.test(name)) yield path;
  }
}

export function scanProject(root) {
  const offenders = [];
  for (const file of sourceFiles(root)) {
    for (const hit of scanSource(readFileSync(file, 'utf8'), file)) offenders.push({ file: relative(root, file), ...hit });
  }
  return offenders;
}
