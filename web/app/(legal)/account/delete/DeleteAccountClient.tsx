"use client";

/**
 * /account/delete — delete your JChat account without the app (Google Play "account deletion URL").
 *
 * Needs a session (no session → login and back here). Venue owners CAN delete (D4): their venues are closed, not deleted (orders and
 * payments stay 7 years without personal data), the subscription is cancelled and Stripe is disconnected. The page asks the delete-account
 * function first (GET, changes nothing): an owner sees what will happen and a required checkbox; money still at Stripe or open orders block
 * with a message. Confirmation = typing DELETE / ELIMINAR, then the delete-account Edge Function (the caller's JWT identifies the account)
 * and sign-out.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { checkOwnerDeletion, deleteMyAccountDetailed, deleteOwnerAccount, formatMoney, type OwnerBlocker } from "@/lib/account";

type Phase = "checking" | "blocked" | "form" | "deleting" | "done";

/** What the owner block shows instead of the form: the venues that close, or the thing that blocks. */
interface OwnerState { names: string[]; blocker: OwnerBlocker | null }

const H1: React.CSSProperties = { fontSize: "28px", fontWeight: 800, color: "var(--gray-900)", marginBottom: "6px", letterSpacing: "-0.5px" };
const P: React.CSSProperties = { lineHeight: "1.7", marginTop: 0, marginBottom: "14px", color: "var(--gray-700)" };
const UL: React.CSSProperties = { lineHeight: "1.8", paddingLeft: "20px", marginTop: 0, marginBottom: "14px", color: "var(--gray-700)" };
const LINK: React.CSSProperties = { color: "var(--color-brand)", textDecoration: "underline" };

export function DeleteAccountClient() {
  const t = useTranslations("accountDelete");
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("checking");
  const [email, setEmail] = useState<string | null>(null);
  const locale = useLocale();
  const [owner, setOwner] = useState<OwnerState | null>(null);
  const [ownerChecked, setOwnerChecked] = useState(false);
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
      const check = await checkOwnerDeletion();
      if (!alive) return;
      if (check.kind === "owner") setOwner({ names: check.venues.map((v) => v.name), blocker: null });
      else if (check.kind === "open_orders" || check.kind === "balance") setOwner({ names: [], blocker: check });
      else if (check.kind === "error" && check.code === "stripe_balance_check_failed") { setError(t("ownerError", { code: check.code })); }
      setPhase("form");
    })();
    return () => { alive = false; };
  }, [router]);

  const isOwner = !!owner && owner.names.length > 0;
  const blocker = owner?.blocker ?? null;
  const confirmed = typed.trim().toLowerCase() === word.toLowerCase() && (!isOwner || ownerChecked);

  const remove = useCallback(async () => {
    if (!confirmed || phase !== "form") return;
    setPhase("deleting");
    setError(null);
    if (owner && owner.names.length > 0) {
      const r = await deleteOwnerAccount();
      if (r.result === "blocked") { setOwner({ names: [], blocker: r.blocker }); setPhase("form"); return; }
      if (r.result === "error") { setError(t("ownerError", { code: r.code })); setPhase("form"); return; }
    } else {
      const result = await deleteMyAccountDetailed();
      // An older function refuses an owner's delete (409 owns_business) and touches nothing: say so with a code instead of a dead end.
      if (result === "owns_business") { setError(t("ownerError", { code: "owner_has_business" })); setPhase("form"); return; }
      if (result !== "ok") { setError(t("error")); setPhase("form"); return; }
    }
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    setPhase("done");
  }, [confirmed, phase, owner, t]);

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

      {blocker ? (
        <div role="alert" style={{ padding: 14, borderRadius: 10, border: "1px solid var(--color-danger)", color: "var(--gray-900)" }}>
          <p style={{ ...P, marginBottom: 0 }}>
            {blocker.kind === "balance"
              ? t("ownerBalance", { amount: blocker.totals.map((x) => formatMoney(x.amount, x.currency, locale)).join(" + ") })
              : t("ownerOpen")}
          </p>
          <Link href="/" style={{ ...LINK, display: "inline-block", marginTop: 12, fontSize: 14 }}>{t("cancel")}</Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {email && <p style={{ ...P, marginBottom: 0 }}>{t("account", { email })}</p>}
          {isOwner && owner ? (
            <div style={{ padding: 14, borderRadius: 10, border: "1px solid var(--color-danger)", color: "var(--gray-900)" }}>
              <strong>{t("ownerTitle")}</strong>
              <p style={{ ...P, marginTop: 6 }}>{t("ownerBody", { names: owner.names.join(", ") })}</p>
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", minHeight: 44, cursor: "pointer", color: "var(--gray-900)" }}>
                <input type="checkbox" checked={ownerChecked} onChange={(e) => setOwnerChecked(e.target.checked)} style={{ width: 20, height: 20, marginTop: 2 }} />
                <span>{t("ownerCheckbox")}</span>
              </label>
            </div>
          ) : null}
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
            {phase === "deleting" ? (isOwner ? t("ownerDeleteButtonBusy") : t("deleting")) : isOwner ? t("ownerButton") : t("deleteButton")}
          </button>
          <Link href="/" style={{ ...LINK, textAlign: "center", fontSize: 14 }}>{t("cancel")}</Link>
          {isOwner ? (
            <p style={{ ...P, marginBottom: 0, fontSize: 14 }}>
              {t("ownerHelp")} <a href="mailto:safety@jchat.cloud" style={LINK}>safety@jchat.cloud</a> · <Link href="/contact" style={LINK}>{t("contact")}</Link>
            </p>
          ) : null}
        </div>
      )}
    </>
  );
}
