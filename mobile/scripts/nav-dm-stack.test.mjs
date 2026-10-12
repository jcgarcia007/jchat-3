// Navigation contract for the DM shortcut of the venue chat (React Navigation 7 StackRouter, the same
// router the MainStack uses). Run from mobile/:  node --test scripts/nav-dm-stack.test.mjs
//
// It checks, on the real router state, that:
//  - opening Messages from the chat PUSHES DMs on top of ChatRoom (no reset / popToTop),
//  - going back returns to the SAME ChatRoom route (same key => React keeps the mounted screen),
//  - "Volver al chat" from a DM screen must use popTo (navigate would stack a second ChatRoom),
//  - popTo is only safe when a ChatRoom exists in the stack (AppNavigator.openVenueChat checks that),
//  - a venue entry for ANOTHER room never reuses the open ChatRoom (it cannot switch rooms without remounting):
//    planVenueChatNavigation → 'replace' → one reset leaves a single, new ChatRoom (utils/venueChatNav.ts).

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { CommonActions, StackActions, StackRouter } from '@react-navigation/routers';
import ts from 'typescript';

// utils/venueChatNav.ts (pure, no imports) is transpiled with the repo's own `typescript` and imported.
const planDir = mkdtempSync(join(tmpdir(), 'venue-chat-nav-'));
writeFileSync(
  join(planDir, 'venueChatNav.mjs'),
  ts.transpileModule(readFileSync(new URL('../utils/venueChatNav.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText,
);
const { planVenueChatNavigation } = await import(pathToFileURL(join(planDir, 'venueChatNav.mjs')).href);

const routeNames = ['Tabs', 'DMs', 'ChatRoom'];
const options = { routeNames, routeParamList: {}, routeGetIdList: {} };
const router = StackRouter({});

function inChat() {
  let state = router.getInitialState(options);
  state = router.getStateForAction(state, CommonActions.navigate('ChatRoom', { id: 'room-1' }), options);
  return state;
}
const names = (state) => state.routes.map((r) => r.name);

test('chat -> Messages pushes DMs on top of ChatRoom', () => {
  const chat = inChat();
  const next = router.getStateForAction(chat, CommonActions.navigate('DMs', { screen: 'DMInbox' }), options);
  assert.deepEqual(names(next), ['Tabs', 'ChatRoom', 'DMs']);
});

test('back from Messages returns to the same ChatRoom instance (no remount)', () => {
  const chat = inChat();
  const chatKey = chat.routes[1].key;
  const dms = router.getStateForAction(chat, CommonActions.navigate('DMs', { screen: 'DMInbox' }), options);
  const back = router.getStateForAction(dms, CommonActions.goBack(), options);
  assert.deepEqual(names(back), ['Tabs', 'ChatRoom']);
  assert.equal(back.routes[1].key, chatKey);
  assert.deepEqual(back.routes[1].params, { id: 'room-1' });
});

test('navigate(ChatRoom) from a DM screen would stack a second ChatRoom', () => {
  const dms = router.getStateForAction(inChat(), CommonActions.navigate('DMs', { screen: 'DMInbox' }), options);
  const wrong = router.getStateForAction(dms, CommonActions.navigate('ChatRoom', { id: 'room-1' }), options);
  assert.deepEqual(names(wrong), ['Tabs', 'ChatRoom', 'DMs', 'ChatRoom']);
});

test('popTo(ChatRoom) from a DM screen returns to the existing instance', () => {
  const chat = inChat();
  const chatKey = chat.routes[1].key;
  const dms = router.getStateForAction(chat, CommonActions.navigate('DMs', { screen: 'DMInbox' }), options);
  const back = router.getStateForAction(dms, StackActions.popTo('ChatRoom', { id: 'room-1' }), options);
  assert.deepEqual(names(back), ['Tabs', 'ChatRoom']);
  assert.equal(back.routes[1].key, chatKey);
});

test('popTo without a ChatRoom in the stack drops the Tabs route: only use it when ChatRoom exists', () => {
  const tabsOnly = router.getInitialState(options);
  const popped = router.getStateForAction(tabsOnly, StackActions.popTo('ChatRoom', { id: 'room-1' }), options);
  assert.deepEqual(names(popped), ['ChatRoom']);
});

// ── openVenueChat plans (utils/venueChatNav.ts) applied to the real router, as AppNavigator does ──────────────

/** The same action AppNavigator.openVenueChat dispatches for a plan, applied to a router state. */
function applyPlan(state, plan) {
  if (plan.kind === 'popTo') return router.getStateForAction(state, StackActions.popTo('ChatRoom', plan.params), options);
  if (plan.kind === 'replace') {
    const kept = state.routes.slice(0, plan.keep);
    return router.getStateForAction(
      state,
      CommonActions.reset({ ...state, routes: [...kept, { name: 'ChatRoom', params: plan.params }], index: kept.length }),
      options,
    );
  }
  return router.getStateForAction(state, CommonActions.navigate('ChatRoom', plan.params), options);
}
const chatRooms = (state) => state.routes.filter((r) => r.name === 'ChatRoom');

test('plan: no ChatRoom in the stack → navigate (a normal push)', () => {
  const tabs = router.getInitialState(options);
  const plan = planVenueChatNavigation(tabs.routes, 'room-1');
  assert.equal(plan.kind, 'navigate');
  const next = applyPlan(tabs, plan);
  assert.deepEqual(names(next), ['Tabs', 'ChatRoom']);
});

test('plan: ChatRoom A in the stack + entry to B → one ChatRoom, id B, a NEW instance', () => {
  const chat = inChat(); // Tabs > ChatRoom(room-1)
  const keyA = chat.routes[1].key;
  const withDms = router.getStateForAction(chat, CommonActions.navigate('DMs', { screen: 'DMInbox' }), options);
  const plan = planVenueChatNavigation(withDms.routes, 'room-2');
  assert.deepEqual(plan, { kind: 'replace', params: { id: 'room-2' }, keep: 1 });
  const next = applyPlan(withDms, plan);
  assert.deepEqual(names(next), ['Tabs', 'ChatRoom']);
  assert.equal(chatRooms(next).length, 1);
  assert.deepEqual(chatRooms(next)[0].params, { id: 'room-2' });
  assert.notEqual(chatRooms(next)[0].key, keyA);
  assert.equal(next.routes[0].key, withDms.routes[0].key, 'the route below keeps its instance');
  assert.equal(next.index, 1);
});

test('plan: ChatRoom A on top + entry to B (table label kept) → replaced, params carry the table', () => {
  const chat = inChat();
  const plan = planVenueChatNavigation(chat.routes, 'room-2', 'T8');
  const next = applyPlan(chat, plan);
  assert.deepEqual(names(next), ['Tabs', 'ChatRoom']);
  assert.deepEqual(chatRooms(next)[0].params, { id: 'room-2', tableLabel: 'T8' });
  assert.notEqual(chatRooms(next)[0].key, chat.routes[1].key);
});

test('plan: same room → popTo, same ChatRoom key', () => {
  const chat = inChat();
  const keyA = chat.routes[1].key;
  const withDms = router.getStateForAction(chat, CommonActions.navigate('DMs', { screen: 'DMInbox' }), options);
  const plan = planVenueChatNavigation(withDms.routes, 'room-1');
  assert.equal(plan.kind, 'popTo');
  const next = applyPlan(withDms, plan);
  assert.deepEqual(names(next), ['Tabs', 'ChatRoom']);
  assert.equal(chatRooms(next)[0].key, keyA);
});

test('plan: same room with a new table label → popTo updates the params, same key', () => {
  const chat = inChat();
  const plan = planVenueChatNavigation(chat.routes, 'room-1', 'T8');
  const next = applyPlan(chat, plan);
  assert.equal(chatRooms(next)[0].key, chat.routes[1].key);
  assert.deepEqual(chatRooms(next)[0].params, { id: 'room-1', tableLabel: 'T8' });
});
