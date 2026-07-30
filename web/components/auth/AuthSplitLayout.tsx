import { IconMessageCircle2, IconMapPin } from "@tabler/icons-react";

/**
 * Split-screen shell for auth pages.
 * Left panel: brand identity (visible md+, hidden on mobile).
 * Right column: form content passed as children.
 * Uses position:fixed to escape AuthLayout's centering wrapper.
 */
export default function AuthSplitLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        overflow: "hidden",
      }}
    >
      {/* ── Brand panel (desktop only) ── */}
      <aside
        className="hidden md:flex"
        style={{
          width: "42%",
          flexShrink: 0,
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "48px 40px",
          background: "#4338CA",
          color: "#fff",
        }}
      >
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "rgba(255,255,255,0.15)",
              flexShrink: 0,
            }}
          >
            <IconMessageCircle2 size={24} color="#fff" />
          </span>
          <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.5px" }}>
            JChat
          </span>
        </div>

        {/* Main copy */}
        <div>
          <h2
            style={{
              fontSize: 34,
              fontWeight: 800,
              lineHeight: 1.15,
              letterSpacing: "-0.5px",
              margin: "0 0 16px",
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
              color: "rgba(255,255,255,0.72)",
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
            color: "rgba(255,255,255,0.50)",
            fontSize: 13,
          }}
        >
          <IconMapPin size={15} />
          <span>Social por ubicación</span>
        </div>
      </aside>

      {/* ── Form column ── */}
      <main
        className="flex-1 flex items-center justify-center overflow-y-auto"
        style={{
          background: "var(--bg-base)",
          padding: "32px 24px",
        }}
      >
        {children}
      </main>
    </div>
  );
}
