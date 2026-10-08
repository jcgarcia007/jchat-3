/** Contacto — contenido en español. Página pública. */

const LINK: React.CSSProperties = { color: "var(--color-brand)", textDecoration: "underline" };
const H1: React.CSSProperties = { fontSize: "28px", fontWeight: 800, color: "var(--gray-900)", marginBottom: "6px", letterSpacing: "-0.5px" };
const H2: React.CSSProperties = { fontSize: "18px", fontWeight: 700, marginTop: "32px", marginBottom: "10px", color: "var(--gray-900)" };
const P: React.CSSProperties = { lineHeight: "1.7", marginTop: "0", marginBottom: "14px", color: "var(--gray-700)" };
const UL: React.CSSProperties = { lineHeight: "1.8", paddingLeft: "20px", marginTop: "0", marginBottom: "14px", color: "var(--gray-700)" };
const DATE: React.CSSProperties = { color: "var(--gray-500)", fontSize: "14px", marginTop: "0", marginBottom: "28px" };

export function ContactES() {
  return (
    <>
      <h1 style={H1}>Contacto</h1>
      <p style={DATE}>Última actualización: 8 de octubre de 2026</p>

      <h2 style={H2}>Reportes de seguridad y abuso</h2>
      <p style={P}><a href="mailto:safety@jchat.cloud" style={LINK}>safety@jchat.cloud</a> — revisamos cada reporte en un máximo de 24 horas. Consulta <a href="/safety" style={LINK}>Seguridad y normas de la comunidad</a>.</p>

      <h2 style={H2}>Ayuda con tu cuenta, pedidos o pagos</h2>
      <p style={P}><a href="mailto:jgarcia@otunitylabs.com" style={LINK}>jgarcia@otunitylabs.com</a> — respondemos en 1–2 días hábiles. Indica el correo de tu cuenta y, en pedidos, el código del recibo. Más respuestas en <a href="/support" style={LINK}>Ayuda y soporte</a>.</p>

      <h2 style={H2}>Solicitudes de privacidad</h2>
      <p style={P}>Eliminar tu cuenta o tus datos: <a href="/support#delete-account" style={LINK}>cómo hacerlo</a>. Nuestra <a href="/privacy" style={LINK}>Política de privacidad</a> explica qué conservamos.</p>

      <h2 style={H2}>Empresa</h2>
      <p style={P}>Otunity Labs LLC — la empresa detrás de JChat.</p>
    </>
  );
}
