"use client";

/**
 * JChat 3.0 — /pricing/business. Business and Pro with a billing-period selector (monthly / 6 months / year) and a Custom card.
 *
 * Built and tested but NOT LINKED yet: BUSINESS_PLANS_HREF and the landing links still point at /pricing (they change together in spec 4,
 * see BUSINESS_PLANS_HREF_NEXT in lib/plans.ts). PUBLIC: anyone can read it; paying needs a session (the hook sends the guest to
 * /auth/login?next=/pricing/business). Checkout, promo codes and consent come from the shared hook (hooks/useBusinessCheckout.ts).
 *
 * Money: the amounts shown come from lib/businessPricing.ts (compared by a unit test with the Stripe prices of the phase-A script). The legal
 * line under each button follows the rule "today you pay $0, on {date} {amount} is charged": date = now + trial days (30, or the days of a valid
 * promo for that plan), formatted in the user's locale. A user who already used the free trial (users.trial_used_at) sees "Total today: {amount}".
 *
 * Hydration: the first-charge date depends on the clock, so the legal block renders after mount.
 * Accessibility: AA contrast on the --land-* palette (muted grey never carries text; teal text is #0F766E), 44px touch targets, visible focus.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import {
  IconAlertCircle,
  IconCheck,
  IconLoader2,
  IconMessageCircle2,
  IconTicket,
} from "@tabler/icons-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import CustomPlanForm from "@/components/pricing/CustomPlanForm";
import { useBusinessCheckout } from "@/hooks/useBusinessCheckout";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { CheckoutPlanId } from "@/lib/plans";
import {
  BILLING_INTERVALS,
  BUSINESS_INTERVALS,
  DEFAULT_TRIAL_DAYS,
  firstChargeAt,
  formatUsd,
  type BillingInterval,
} from "@/lib/businessPricing";

type CardId = CheckoutPlanId | "custom";

const INTERVAL_LABEL_KEY: Record<BillingInterval, string> = {
  month: "periodMonth",
  "6month": "periodSixMonths",
  year: "periodYear",
};
const CADENCE_KEY: Record<BillingInterval, string> = {
  month: "cadenceMonth",
  "6month": "cadenceSixMonths",
  year: "cadenceYear",
};
const BILLED_KEY: Record<BillingInterval, string> = {
  month: "billedMonth",
  "6month": "billedSixMonths",
  year: "billedYear",
};
const BADGE_KEY: Partial<Record<BillingInterval, string>> = { "6month": "saveSixMonths", year: "saveYear" };

const USD_EXACT = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export default function PricingBusinessPage() {
  const t = useTranslations("pricingBusiness");
  const tp = useTranslations("pricing");
  const locale = useLocale();
  const reduceMotion = useReducedMotion();

  const [period, setPeriod] = useState<BillingInterval>("month");
  // The Custom card opens the request form (phase D) instead of a mailto.
  const [formOpen, setFormOpen] = useState(false);
  // Clock-dependent bits render after mount (no hydration mismatch).
  const [nowMs, setNowMs] = useState<number | null>(null);
  // True when the signed-in user already had a free trial (users.trial_used_at): then the trial is not offered.
  const [trialUsed, setTrialUsed] = useState(false);

  const {
    loadingPlan,
    error,
    setError,
    consentAccepted,
    setConsentAccepted,
    promoCode,
    setPromoCode,
    promoInfo,
    setPromoInfo,
    promoError,
    setPromoError,
    promoChecking,
    checkPromo,
    handleSubscribe,
  } = useBusinessCheckout({ nextPath: `/pricing/business?interval=${period}` });

  useEffect(() => {
    setNowMs(Date.now());
    // The period chosen before logging in comes back as ?interval= (the hook puts it in the login's `next`).
    const back = new URLSearchParams(window.location.search).get("interval");
    if (back && (BILLING_INTERVALS as readonly string[]).includes(back)) setPeriod(back as BillingInterval);
    if (!isSupabaseConfigured) return;
    let alive = true;
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !alive) return;
      const { data } = await supabase.from("users").select("trial_used_at").eq("id", user.id).maybeSingle();
      if (alive && data?.trial_used_at) setTrialUsed(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const dateFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" });
  const cadence = t(CADENCE_KEY[period]);

  function trialDaysFor(plan: CheckoutPlanId): number {
    return promoInfo && promoInfo.plan === plan && promoInfo.trial_days > 0 ? promoInfo.trial_days : DEFAULT_TRIAL_DAYS;
  }

  const fadeUp = reduceMotion
    ? {}
    : { initial: { opacity: 0, y: 20 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-40px" } };

  const cards: { id: CardId; order: number }[] = [
    { id: "business", order: 1 },
    { id: "pro", order: 2 },
    { id: "custom", order: 3 },
  ];

  const faq = [1, 2, 3, 4].map((n) => ({ q: t(`faq.q${n}`), a: t(`faq.a${n}`) }));

  return (
    <div className="pb-root">
      <style>{`
        .pb-root {
          --pb-teal: #0F766E;
          --pb-stamp-border: #3B5BDB;
          min-height: 100vh; position: relative; overflow: hidden;
          background: var(--land-bg); color: var(--land-text);
        }
        .pb-root a:focus-visible, .pb-root button:focus-visible, .pb-root input:focus-visible, .pb-root summary:focus-visible {
          outline: 3px solid var(--land-text); outline-offset: 2px;
        }
        .pb-gtext {
          background: linear-gradient(135deg, var(--land-peach) 0%, var(--land-rose) 45%, var(--color-brand) 90%);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
        }
        .pb-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; align-items: stretch; }
        .pb-card { order: var(--pb-order); }
        @media (max-width: 860px) {
          .pb-grid { grid-template-columns: minmax(0, 1fr); max-width: 460px; margin: 0 auto; }
          .pb-card[data-plan="pro"] { order: 0; }   /* Pro first on phones */
          .pb-card[data-plan="business"] { order: 1; }
          .pb-card[data-plan="custom"] { order: 2; }
        }
        .pb-faq summary { cursor: pointer; list-style: none; min-height: 44px; display: flex; align-items: center; font-weight: 700; font-size: 15px; }
        .pb-faq summary::-webkit-details-marker { display: none; }
        @keyframes pb-spin { to { transform: rotate(360deg); } }
      `}</style>

      <div aria-hidden style={{ position: "absolute", top: -120, right: -80, width: 380, height: 380, borderRadius: "50%", background: "rgb(var(--land-peach-rgb) / .16)", filter: "blur(80px)", pointerEvents: "none" }} />
      <div aria-hidden style={{ position: "absolute", bottom: -120, left: -80, width: 380, height: 380, borderRadius: "50%", background: "rgb(var(--land-mint-rgb) / .16)", filter: "blur(80px)", pointerEvents: "none" }} />

      <header style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, maxWidth: 1040, margin: "0 auto", padding: "20px 16px" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit", minHeight: 44 }}>
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 10, background: "var(--land-peach)", color: "var(--on-brand)" }}>
            <IconMessageCircle2 size={18} aria-hidden />
          </span>
          <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-.02em" }}>{t("forBusiness")}</span>
        </Link>
        <LanguageSwitcher variant="pills" />
      </header>

      <main style={{ position: "relative", maxWidth: 1040, margin: "0 auto", padding: "8px 16px 56px" }}>
        {/* Hero */}
        <section style={{ textAlign: "center", marginBottom: 28 }}>
          <h1 style={{ fontFamily: "var(--font-grotesk), 'Space Grotesk', system-ui, sans-serif", fontSize: "clamp(30px, 6vw, 48px)", fontWeight: 700, letterSpacing: "-.04em", lineHeight: 1.1, margin: "0 0 12px" }}>
            {t("heroTitle1")} <span className="pb-gtext">{t("heroTitle2")}</span>
          </h1>
          <p style={{ fontSize: 16, lineHeight: 1.55, color: "var(--land-sub)", maxWidth: 560, margin: "0 auto" }}>{t("heroSubtitle")}</p>
        </section>

        {/* Billing period */}
        <div role="radiogroup" aria-label={t("periodLabel")} style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 8, marginBottom: 28 }}>
          {BILLING_INTERVALS.map((value) => {
            const active = value === period;
            const badgeKey = BADGE_KEY[value];
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setPeriod(value)}
                style={{
                  minHeight: 44, padding: "0 18px", borderRadius: 999, cursor: "pointer", fontSize: 15, fontWeight: 700,
                  display: "inline-flex", alignItems: "center", gap: 8,
                  border: active ? "2px solid var(--land-text)" : "2px solid rgb(var(--ink-rgb) / .14)",
                  background: active ? "var(--land-text)" : "rgb(var(--white-rgb))",
                  color: active ? "var(--on-brand)" : "var(--land-text)",
                }}
              >
                {t(INTERVAL_LABEL_KEY[value])}
                {badgeKey && (
                  <span style={{ fontSize: 12, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: active ? "rgb(var(--white-rgb))" : "rgb(var(--land-mint-rgb) / .35)", color: "var(--pb-teal)" }}>
                    {t(badgeKey)}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Consent (same text as /pricing) — before the cards: the terms are disclosed before any payment data is collected. */}
        <div style={{ maxWidth: 720, margin: "0 auto 24px", background: "var(--land-glass)", border: "1px solid rgb(var(--ink-rgb) / .08)", borderRadius: 14, padding: "16px 18px", boxShadow: "0 4px 20px rgb(var(--ink-rgb) / .06)" }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{tp("business.consentTitle")}</div>
          <p style={{ fontSize: 13, color: "var(--land-sub)", margin: "0 0 8px", lineHeight: 1.6 }}>{tp("business.consentBody")}</p>
          <p style={{ fontSize: 13, color: "var(--land-sub)", margin: "0 0 12px", lineHeight: 1.6 }}>{t("consentPeriodNote", { cadence })}</p>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", fontSize: 13, lineHeight: 1.5, minHeight: 44 }}>
            <input
              type="checkbox"
              checked={consentAccepted}
              onChange={(e) => {
                setConsentAccepted(e.target.checked);
                setError(null);
              }}
              style={{ marginTop: 2, width: 18, height: 18, flexShrink: 0, cursor: "pointer" }}
            />
            <span>{tp("business.consentCheck")}</span>
          </label>
        </div>

        {error && (
          <div role="alert" style={{ display: "flex", alignItems: "center", gap: 8, maxWidth: 720, margin: "0 auto 16px", padding: "10px 14px", borderRadius: 8, background: "color-mix(in srgb, var(--color-danger) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--color-danger) 25%, transparent)", color: "var(--land-text)", fontSize: 13 }}>
            <IconAlertCircle size={16} aria-hidden style={{ color: "var(--color-danger)", flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Plans */}
        <div className="pb-grid">
          {cards.map(({ id, order }, idx) => {
            const isPro = id === "pro";
            const isCustom = id === "custom";
            const features = [1, 2, 3, 4, 5, 6].map((n) => t(`${id}.f${n}`));
            const price = isCustom ? null : BUSINESS_INTERVALS[id][period];
            const busy = !isCustom && loadingPlan === id;
            const blocked = !isCustom && !consentAccepted;
            const days = isCustom ? 0 : trialDaysFor(id);
            const ctaLabel = trialUsed ? t("ctaSubscribe") : days !== DEFAULT_TRIAL_DAYS ? t("ctaTrialDays", { days }) : t("ctaTrial");
            return (
              <motion.section
                key={id}
                {...fadeUp}
                transition={{ delay: idx * 0.08, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className="pb-card"
                data-plan={id}
                aria-labelledby={`pb-${id}-name`}
                style={{
                  ["--pb-order" as string]: order,
                  position: "relative", display: "flex", flexDirection: "column", gap: 14, padding: 22, borderRadius: 18,
                  background: "rgb(var(--white-rgb) / .96)",
                  border: isPro ? "2px solid var(--land-peach)" : "1px solid rgb(var(--ink-rgb) / .10)",
                  boxShadow: "var(--land-shadow)",
                }}
              >
                {isPro && (
                  <span
                    aria-hidden
                    style={{
                      position: "absolute", top: 14, right: 14, transform: "rotate(-12deg)",
                      border: "3px solid var(--pb-stamp-border)", color: "var(--land-peach)", borderRadius: 6, padding: "2px 10px",
                      fontFamily: "var(--font-big-shoulders), 'Big Shoulders Display', Impact, sans-serif", fontWeight: 800,
                      fontSize: 18, letterSpacing: ".06em", lineHeight: 1.1, background: "rgb(var(--white-rgb))",
                    }}
                  >
                    {t("stamp")}
                  </span>
                )}

                <div>
                  <h2 id={`pb-${id}-name`} style={{ fontFamily: "var(--font-grotesk), system-ui, sans-serif", fontSize: 22, fontWeight: 700, margin: "0 0 2px", paddingRight: isPro ? 110 : 0 }}>
                    {t(`${id}.name`)}
                  </h2>
                  <p style={{ fontSize: 13, color: "var(--land-sub)", margin: 0 }}>{t(`${id}.tagline`)}</p>
                </div>

                {/* Price */}
                {price ? (
                  <div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                      <span style={{ fontFamily: "var(--font-grotesk), system-ui, sans-serif", fontSize: 44, fontWeight: 700, letterSpacing: "-.04em", lineHeight: 1 }}>
                        {formatUsd(price.monthlyCents)}
                      </span>
                      <span style={{ fontSize: 15, color: "var(--land-sub)" }}>{t("perMonth")}</span>
                    </div>
                    <p style={{ fontSize: 13, color: "var(--land-sub)", margin: "6px 0 0", minHeight: 20 }}>
                      {t(BILLED_KEY[period], { amount: formatUsd(price.totalCents) })}
                    </p>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontFamily: "var(--font-grotesk), system-ui, sans-serif", fontSize: 30, fontWeight: 700, letterSpacing: "-.03em", lineHeight: 1.1 }}>{t("customPrice")}</div>
                    <p style={{ fontSize: 13, color: "var(--land-sub)", margin: "6px 0 0", minHeight: 20 }}>{t("customHint")}</p>
                  </div>
                )}

                {/* Features */}
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8, flexGrow: 1 }}>
                  {features.map((feature) => (
                    <li key={feature} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 14, lineHeight: 1.4, color: "var(--land-text)" }}>
                      <IconCheck size={16} aria-hidden style={{ color: "var(--pb-teal)", flexShrink: 0, marginTop: 2 }} />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                {isCustom ? (
                  <button
                    type="button"
                    onClick={() => setFormOpen(true)}
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 48, borderRadius: 10, border: "2px solid var(--land-text)", color: "var(--land-text)", background: "transparent", fontSize: 15, fontWeight: 700, cursor: "pointer" }}
                  >
                    {t("ctaProposal")}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleSubscribe(id, period)}
                      disabled={busy || blocked}
                      title={blocked ? tp("business.consentRequiredHint") : undefined}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 48, borderRadius: 10, border: "none",
                        background: "var(--land-peach)", color: "var(--on-brand)", fontSize: 15, fontWeight: 700,
                        cursor: busy ? "wait" : blocked ? "not-allowed" : "pointer", opacity: blocked ? 0.55 : 1,
                      }}
                    >
                      {busy ? (
                        <>
                          <IconLoader2 size={16} aria-hidden style={{ animation: "pb-spin 1s linear infinite" }} />
                          {t("ctaRedirecting")}
                        </>
                      ) : (
                        ctaLabel
                      )}
                    </button>

                    {/* Legal line (compulsory under the buttons). Rendered after mount: the date depends on the clock. */}
                    <div style={{ minHeight: 64, fontSize: 13, lineHeight: 1.5, color: "var(--land-sub)" }} data-testid={`legal-${id}`}>
                      {nowMs !== null && price && (
                        <>
                          {trialUsed ? (
                            <p style={{ margin: "0 0 4px" }}>{t("legalRenews", { cadence })}</p>
                          ) : (
                            <p style={{ margin: "0 0 4px" }}>
                              {t("legalTrial", {
                                date: dateFmt.format(firstChargeAt(nowMs, days)),
                                amount: formatUsd(price.totalCents),
                                cadence,
                              })}
                            </p>
                          )}
                          <p style={{ margin: 0, fontWeight: 700, color: "var(--land-text)" }}>
                            {t("totalToday", { amount: USD_EXACT.format(trialUsed ? price.totalCents / 100 : 0) })}
                          </p>
                        </>
                      )}
                    </div>
                  </>
                )}
              </motion.section>
            );
          })}
        </div>

        {!consentAccepted && (
          <p style={{ textAlign: "center", fontSize: 13, color: "var(--land-sub)", margin: "14px 0 0" }}>{tp("business.consentRequiredHint")}</p>
        )}

        {/* Promo code (same behavior as /pricing; applies to any billing period) */}
        <div style={{ maxWidth: 560, margin: "32px auto 0", background: "var(--land-glass)", border: "1px solid rgb(var(--ink-rgb) / .08)", borderRadius: 14, padding: 20, boxShadow: "0 4px 24px rgb(var(--ink-rgb) / .07)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <IconTicket size={18} aria-hidden style={{ color: "var(--land-peach)" }} />
            <span style={{ fontSize: 15, fontWeight: 700 }}>{tp("business.promoTitle")}</span>
          </div>
          <p style={{ fontSize: 13, color: "var(--land-sub)", margin: "0 0 12px", lineHeight: 1.5 }}>{tp("business.promoBody")}</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              value={promoCode}
              onChange={(e) => {
                const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
                setPromoCode(v);
                setPromoInfo(null);
                setPromoError(null);
              }}
              aria-label={tp("business.promoTitle")}
              placeholder={tp("business.promoPlaceholder")}
              maxLength={12}
              style={{ flex: "1 1 200px", minHeight: 44, padding: "0 12px", borderRadius: 8, border: "1px solid rgb(var(--ink-rgb) / .25)", background: "rgb(var(--white-rgb))", color: "var(--land-text)", fontSize: 14, fontFamily: "var(--font-mono, monospace)", letterSpacing: 1 }}
            />
            <button
              type="button"
              onClick={() => void checkPromo(promoCode.trim())}
              disabled={promoChecking || promoCode.trim().length === 0}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 44, padding: "0 18px", borderRadius: 8, border: "none", background: "var(--land-text)", color: "var(--on-brand)", fontSize: 14, fontWeight: 700, cursor: promoChecking ? "wait" : "pointer", opacity: promoChecking || promoCode.trim().length === 0 ? 0.6 : 1 }}
            >
              {promoChecking && <IconLoader2 size={14} aria-hidden style={{ animation: "pb-spin 1s linear infinite" }} />}
              {promoChecking ? tp("business.promoChecking") : tp("business.promoCheck")}
            </button>
          </div>
          {promoInfo && (
            <div role="status" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, padding: "10px 14px", borderRadius: 8, background: "rgb(var(--land-mint-rgb) / .22)", border: "1px solid rgb(var(--land-mint-rgb) / .5)", color: "var(--pb-teal)", fontSize: 13, fontWeight: 600 }}>
              <IconCheck size={15} aria-hidden />
              <span>{tp("business.promoValidText", { days: promoInfo.trial_days, plan: promoInfo.plan })}</span>
            </div>
          )}
          {promoError && (
            <div role="alert" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, padding: "10px 14px", borderRadius: 8, background: "color-mix(in srgb, var(--color-danger) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--color-danger) 25%, transparent)", color: "var(--land-text)", fontSize: 13 }}>
              <IconAlertCircle size={15} aria-hidden style={{ color: "var(--color-danger)", flexShrink: 0 }} />
              <span>{promoError}</span>
            </div>
          )}
        </div>

        {/* FAQ */}
        <section aria-labelledby="pb-faq-title" style={{ maxWidth: 720, margin: "48px auto 0" }}>
          <h2 id="pb-faq-title" style={{ fontFamily: "var(--font-grotesk), system-ui, sans-serif", fontSize: 26, fontWeight: 700, letterSpacing: "-.03em", margin: "0 0 12px" }}>
            {t("faqTitle")}
          </h2>
          <div className="pb-faq" style={{ display: "grid", gap: 8 }}>
            {faq.map((item) => (
              <details key={item.q} style={{ background: "rgb(var(--white-rgb) / .96)", border: "1px solid rgb(var(--ink-rgb) / .10)", borderRadius: 12, padding: "0 16px" }}>
                <summary>{item.q}</summary>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--land-sub)", margin: "0 0 14px" }}>{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <CustomPlanForm open={formOpen} onClose={() => setFormOpen(false)} />

      <footer style={{ position: "relative", borderTop: "1px solid rgb(var(--ink-rgb) / .10)", padding: "20px 16px", display: "flex", justifyContent: "center", gap: 24, flexWrap: "wrap", fontSize: 14 }}>
        <Link href="/terms" style={{ color: "var(--land-sub)", minHeight: 44, display: "inline-flex", alignItems: "center" }}>{tp("footer.terms")}</Link>
        <Link href="/privacy" style={{ color: "var(--land-sub)", minHeight: 44, display: "inline-flex", alignItems: "center" }}>{tp("footer.privacy")}</Link>
        <Link href="/support" style={{ color: "var(--land-sub)", minHeight: 44, display: "inline-flex", alignItems: "center" }}>{tp("footer.support")}</Link>
      </footer>
    </div>
  );
}
