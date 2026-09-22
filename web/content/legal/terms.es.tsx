/** Términos de servicio — Español. Página pública: sin var(--*), solo hex fijos. */

const LINK: React.CSSProperties = { color: "#5C7CFA", textDecoration: "underline" };
const H2: React.CSSProperties = { fontSize: "18px", fontWeight: 700, marginTop: "36px", marginBottom: "10px", color: "#111827" };
const P: React.CSSProperties = { lineHeight: "1.7", marginTop: "0", marginBottom: "14px", color: "#374151" };

export function TermsES() {
  return (
    <>
      <h1 style={{ fontSize: "28px", fontWeight: 800, color: "#111827", marginBottom: "6px", letterSpacing: "-0.5px" }}>
        Términos de servicio
      </h1>
      <p style={{ color: "#6B7280", fontSize: "14px", marginTop: "0", marginBottom: "32px" }}>
        Última actualización: 21 de septiembre de 2026
      </p>

      <p style={P}>
        Estos Términos son un acuerdo entre tú y <strong>Otunity Labs LLC</strong> ("Otunity Labs",
        "nosotros") para el uso de la app JChat, jchat.cloud, el panel de negocios (incluido
        dashboard.tabpos.cloud) y los servicios relacionados (el "Servicio"). Al crear una cuenta o usar el
        Servicio aceptas estos Términos y nuestra{" "}
        <a href="/privacy" style={LINK}>Política de privacidad</a>.
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
        <ol style={{ paddingLeft: "18px", margin: 0, lineHeight: "2" }}>
          <li><a href="#eligibility" style={LINK}>Requisitos</a></li>
          <li><a href="#your-account" style={LINK}>Tu cuenta</a></li>
          <li><a href="#the-service" style={LINK}>El Servicio</a></li>
          <li><a href="#community" style={LINK}>Normas de la comunidad</a></li>
          <li><a href="#your-content" style={LINK}>Tu contenido</a></li>
          <li><a href="#orders-payments" style={LINK}>Pedidos, pagos y propinas</a></li>
          <li><a href="#business-accounts" style={LINK}>Cuentas de negocio</a></li>
          <li><a href="#plans-billing" style={LINK}>Planes y facturación</a></li>
          <li><a href="#affiliate" style={LINK}>Programa de afiliados</a></li>
          <li><a href="#location-safety" style={LINK}>Ubicación y seguridad</a></li>
          <li><a href="#ip" style={LINK}>Propiedad intelectual</a></li>
          <li><a href="#termination" style={LINK}>Terminación</a></li>
          <li><a href="#disclaimers" style={LINK}>Exención de garantías</a></li>
          <li><a href="#liability" style={LINK}>Limitación de responsabilidad</a></li>
          <li><a href="#indemnity" style={LINK}>Indemnidad</a></li>
          <li><a href="#governing-law" style={LINK}>Ley aplicable y disputas</a></li>
          <li><a href="#changes" style={LINK}>Cambios</a></li>
          <li><a href="#contact-terms" style={LINK}>Contacto</a></li>
        </ol>
      </nav>

      <h2 id="eligibility" style={H2}>1. Requisitos</h2>
      <p style={P}>
        Debes tener al menos <strong>18 años</strong> y capacidad para contratar. Las cuentas de negocio
        deben crearlas personas autorizadas para actuar en nombre del negocio.
      </p>

      <h2 id="your-account" style={H2}>2. Tu cuenta</h2>
      <p style={P}>
        Mantén tus credenciales en secreto; eres responsable de la actividad en tu cuenta. Proporciona
        información veraz. Una persona, una cuenta. Podemos suspender o cancelar cuentas que incumplan estos
        Términos.
      </p>

      <h2 id="the-service" style={H2}>3. El Servicio</h2>
      <p style={P}>
        JChat permite a los miembros encontrar lugares y grupos cercanos, chatear con personas que están en
        el mismo lugar, y pedir y pagar en locales participantes. Permite a los dueños administrar su local,
        menú, personal, pedidos, cobros y herramientas relacionadas. Algunas funciones requieren un plan de
        pago. Podemos cambiar, añadir o retirar funciones.
      </p>

      <h2 id="community" style={H2}>4. Normas de la comunidad</h2>
      <p style={P}>
        No publiques ni hagas nada ilegal, acosador, amenazante, de odio, sexualmente explícito, violento,
        fraudulento, spam, o que vulnere derechos o la privacidad de otros. No suplantes a nadie, no
        compartas datos personales de otros sin consentimiento ni interfieras con el Servicio u otros
        usuarios. No uses el Servicio para vender o promover bienes ilegales. Los locales pueden fijar reglas
        adicionales para sus chats. Nosotros y los dueños podemos retirar contenido, silenciar, expulsar o
        bloquear usuarios, y podemos suspender cuentas, a nuestro criterio.
      </p>
      <p style={P}>
        <strong>Reporta</strong> contenido o usuarios desde su perfil o el menú del mensaje; revisamos los
        reportes y actuamos sobre los que incumplen estas normas, normalmente en 24 horas.{" "}
        <strong>Bloquea</strong> a cualquiera para dejar de ver su contenido.
      </p>

      <h2 id="your-content" style={H2}>5. Tu contenido</h2>
      <p style={P}>
        Lo que publicas es tuyo. Concedes a Otunity Labs y, para el contenido publicado en el chat de un
        local o sobre un local, a ese local, una licencia mundial, no exclusiva y gratuita para alojar,
        almacenar, mostrar, reproducir y distribuir tu contenido en la medida necesaria para operar y
        promover el Servicio. Eres responsable de tu contenido y confirmas que tienes derecho a publicarlo.
        Podemos retirar contenido que incumpla estos Términos.
      </p>

      <h2 id="orders-payments" style={H2}>6. Pedidos, pagos y propinas</h2>
      <p style={P}>
        Cuando pides en un local, <strong>el local es el vendedor</strong>; JChat aporta las herramientas de
        pedido y pago. Precios, disponibilidad, impuestos, reembolsos y calidad de los productos son
        responsabilidad del local. Los pagos los procesa <strong>Stripe</strong>; al pagar aceptas los
        términos de Stripe. Las propinas van al local. Las solicitudes de reembolso se hacen al local; cuando
        JChat procesó el pago podemos asistir y emitir reembolsos por Stripe a petición del local. Los
        pedidos hechos con código de mesa o sin él son vinculantes una vez aceptados por el local.
      </p>

      <h2 id="business-accounts" style={H2}>7. Cuentas de negocio</h2>
      <p style={P}>
        Los dueños son responsables de la ficha de su local, menú, precios, impuestos, empleados,
        cumplimiento de la ley local (incluidas las normas sobre alcohol) y de la conducta de su personal en
        el Servicio. Los pagos al negocio los realiza Stripe conforme a tu acuerdo de Stripe Connect. No
        debes usar las herramientas de punto de venta para cobrar pagos que no te correspondan. Otunity Labs
        puede revisar los reportes y registros de moderación de tu local.
      </p>

      <h2 id="plans-billing" style={H2}>8. Planes y facturación</h2>
      <p style={P}>
        Los planes de pago (por ejemplo, Business y Pro) se cobran por adelantado, mensualmente, mediante
        Stripe, y se renuevan automáticamente hasta que los canceles. Puedes cancelar en cualquier momento
        desde el panel; la cancelación surte efecto al final del periodo en curso y las cuotas ya pagadas no
        se reembolsan salvo que la ley lo exija. Podemos cambiar los precios con aviso previo. Las pruebas,
        si se ofrecen, pasan a plan de pago salvo cancelación antes de su fin. Los planes que se ofrezcan
        dentro de las apps móviles se venden bajo las reglas de la tienda de aplicaciones correspondiente.
      </p>

      <h2 id="affiliate" style={H2}>9. Programa de afiliados</h2>
      <p style={P}>
        Si participas en nuestro programa de afiliados, aplican los términos adicionales mostrados en el
        programa. Las comisiones se pagan solo por referidos válidos y no fraudulentos.
      </p>

      <h2 id="location-safety" style={H2}>10. Ubicación y seguridad</h2>
      <p style={P}>
        El Servicio usa tu ubicación mientras lo utilizas. No dependas del Servicio para emergencias. Eres
        responsable de tu seguridad al reunirte con personas o visitar locales.
      </p>

      <h2 id="ip" style={H2}>11. Propiedad intelectual</h2>
      <p style={P}>
        El Servicio, su software, diseño y marcas (incluidas "JChat" y "Tab POS") pertenecen a Otunity Labs
        o a sus licenciantes. No puedes copiar, modificar, descompilar ni revender el Servicio.
      </p>

      <h2 id="termination" style={H2}>12. Terminación</h2>
      <p style={P}>
        Puedes dejar de usar el Servicio y eliminar tu cuenta cuando quieras (Ajustes → Eliminar cuenta).
        Podemos suspender o cancelar tu acceso si incumples estos Términos, generas riesgo para otros o
        cuando la ley lo exija. Las secciones que por su naturaleza deban subsistir (licencia sobre contenido
        ya compartido, pagos pendientes, exenciones y limitación de responsabilidad) subsisten a la
        terminación.
      </p>

      <h2 id="disclaimers" style={H2}>13. Exención de garantías</h2>
      <p style={P}>
        El Servicio se presta "tal cual" y "según disponibilidad". No garantizamos que sea ininterrumpido ni
        libre de errores, ni que la información de los locales (horarios, precios, disponibilidad) sea
        exacta. Los locales son negocios independientes; no respondemos por sus productos ni su conducta.
      </p>

      <h2 id="liability" style={H2}>14. Limitación de responsabilidad</h2>
      <p style={P}>
        En la máxima medida permitida por la ley, Otunity Labs no será responsable de daños indirectos,
        incidentales, especiales, consecuentes o punitivos, ni de pérdida de beneficios, datos o reputación
        derivados del uso del Servicio. Nuestra responsabilidad total por cualquier reclamación no excederá
        el mayor entre lo que nos hayas pagado en los 12 meses anteriores a la reclamación o 100 USD.
      </p>

      <h2 id="indemnity" style={H2}>15. Indemnidad</h2>
      <p style={P}>
        Defenderás y mantendrás indemne a Otunity Labs frente a reclamaciones derivadas de tu contenido, tu
        uso del Servicio o tu incumplimiento de estos Términos o de la ley.
      </p>

      <h2 id="governing-law" style={H2}>16. Ley aplicable y disputas</h2>
      <p style={P}>
        Estos Términos se rigen por las leyes del Estado de Florida, EE. UU. Las disputas se resolverán en
        los tribunales estatales o federales del condado de Broward, Florida, a cuya jurisdicción te sometes.
        Si una cláusula resulta inaplicable, el resto sigue vigente.
      </p>

      <h2 id="changes" style={H2}>17. Cambios</h2>
      <p style={P}>
        Podemos actualizar estos Términos; publicaremos la nueva versión con su fecha y, si el cambio es
        importante, te avisaremos en la app. Seguir usando el Servicio tras los cambios implica aceptarlos.
      </p>

      <h2 id="contact-terms" style={H2}>18. Contacto</h2>
      <p style={P}>
        Otunity Labs LLC · 6000 Palm Trace Landings Dr APT 312, Davie, FL 33314, EE. UU. ·{" "}
        <a href="mailto:jgarcia@otunitylabs.com" style={LINK}>jgarcia@otunitylabs.com</a>
      </p>
    </>
  );
}
