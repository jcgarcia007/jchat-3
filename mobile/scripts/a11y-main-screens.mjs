// Accessibility scanner for the main screens (TypeScript AST). See a11y-main-screens.test.mjs.
//   Rule T — a pressable whose own style declares a width or height under 44 pt (inline or via StyleSheet.create in the same file) and has no
//            hitSlop: the touch area is smaller than Apple's / Google's minimum. (minHeight / minWidth >= 44 on that axis counts as 44.)
//   Rule I — an <Image> (react-native or expo-image) with no accessibilityLabel / alt / aria-label and not hidden from screen readers
//            (accessible={false}, aria-hidden, importantForAccessibility="no*", accessibilityElementsHidden).
//   Rule F — allowFontScaling={false} on Text / TextInput (text that ignores the person's font size).
// Same limits as a11y-icon-buttons.mjs: heuristic, no component following, spread props are skipped.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

export const MAIN_SCREEN_FILES = [
  // room / chat
  'screens/chat/ChatRoomScreen.tsx', 'components/chat/MessageBubble.tsx', 'components/chat/UserActionSheet.tsx', 'components/chat/UserQuickCard.tsx',
  // DMs
  'screens/dms/DMChatScreen.tsx', 'screens/dms/DMInboxScreen.tsx', 'screens/dms/MessagesScreen.tsx',
  // profile
  'screens/profile/ProfileScreen.tsx', 'components/profile/ProfileHeader.tsx',
  // gift
  'components/gift/GiftSheet.tsx', 'components/gift/GiftCard.tsx', 'components/gift/GiftPayPage.web.tsx', 'components/gift/GiftPaymentForm.web.tsx',
  // menu / cart / checkout
  'screens/menu/MenuScreen.tsx', 'screens/menu/ProductDetailScreen.tsx', 'screens/menu/CartScreen.tsx', 'screens/checkout/CheckoutScreen.tsx',
  // settings
  'screens/settings/SettingsScreen.tsx', 'screens/settings/PrivacyScreen.tsx',
  // Match and Truth or Dare
  'screens/match/MatchHomeScreen.tsx', 'screens/match/MatchProfileScreen.tsx', 'screens/match/MatchActivityScreen.tsx',
  'screens/match/MatchInterestsScreen.tsx', 'screens/match/MatchItsAMatchScreen.tsx', 'screens/match/MatchMyProfileScreen.tsx',
  'screens/games/TodHomeScreen.tsx', 'components/games/TodCardModal.tsx', 'components/games/TodDrawResult.tsx', 'components/games/TodRoundCard.tsx',
  // stories (reported and blocked from here)
  'screens/stories/StoryViewerScreen.tsx',
];

const PRESSABLES = new Set(['Pressable', 'TouchableOpacity', 'TouchableHighlight', 'TouchableWithoutFeedback', 'TouchableNativeFeedback']);
const IMAGES = new Set(['Image', 'ExpoImage', 'FastImage']);
const MIN_TOUCH = 44;

const tagOf = (node) => (ts.isJsxElement(node) ? node.openingElement : node).tagName.getText();
const openingOf = (node) => (ts.isJsxElement(node) ? node.openingElement : node);
const attrs = (opening) => opening.attributes.properties;
const attr = (opening, name) => attrs(opening).find((p) => ts.isJsxAttribute(p) && p.name.getText() === name);
const hasSpread = (opening) => attrs(opening).some((p) => ts.isJsxSpreadAttribute(p));

function numberValue(node) {
  if (!node) return null;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (ts.isPrefixUnaryExpression(node) && ts.isNumericLiteral(node.operand)) return -Number(node.operand.text);
  return null;
}

/** StyleSheet.create({ a: { width: 30, … } }) → Map('a' → { width: 30 }) (numbers only). */
function styleMap(sf) {
  const map = new Map();
  const visit = (node) => {
    if (ts.isCallExpression(node) && node.expression.getText().endsWith('StyleSheet.create') && node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0])) {
      for (const prop of node.arguments[0].properties) {
        if (ts.isPropertyAssignment(prop) && ts.isObjectLiteralExpression(prop.initializer)) map.set(prop.name.getText(), sizes(prop.initializer));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return map;
}

function sizes(obj) {
  const out = {};
  for (const p of obj.properties) {
    if (!ts.isPropertyAssignment(p)) continue;
    const k = p.name.getText();
    if (['width', 'height', 'minWidth', 'minHeight'].includes(k)) {
      const v = numberValue(p.initializer);
      if (v !== null) out[k] = v;
    }
  }
  return out;
}

/** Collects the size keys a `style` expression declares (inline objects and `styles.x` references, in arrays or conditionals). */
function styleSizes(expr, styles) {
  const merged = {};
  const walk = (n) => {
    if (!n) return;
    if (ts.isObjectLiteralExpression(n)) Object.assign(merged, sizes(n));
    else if (ts.isPropertyAccessExpression(n) && styles.has(n.name.getText())) Object.assign(merged, styles.get(n.name.getText()));
    else if (ts.isElementAccessExpression(n)) { /* dynamic: skip */ }
    else if (ts.isArrayLiteralExpression(n)) n.elements.forEach(walk);
    else if (ts.isConditionalExpression(n)) { walk(n.whenTrue); walk(n.whenFalse); }
    else if (ts.isBinaryExpression(n)) { walk(n.left); walk(n.right); }
    else if (ts.isParenthesizedExpression(n)) walk(n.expression);
    else if (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) walk(ts.isBlock(n.body) ? null : n.body);
  };
  walk(expr);
  return merged;
}

function smallTouchArea(sz) {
  const w = sz.width ?? null;
  const h = sz.height ?? null;
  const effW = w !== null ? Math.max(w, sz.minWidth ?? 0) : null;
  const effH = h !== null ? Math.max(h, sz.minHeight ?? 0) : null;
  return (effW !== null && effW < MIN_TOUCH) || (effH !== null && effH < MIN_TOUCH);
}

const hiddenFromReader = (opening) => {
  const a = attr(opening, 'accessible');
  if (a && a.initializer && ts.isJsxExpression(a.initializer) && a.initializer.expression?.getText() === 'false') return true;
  if (attr(opening, 'aria-hidden') || attr(opening, 'accessibilityElementsHidden')) return true;
  const imp = attr(opening, 'importantForAccessibility');
  return !!(imp && /no/.test(imp.initializer?.getText() ?? ''));
};

export function scanSource(code, file = 'fixture.tsx') {
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const styles = styleMap(sf);
  const hits = [];
  const add = (node, rule, tag, detail) => hits.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, rule, tag, detail });
  const visit = (node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = tagOf(node);
      const opening = openingOf(node);
      if (PRESSABLES.has(tag) && !hasSpread(opening) && !attr(opening, 'hitSlop')) {
        const style = attr(opening, 'style');
        const expr = style?.initializer && ts.isJsxExpression(style.initializer) ? style.initializer.expression : undefined;
        const sz = styleSizes(expr, styles);
        if (smallTouchArea(sz)) add(node, 'T', tag, `declared size ${JSON.stringify(sz)} < ${MIN_TOUCH} and no hitSlop`);
      }
      if (IMAGES.has(tag) && !hasSpread(opening) && !hiddenFromReader(opening) && !attr(opening, 'accessibilityLabel') && !attr(opening, 'alt') && !attr(opening, 'aria-label')) {
        add(node, 'I', tag, 'image without accessibilityLabel / alt and not hidden from screen readers');
      }
      if ((tag === 'Text' || tag === 'TextInput') && attr(opening, 'allowFontScaling')) {
        const a = attr(opening, 'allowFontScaling');
        if (a.initializer && ts.isJsxExpression(a.initializer) && a.initializer.expression?.getText() === 'false') add(node, 'F', tag, 'allowFontScaling={false}');
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

export function scanMainScreens(mobileRoot, files = MAIN_SCREEN_FILES) {
  const hits = [];
  const missing = [];
  for (const rel of files) {
    const path = join(mobileRoot, rel);
    if (!existsSync(path)) { missing.push(rel); continue; }
    hits.push(...scanSource(readFileSync(path, 'utf8'), rel));
  }
  return { hits, missing };
}
