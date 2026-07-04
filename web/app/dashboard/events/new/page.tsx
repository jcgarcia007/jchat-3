"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Events are now created through the unified registration wizard in event mode.
// This route just forwards to it.
export default function NewEventRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/business/register?type=event");
  }, [router]);
  return null;
}
