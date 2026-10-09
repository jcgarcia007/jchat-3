"use client";

/**
 * /account/delete — delete your JChat account without the app (Google Play "account deletion URL").
 *
 * Needs a session (no session → login and back here). Business owners cannot continue: deleting the account would take
 * their venue with it (businesses.owner_id is ON DELETE CASCADE), so they must close or transfer it first — the same rule
 * the Privacy Policy and Support already state. Confirmation = typing DELETE / ELIMINAR, then the delete-account Edge
 * Function (the caller's JWT identifies the account) and sign-out.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { deleteMyAccount } from "@/lib/account";

type Phase = "checking" | "blocked" | "form" | "deleting" | "done";

const H1: React.CSSProperties = { fontSize: "28px", fontWeight: 800, color: "var(--gray-900)", marginBottom: "6px", letterSpacing: "-0.5px" };
const P: React.CSSProperties = { lineHeight: "1.7", marginTop: 0, marginBottom: "14px", color: "var(--gray-700)" };
const UL: React.CSSProperties = { lineHeight: "1.8", paddingLeft: "20px", marginTop: 0, marginBottom: "14px", color: "var(--gray-700)" };
const LINK: React.CSSProperties = { color: "var(--color-brand)", textDecoration: "underline" };

export function DeleteAccountClient() {
  const t = useTranslations("accountDelete");
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("checking");
  const [email, setEmail] = useState<string | null>(null);
  const [ownedNames, setOwnedNames] = useState<string[]>([]);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const word = t("confirmWord");

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!isSupabaseConfigured) { if (alive) setPhase("form"); return; }
      const { data: { user } } = await supabase.auth.getUser();
      if (!alive) return;
      if (!user) { router.replace(`/auth/login?next=${encodeURIComponent("/account/delete")}`); return; }
      setEmail(user.email ?? null);
      const { data: owned } = await supabase.from("businesses").select("name").eq("owner_id", user.id).limit(10);
      if (!alive) return;
      const names = (owned ?? []).map((b) => b.name as string);
      setOwnedNames(names);
      setPhase(names.length > 0 ? "blocked" : "form");
    })();
    return () => { alive = false; };
  }, [router]);

  const confirmed = typed.trim().toLowerCase() === word.toLowerCase();

  const remove = useCallback(async () => {
    if (!confirmed || phase !== "form") return;
    setPhase("deleting");
    setError(null);
    const ok = await deleteMyAccount();
    if (!ok) { setError(t("error")); setPhase("form"); return; }
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    setPhase("done");
  }, [confirmed, phase, t]);

  if (phase === "checking") return <p style={P}>{t("checking")}</p>;

  if (phase === "done") {
    return (
      <>
        <h1 style={H1}>{t("doneTitle")}</h1>
        <p style={P}>{t("doneBody")}</p>
        <Link href="/" style={LINK}>{t("goHome")}</Link>
      </>
    );
  }

  return (
    <>
      <h1 style={H1}>{t("title")}</h1>
      <p style={P}>{t("intro")}</p>

      <h2 style={{ fontSize: "18px", fontWeight: 700, margin: "24px 0 10px", color: "var(--gray-900)" }}>{t("whatTitle")}</h2>
      <ul style={UL}>
        <li>{t("what1")}</li>
        <li>{t("what2")}</li>
        <li>{t("what3")}</li>
        <li>{t("what4")}</li>
      </ul>
      <p style={P}>{t("irreversible")}</p>

      {phase === "blocked" ? (
        <div role="alert" style={{ padding: 14, borderRadius: 10, border: "1px solid var(--color-danger)", color: "var(--gray-900)" }}>
          <strong>{t("ownerTitle")}</strong>
          <p style={{ ...P, marginTop: 6 }}>{t("ownerBody", { names: ownedNames.join(", ") })}</p>
          <p style={{ ...P, marginBottom: 0 }}>
            {t("ownerHelp")} <a href="mailto:safety@jchat.cloud" style={LINK}>safety@jchat.cloud</a> · <Link href="/contact" style={LINK}>{t("contact")}</Link>
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {email && <p style={{ ...P, marginBottom: 0 }}>{t("account", { email })}</p>}
          <label style={{ color: "var(--gray-700)", fontSize: 14 }}>
            {t("typePrompt", { word })}
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              style={{ display: "block", width: "100%", marginTop: 6, padding: "10px 12px", fontSize: 16, borderRadius: 8, border: "1px solid var(--gray-300)", color: "var(--gray-900)" }}
            />
          </label>
          {error && <div role="alert" style={{ color: "var(--color-danger)", fontSize: 14 }}>{error}</div>}
          <button
            type="button"
            onClick={() => void remove()}
            disabled={!confirmed || phase === "deleting"}
            style={{
              minHeight: 46, borderRadius: 10, border: "none", background: "var(--color-danger)", color: "var(--bg-surface-light)",
              fontSize: 15, fontWeight: 700, cursor: confirmed ? "pointer" : "not-allowed", opacity: confirmed && phase !== "deleting" ? 1 : 0.45,
            }}
          >
            {phase === "deleting" ? t("deleting") : t("deleteButton")}
          </button>
          <Link href="/" style={{ ...LINK, textAlign: "center", fontSize: 14 }}>{t("cancel")}</Link>
        </div>
      )}
    </>
  );
}
