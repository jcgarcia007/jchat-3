// Navigation contract for the DM shortcut of the venue chat (React Navigation 7 StackRouter, the same
// router the MainStack uses). Run from mobile/:  node --test scripts/nav-dm-stack.test.mjs
//
// It checks, on the real router state, that:
//  - opening Messages from the chat PUSHES DMs on top of ChatRoom (no reset / popToTop),
//  - going back returns to the SAME ChatRoom route (same key => React keeps the mounted screen),
//  - "Volver al chat" from a DM screen must use popTo (navigate would stack a second ChatRoom),
//  - popTo is only safe when a ChatRoom exists in the stack (AppNavigator.openVenueChat checks that).

import assert from 'node:assert/strict';
import test from 'node:test';
import { CommonActions, StackActions, StackRouter } from '@react-navigation/routers';

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
