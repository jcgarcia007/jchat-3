import { createSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { requireAgeConfirmed } from "@/lib/age";

// 18+ gate for /business/* (register wizard, verification). The pages are client
// components that handle their own signed-out state; this only blocks a SIGNED-IN
// user who has not confirmed their age.
export default async function BusinessLayout({ children }: { children: React.ReactNode }) {
  if (isSupabaseConfigured) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      // A layout can't know which child route was requested; the register wizard is the entry point.
      await requireAgeConfirmed(supabase, user.id, "/business/register");
    }
  }
  return children;
}
