/**
 * JChat 3.0 — how "open this venue's chat" must change the MainStack. Pure (no navigation objects), so the
 * router contract is unit-tested in scripts/nav-dm-stack.test.mjs.
 *
 * ChatRoomScreen cannot switch rooms without remounting (rootRoomId, the entry gate, its subscriptions come
 * from the first render), so an existing ChatRoom is only reused for the SAME room:
 *   - 'popTo'    a ChatRoom with this id is in the stack → go back to it (new tableLabel included).
 *   - 'replace'  a ChatRoom with ANOTHER id is in the stack → drop it and everything above it, and mount a
 *                new instance (`keep` = how many routes stay below the first ChatRoom).
 *   - 'navigate' no ChatRoom in the stack → a plain push.
 */

export interface ChatRoomParams {
  id: string;
  tableLabel?: string;
}

export interface StackRouteLike {
  name: string;
  params?: object | undefined;
}

export type VenueChatNavPlan =
  | { kind: 'popTo'; params: ChatRoomParams }
  | { kind: 'replace'; params: ChatRoomParams; keep: number }
  | { kind: 'navigate'; params: ChatRoomParams };

export function planVenueChatNavigation(
  routes: readonly StackRouteLike[],
  roomId: string,
  tableLabel?: string,
): VenueChatNavPlan {
  const params: ChatRoomParams = tableLabel ? { id: roomId, tableLabel } : { id: roomId };
  const chatIndexes = routes.flatMap((route, index) => (route.name === 'ChatRoom' ? [index] : []));
  if (chatIndexes.length === 0) return { kind: 'navigate', params };

  const sameRoom = chatIndexes.some((index) => (routes[index].params as { id?: string } | undefined)?.id === roomId);
  if (sameRoom) return { kind: 'popTo', params };
  return { kind: 'replace', params, keep: chatIndexes[0] };
}
