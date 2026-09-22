/** Ayuda y soporte — Español. Página pública: sin var(--*), solo hex fijos. */

const LINK: React.CSSProperties = { color: "#5C7CFA", textDecoration: "underline" };
const H2: React.CSSProperties = { fontSize: "18px", fontWeight: 700, marginTop: "36px", marginBottom: "10px", color: "#111827" };
const P: React.CSSProperties = { lineHeight: "1.7", marginTop: "0", marginBottom: "14px", color: "#374151" };

export function SupportES() {
  return (
    <>
      <h1 style={{ fontSize: "28px", fontWeight: 800, color: "#111827", marginBottom: "6px", letterSpacing: "-0.5px" }}>
        Ayuda y soporte
      </h1>
      <p style={{ color: "#6B7280", fontSize: "14px", marginTop: "0", marginBottom: "32px" }}>
        Última actualización: 21 de septiembre de 2026
      </p>

      <p style={P}>
        ¿Necesitas ayuda? Escribe a{" "}
        <a href="mailto:jgarcia@otunitylabs.com" style={LINK}>jgarcia@otunitylabs.com</a>. Respondemos en
        1–2 días hábiles. Incluye el correo de tu cuenta y, para problemas con pedidos, el código del
        recibo.
      </p>

      {/* Tabla de contenido */}
      <nav
        style={{
          background: "#F3F4F6",
          borderRadius: "10px",
          padding: "20px 24px",
          marginBottom: "40px",
          fontSize: "14px",
        }}
      >
        <p style={{ fontWeight: 700, marginTop: 0, marginBottom: "10px", color: "#111827" }}>Contenido</p>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, lineHeight: "2" }}>
          <li>→ <a href="#delete-account" style={LINK}>Eliminar tu cuenta</a></li>
          <li>→ <a href="#report" style={LINK}>Reportar o bloquear a alguien</a></li>
          <li>→ <a href="#orders-refunds" style={LINK}>Pedidos, recibos y reembolsos</a></li>
          <li>→ <a href="#payments-businesses" style={LINK}>Pagos y lectores de tarjeta (negocios)</a></li>
          <li>→ <a href="#location-permissions" style={LINK}>Ubicación y permisos</a></li>
          <li>→ <a href="#account-login" style={LINK}>Cuenta e inicio de sesión</a></li>
          <li>→ <a href="#business-owners" style={LINK}>Dueños de negocio</a></li>
          <li>→ <a href="#legal-links" style={LINK}>Legal</a></li>
        </ul>
      </nav>

      <h2 id="delete-account" style={H2}>Eliminar tu cuenta</h2>
      <p style={P}>
        En la app: <strong>Ajustes → Eliminar cuenta</strong>. Esto borra de forma permanente tu perfil,
        contenido y datos personales. Si no puedes acceder a la app, escríbenos desde el correo de tu cuenta
        y la eliminamos por ti. Dueños de negocio: cierren o transfieran su negocio primero.
      </p>

      <h2 id="report" style={H2}>Reportar o bloquear a alguien</h2>
      <p style={P}>
        Abre el perfil de la persona (o el menú del mensaje) y elige <strong>Reportar</strong> o{" "}
        <strong>Bloquear</strong>. Nuestro equipo revisa los reportes; el bloqueo oculta su contenido de
        inmediato. Los dueños de locales también pueden silenciar o expulsar personas de sus chats.
      </p>

      <h2 id="orders-refunds" style={H2}>Pedidos, recibos y reembolsos</h2>
      <p style={P}>
        Tus pedidos y recibos digitales están en la app. Los reembolsos los gestiona el local que te
        atendió: contáctalo primero con tu código de recibo. Si pagaste a través de JChat y no logras
        contactar al local, escríbenos.
      </p>

      <h2 id="payments-businesses" style={H2}>Pagos y lectores de tarjeta (negocios)</h2>
      <p style={P}>
        Los cobros y pagos al negocio funcionan con Stripe. Revisa tu panel de Stripe para el estado de tus
        pagos. Para configurar lectores o impresoras, ve a las páginas Dispositivos e Impresoras del panel,
        o escríbenos.
      </p>

      <h2 id="location-permissions" style={H2}>Ubicación y permisos</h2>
      <p style={P}>
        JChat usa tu ubicación solo mientras la app está abierta, para mostrarte lugares cercanos y dejarte
        entrar a sus chats. Puedes cambiar los permisos en los ajustes del teléfono; algunas funciones no
        funcionan sin ubicación.
      </p>

      <h2 id="account-login" style={H2}>Cuenta e inicio de sesión</h2>
      <p style={P}>
        ¿Olvidaste tu contraseña? Usa "Olvidé mi contraseña" en la pantalla de inicio de sesión. Para
        cambiar tu correo o nombre, ve a Ajustes.
      </p>

      <h2 id="business-owners" style={H2}>Dueños de negocio</h2>
      <p style={P}>
        Administra tu local en{" "}
        <a href="https://jchat.cloud/dashboard" style={LINK}>jchat.cloud/dashboard</a> (o
        dashboard.tabpos.cloud). Los planes y la facturación están en el panel; puedes cancelar cuando
        quieras.
      </p>

      <h2 id="legal-links" style={H2}>Legal</h2>
      <p style={P}>
        <a href="/privacy" style={LINK}>Política de privacidad</a>
        {" · "}
        <a href="/terms" style={LINK}>Términos de servicio</a>
      </p>
      <p style={{ ...P, color: "#6B7280", fontSize: "13px" }}>
        Otunity Labs LLC · Davie, Florida, EE. UU.
      </p>
    </>
  );
}
