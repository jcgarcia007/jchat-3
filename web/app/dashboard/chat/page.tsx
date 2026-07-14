/**
 * JChat 3.0 — Live chat view for a single room.
 *
 * This route is the destination of the "Open Chat" action in
 * /dashboard/chat-rooms (link: /dashboard/chat?room=<id>). With `?room=<id>` it
 * renders <LiveChat> for that room. Without `?room=` there is nothing to show,
 * so it redirects to the room list at /dashboard/chat-rooms.
 *
 * The old in-page "Room Manager" (Task 2.7) was dead code — it queried a
 * hardcoded `demo-business-id` that never existed, enforced a client-side plan
 * limit, and had a "password protected" toggle that never hashed anything — and
 * has been removed. /dashboard/chat-rooms is its functional replacement
 * (resolves the real business, lists/creates rooms, real QR tokens, themes).
 *
 * Design: var(--db-*) tokens only. "use client".
 */

"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LiveChat } from "@/components/dashboard/LiveChat";

export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatRouter />
    </Suspense>
  );
}

function ChatRouter() {
  const params = useSearchParams();
  const router = useRouter();
  const roomId = params.get("room");

  // No room selected → this route isn't a standalone screen; send the owner to
  // the room list (the real management page).
  useEffect(() => {
    if (!roomId) router.replace("/dashboard/chat-rooms");
  }, [roomId, router]);

  if (roomId) return <LiveChat roomId={roomId} />;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "40vh",
        color: "var(--db-text-secondary)",
        fontSize: 14,
      }}
    >
      Redirecting to Chat rooms…
    </div>
  );
}
