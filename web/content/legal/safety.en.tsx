/** Safety & community standards — English content. Public page. */

const LINK: React.CSSProperties = { color: "var(--color-brand)", textDecoration: "underline" };
const H1: React.CSSProperties = { fontSize: "28px", fontWeight: 800, color: "var(--gray-900)", marginBottom: "6px", letterSpacing: "-0.5px" };
const H2: React.CSSProperties = { fontSize: "18px", fontWeight: 700, marginTop: "32px", marginBottom: "10px", color: "var(--gray-900)" };
const P: React.CSSProperties = { lineHeight: "1.7", marginTop: "0", marginBottom: "14px", color: "var(--gray-700)" };
const UL: React.CSSProperties = { lineHeight: "1.8", paddingLeft: "20px", marginTop: "0", marginBottom: "14px", color: "var(--gray-700)" };
const DATE: React.CSSProperties = { color: "var(--gray-500)", fontSize: "14px", marginTop: "0", marginBottom: "28px" };

export function SafetyEN() {
  return (
    <>
      <h1 style={H1}>Safety &amp; Community Standards</h1>
      <p style={DATE}>Last updated: October 8, 2026</p>

      <p style={P}>
        JChat is for adults (18+) who want to meet and talk at real places. Everyone should feel safe doing it.
        This page explains our rules, how to report a problem, and how fast we act.
      </p>

      <h2 style={H2}>Zero tolerance</h2>
      <p style={P}>We do not allow, and will remove and report where the law requires:</p>
      <ul style={UL}>
        <li>Any sexual content involving minors, and any attempt to contact, groom or exploit a minor.</li>
        <li>Harassment, threats, hate speech and discrimination.</li>
        <li>Sexually explicit content, violence and illegal activity.</li>
        <li>Spam, scams and impersonation.</li>
      </ul>
      <p style={P}>Accounts that break these rules are suspended or deleted. Serious cases may be reported to the authorities.</p>

      <h2 style={H2}>Child safety (CSAE)</h2>
      <p style={P}>
        JChat is only for people aged 18 or older: we check age at sign-up and delete accounts that turn out to belong to
        a minor. Child sexual abuse and exploitation material (CSAM) and any behaviour that endangers children are
        strictly forbidden. When we find or are told about such content we remove it immediately, preserve the
        evidence required by law, suspend the account and report it to the National Center for Missing &amp; Exploited
        Children (NCMEC) and to the competent authorities. Our designated child-safety contact is <a href="mailto:safety@jchat.cloud" style={LINK}>safety@jchat.cloud</a>.
      </p>

      <h2 style={H2}>How to report</h2>
      <ul style={UL}>
        <li><strong>In the app:</strong> open the profile or the message menu and choose <em>Report</em>. You can also choose <em>Block</em> to stop all contact.</li>
        <li><strong>By email:</strong> <a href="mailto:safety@jchat.cloud" style={LINK}>safety@jchat.cloud</a>. Include the username, what happened and, if you can, a screenshot.</li>
        <li><strong>Emergency:</strong> if someone is in immediate danger, call your local emergency number first.</li>
      </ul>

      <h2 style={H2}>How fast we respond</h2>
      <p style={P}>
        We review every report within <strong>24 hours</strong>; child-safety reports are handled first. If the content or the
        account breaks our rules we remove it and tell you the outcome when we can.
      </p>

      <h2 style={H2}>Block and privacy tools</h2>
      <p style={P}>
        You can block anyone from their profile or from a chat. Blocked people cannot message you or see your profile.
        You decide who can follow you and message you in <em>Settings → Privacy</em>. You can delete your account at any time
        (see <a href="/support#delete-account" style={LINK}>Help &amp; Support</a>).
      </p>

      <h2 style={H2}>Contact</h2>
      <p style={P}>Safety and abuse reports: <a href="mailto:safety@jchat.cloud" style={LINK}>safety@jchat.cloud</a>. Other questions: see <a href="/contact" style={LINK}>Contact</a>.</p>
    </>
  );
}
