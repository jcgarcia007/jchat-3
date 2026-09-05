import { IconMessageCircle2, IconMapPin } from "@tabler/icons-react";

/**
 * Split-screen shell for auth pages.
 * Left panel: brand identity — light pastel/peach gradient, animated blobs (md+).
 * Right column: form content — data-theme="light" activates the Design System's
 *   light token set automatically (tokens.css §1.3). Only --color-brand and
 *   --bg-overlay are additionally overridden here for the auth context.
 * Login / register pages are NOT modified — all visual changes come from
 * the token overrides cascading through the CSS custom property system.
 */

export default function AuthSplitLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
         * --color-brand  → peach/coral instead of brand indigo
         * --bg-overlay   → translucent dark instead of #f2f2f7 (light elevated)
         *                  so card box-shadow reads as a real shadow, not white.
         */
        .auth-col[data-theme="light"] {
          --color-brand:      #FF8A65;
          --color-brand-dark: #FF7043;
          --bg-overlay:       rgba(0,0,0,.08);
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
          border-color: #FF8A65 !important;
          box-shadow: 0 0 0 3px rgba(255,138,101,.18) !important;
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
          className="hidden md:flex"
          style={{
            width: "42%",
            flexShrink: 0,
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "48px 40px",
            /* Pastel gradient: peach → mint → sky — mirrors the landing page */
            background:
              "linear-gradient(145deg, #FFF5F2 0%, #FFF0EB 35%, #F0FDF9 70%, #EFF6FF 100%)",
            color: "#111827",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Pastel blob — peach (top-right) */}
          <div
            style={{
              position: "absolute",
              top: -60,
              right: -60,
              width: 280,
              height: 280,
              borderRadius: "50%",
              background: "rgba(255,138,101,.16)",
              filter: "blur(64px)",
              animation: "auth-ba 9s ease-in-out infinite",
              zIndex: 0,
              pointerEvents: "none",
            }}
          />
          {/* Pastel blob — mint (bottom-left) */}
          <div
            style={{
              position: "absolute",
              bottom: -80,
              left: -40,
              width: 240,
              height: 240,
              borderRadius: "50%",
              background: "rgba(94,234,212,.14)",
              filter: "blur(54px)",
              animation: "auth-bb 11s ease-in-out infinite",
              zIndex: 0,
              pointerEvents: "none",
            }}
          />
          {/* Pastel blob — sky (bottom-right accent) */}
          <div
            style={{
              position: "absolute",
              bottom: 100,
              right: 10,
              width: 160,
              height: 160,
              borderRadius: "50%",
              background: "rgba(147,197,253,.16)",
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
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 44,
                height: 44,
                borderRadius: 12,
                background: "linear-gradient(135deg, #FF8A65, #FF7043)",
                boxShadow: "0 4px 18px rgba(255,112,67,.32)",
                flexShrink: 0,
              }}
            >
              <IconMessageCircle2 size={24} color="#fff" />
            </span>
            <span
              style={{
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: "-0.5px",
                color: "#111827",
              }}
            >
              JChat
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
                color: "#111827",
              }}
            >
              Tu venue,
              <br />
              en el bolsillo
              <br />
              de cada cliente
            </h2>
            <p
              style={{
                fontSize: 16,
                lineHeight: 1.65,
                color: "#4B5563",
                margin: 0,
                maxWidth: 300,
              }}
            >
              Chats por ubicación, pedidos y pagos,
              <br />
              en un solo lugar.
            </p>
          </div>

          {/* Footer tagline */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              color: "#9CA3AF",
              fontSize: 13,
              position: "relative",
              zIndex: 1,
            }}
          >
            <IconMapPin size={15} />
            <span>Social por ubicación</span>
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
