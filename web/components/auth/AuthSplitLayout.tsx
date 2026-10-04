import { useTranslations } from "next-intl";
import { IconMessageCircle2, IconMapPin, IconReceipt2 } from "@tabler/icons-react";

/**
 * Split-screen shell for auth pages.
 * Left panel: brand identity — light pastel/peach gradient, animated blobs (md+).
 * Right column: form content — data-theme="light" activates the Design System's
 *   light token set automatically (tokens.css §1.3). Only --bg-overlay is
 *   additionally overridden here (the brand color is the global indigo).
 * Login / register pages are NOT modified — all visual changes come from
 * the token overrides cascading through the CSS custom property system.
 * Brand skin: under data-brand="tabpos" (root layout, by request host)
 *   styles/brands/tabpos.css restyles the `.auth-brand-panel` / `.auth-col`
 *   hooks and swaps the `.brand-jchat` / `.brand-tabpos` copy. Both copies
 *   are always in the DOM so SSR and hydration never branch on the host.
 */

export default function AuthSplitLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations("authPages.panel");
  return (
    <>
      <style>{`
        /* Blob drift animations for the left panel */
        @keyframes auth-ba {
          0%,100% { transform: translate(0,0) scale(1); }
          50%      { transform: translate(22px,-14px) scale(1.04); }
        }
        @keyframes auth-bb {
          0%,100% { transform: translate(0,0) scale(1); }
          50%      { transform: translate(-18px,16px) scale(1.03); }
        }

        /*
         * .auth-col overrides applied ON TOP of data-theme="light" tokens.
         * Selector specificity (0,2,0) beats [data-theme="light"] (0,1,0).
         *
         * --bg-overlay   → translucent dark instead of #f2f2f7 (light elevated)
         *                  so card box-shadow reads as a real shadow, not white.
         */
        .auth-col[data-theme="light"] {
          --bg-overlay:       rgb(var(--ink-rgb) / .08);
        }

        /*
         * Propagate the light text-primary as the inherited CSS color property.
         * Without this, elements like <h1> that have no explicit color inherit
         * the body's dark-mode value (#f5f5f7) instead of the overridden one.
         */
        .auth-col {
          color: var(--text-primary);
        }

        /* Peach focus ring on all form controls inside the auth column */
        .auth-col input:focus,
        .auth-col select:focus {
          outline: none;
          border-color: var(--land-peach) !important;
          box-shadow: 0 0 0 3px rgb(var(--land-peach-rgb) / .18) !important;
        }
      `}</style>

      <div
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          overflow: "hidden",
        }}
      >
        {/* ── Brand panel (desktop only) ────────────────────────────────── */}
        <aside
          className="auth-brand-panel hidden md:flex"
          style={{
            width: "42%",
            flexShrink: 0,
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "48px 40px",
            /* Pastel gradient: peach → mint → sky — mirrors the landing page */
            background:
              "linear-gradient(145deg, var(--land-tint-peach) 0%, var(--land-tint-peach-2) 35%, var(--land-tint-mint) 70%, var(--land-tint-sky) 100%)",
            color: "var(--gray-900)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Pastel blob — peach (top-right) */}
          <div
            className="auth-blob"
            style={{
              position: "absolute",
              top: -60,
              right: -60,
              width: 280,
              height: 280,
              borderRadius: "50%",
              background: "rgb(var(--land-peach-rgb) / .16)",
              filter: "blur(64px)",
              animation: "auth-ba 9s ease-in-out infinite",
              zIndex: 0,
              pointerEvents: "none",
            }}
          />
          {/* Pastel blob — mint (bottom-left) */}
          <div
            className="auth-blob"
            style={{
              position: "absolute",
              bottom: -80,
              left: -40,
              width: 240,
              height: 240,
              borderRadius: "50%",
              background: "rgb(var(--land-mint-rgb) / .14)",
              filter: "blur(54px)",
              animation: "auth-bb 11s ease-in-out infinite",
              zIndex: 0,
              pointerEvents: "none",
            }}
          />
          {/* Pastel blob — sky (bottom-right accent) */}
          <div
            className="auth-blob"
            style={{
              position: "absolute",
              bottom: 100,
              right: 10,
              width: 160,
              height: 160,
              borderRadius: "50%",
              background: "rgb(var(--land-sky-rgb) / .16)",
              filter: "blur(44px)",
              zIndex: 0,
              pointerEvents: "none",
            }}
          />

          {/* Logo */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              position: "relative",
              zIndex: 1,
            }}
          >
            <span
              className="auth-logo-icon"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 44,
                height: 44,
                borderRadius: 12,
                background: "linear-gradient(135deg, var(--land-peach), var(--land-peach-dark))",
                boxShadow: "0 4px 18px rgb(var(--land-peach-dark-rgb) / .32)",
                flexShrink: 0,
              }}
            >
              <IconMessageCircle2 className="brand-jchat" size={24} color="var(--on-brand)" />
              <IconReceipt2 className="brand-tabpos" size={24} />
            </span>
            <span
              className="auth-logo-name"
              style={{
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: "-0.5px",
                color: "var(--gray-900)",
              }}
            >
              <span className="brand-jchat">JChat</span>
              <span className="brand-tabpos">Tab POS</span>
            </span>
          </div>

          {/* Main copy */}
          <div style={{ position: "relative", zIndex: 1 }}>
            <h2
              style={{
                fontSize: 34,
                fontWeight: 800,
                lineHeight: 1.15,
                letterSpacing: "-0.5px",
                margin: "0 0 16px",
                color: "var(--gray-900)",
              }}
            >
              <span className="brand-jchat">
                {t("jchatHeadline1")}
                <br />
                {t("jchatHeadline2")}
                <br />
                {t("jchatHeadline3")}
              </span>
              <span className="brand-tabpos">
                {t("tabposHeadline1")}
                <br />
                {t.rich("tabposHeadline2", { em: (chunks) => <em>{chunks}</em> })}
              </span>
            </h2>
            <p
              style={{
                fontSize: 16,
                lineHeight: 1.65,
                color: "var(--gray-600)",
                margin: 0,
                maxWidth: 300,
              }}
            >
              <span className="brand-jchat">
                {t("jchatBody1")}
                <br />
                {t("jchatBody2")}
              </span>
              <span className="brand-tabpos">
                {t("tabposBody1")}
                <br />
                {t("tabposBody2")}
              </span>
            </p>
          </div>

          {/* Footer tagline */}
          <div
            className="auth-panel-foot"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              color: "var(--gray-400)",
              fontSize: 13,
              position: "relative",
              zIndex: 1,
            }}
          >
            <IconMapPin className="brand-jchat" size={15} />
            <span className="brand-jchat">{t("jchatFoot")}</span>
            <span className="brand-tabpos">{t("tabposFoot")}</span>
          </div>
        </aside>

        {/* ── Form column ──────────────────────────────────────────────── */}
        {/*
         * data-theme="light" activates the Design System's light surface/text
         * tokens (tokens.css §[data-theme="light"]) for this subtree.
         * .auth-col adds peach brand + correct shadow overlay on top.
         */}
        <main
          className="auth-col flex-1 flex items-center justify-center overflow-y-auto"
          data-theme="light"
          style={{
            background: "var(--bg-base)",   /* resolves to #f9f9fb in light theme */
            padding: "32px 24px",
          }}
        >
          {children}
        </main>
      </div>
    </>
  );
}
