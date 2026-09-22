/** Help & Support — English content. Public page: no var(--*), fixed hex only. */

const LINK: React.CSSProperties = { color: "#5C7CFA", textDecoration: "underline" };
const H2: React.CSSProperties = { fontSize: "18px", fontWeight: 700, marginTop: "36px", marginBottom: "10px", color: "#111827" };
const P: React.CSSProperties = { lineHeight: "1.7", marginTop: "0", marginBottom: "14px", color: "#374151" };

export function SupportEN() {
  return (
    <>
      <h1 style={{ fontSize: "28px", fontWeight: 800, color: "#111827", marginBottom: "6px", letterSpacing: "-0.5px" }}>
        Help &amp; Support
      </h1>
      <p style={{ color: "#6B7280", fontSize: "14px", marginTop: "0", marginBottom: "32px" }}>
        Last updated: September 21, 2026
      </p>

      <p style={P}>
        Need help? Email{" "}
        <a href="mailto:jgarcia@otunitylabs.com" style={LINK}>jgarcia@otunitylabs.com</a>. We answer within
        1–2 business days. Include the email on your account and, for order issues, the receipt code.
      </p>

      {/* Table of contents */}
      <nav
        style={{
          background: "#F3F4F6",
          borderRadius: "10px",
          padding: "20px 24px",
          marginBottom: "40px",
          fontSize: "14px",
        }}
      >
        <p style={{ fontWeight: 700, marginTop: 0, marginBottom: "10px", color: "#111827" }}>Contents</p>
        <ul style={{ paddingLeft: "18px", margin: 0, lineHeight: "2", listStyle: "none", padding: 0 }}>
          <li>→ <a href="#delete-account" style={LINK}>Delete your account</a></li>
          <li>→ <a href="#report" style={LINK}>Report or block someone</a></li>
          <li>→ <a href="#orders-refunds" style={LINK}>Orders, receipts and refunds</a></li>
          <li>→ <a href="#payments-businesses" style={LINK}>Payments and card readers (businesses)</a></li>
          <li>→ <a href="#location-permissions" style={LINK}>Location and permissions</a></li>
          <li>→ <a href="#account-login" style={LINK}>Account and login</a></li>
          <li>→ <a href="#business-owners" style={LINK}>Business owners</a></li>
          <li>→ <a href="#legal-links" style={LINK}>Legal</a></li>
        </ul>
      </nav>

      <h2 id="delete-account" style={H2}>Delete your account</h2>
      <p style={P}>
        In the app: <strong>Settings → Delete account</strong>. This permanently deletes your profile,
        content and personal data. If you can't access the app, email us from the address on your account and
        we'll delete it for you. Business owners: close or transfer your business first.
      </p>

      <h2 id="report" style={H2}>Report or block someone</h2>
      <p style={P}>
        Open the person's profile (or the message menu) and choose <strong>Report</strong> or{" "}
        <strong>Block</strong>. Reports are reviewed by our team; blocking hides their content from you
        immediately. Venue owners can also mute or remove people from their chats.
      </p>

      <h2 id="orders-refunds" style={H2}>Orders, receipts and refunds</h2>
      <p style={P}>
        Your orders and digital receipts are in the app. Refunds are handled by the venue that served you —
        contact them first with your receipt code. If you paid through JChat and can't reach the venue, email
        us.
      </p>

      <h2 id="payments-businesses" style={H2}>Payments and card readers (businesses)</h2>
      <p style={P}>
        Payments and payouts run on Stripe. Check your Stripe dashboard for payout status. For card-reader
        or printer setup, see the dashboard's Devices and Printers pages, or email us.
      </p>

      <h2 id="location-permissions" style={H2}>Location and permissions</h2>
      <p style={P}>
        JChat uses your location only while the app is open, to show nearby venues and let you join their
        chats. You can change permissions in your phone's settings; some features won't work without
        location.
      </p>

      <h2 id="account-login" style={H2}>Account and login</h2>
      <p style={P}>
        Forgot your password? Use "Forgot password" on the sign-in screen. To change your email or name, go
        to Settings.
      </p>

      <h2 id="business-owners" style={H2}>Business owners</h2>
      <p style={P}>
        Manage your venue at{" "}
        <a href="https://jchat.cloud/dashboard" style={LINK}>jchat.cloud/dashboard</a> (or
        dashboard.tabpos.cloud). Plans and billing are in the dashboard; you can cancel anytime.
      </p>

      <h2 id="legal-links" style={H2}>Legal</h2>
      <p style={P}>
        <a href="/privacy" style={LINK}>Privacy Policy</a>
        {" · "}
        <a href="/terms" style={LINK}>Terms of Service</a>
      </p>
      <p style={{ ...P, color: "#6B7280", fontSize: "13px" }}>
        Otunity Labs LLC · Davie, Florida, USA
      </p>
    </>
  );
}
