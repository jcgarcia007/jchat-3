/**
 * JChat 3.0 — "my profile changed" (name / photo). The chat listens so my messages show the new name and photo at
 * once, without reloading the room.
 */

export interface MyProfileChange {
  userId: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

type Listener = (change: MyProfileChange) => void;
const listeners = new Set<Listener>();

export function emitMyProfileChanged(change: MyProfileChange): void {
  listeners.forEach((listener) => listener(change));
}

export function subscribeMyProfileChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
