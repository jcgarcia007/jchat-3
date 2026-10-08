/** Contact — English content. Public page. */

const LINK: React.CSSProperties = { color: "var(--color-brand)", textDecoration: "underline" };
const H1: React.CSSProperties = { fontSize: "28px", fontWeight: 800, color: "var(--gray-900)", marginBottom: "6px", letterSpacing: "-0.5px" };
const H2: React.CSSProperties = { fontSize: "18px", fontWeight: 700, marginTop: "32px", marginBottom: "10px", color: "var(--gray-900)" };
const P: React.CSSProperties = { lineHeight: "1.7", marginTop: "0", marginBottom: "14px", color: "var(--gray-700)" };
const UL: React.CSSProperties = { lineHeight: "1.8", paddingLeft: "20px", marginTop: "0", marginBottom: "14px", color: "var(--gray-700)" };
const DATE: React.CSSProperties = { color: "var(--gray-500)", fontSize: "14px", marginTop: "0", marginBottom: "28px" };

export function ContactEN() {
  return (
    <>
      <h1 style={H1}>Contact</h1>
      <p style={DATE}>Last updated: October 8, 2026</p>

      <h2 style={H2}>Safety and abuse reports</h2>
      <p style={P}><a href="mailto:safety@jchat.cloud" style={LINK}>safety@jchat.cloud</a> — we review every report within 24 hours. See <a href="/safety" style={LINK}>Safety &amp; Community Standards</a>.</p>

      <h2 style={H2}>Help with your account, orders or payments</h2>
      <p style={P}><a href="mailto:jgarcia@otunitylabs.com" style={LINK}>jgarcia@otunitylabs.com</a> — we answer within 1–2 business days. Include the email on your account and, for orders, the receipt code. More answers in <a href="/support" style={LINK}>Help &amp; Support</a>.</p>

      <h2 style={H2}>Privacy requests</h2>
      <p style={P}>Deleting your account or your data: <a href="/support#delete-account" style={LINK}>how to do it</a>. Our <a href="/privacy" style={LINK}>Privacy Policy</a> explains what we keep.</p>

      <h2 style={H2}>Company</h2>
      <p style={P}>Otunity Labs LLC — the company behind JChat.</p>
    </>
  );
}
