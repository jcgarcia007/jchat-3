/** Política de privacidad — Español. Página pública: sin var(--*), solo hex fijos. */

const LINK: React.CSSProperties = { color: "var(--color-brand)", textDecoration: "underline" };
const H2: React.CSSProperties = { fontSize: "18px", fontWeight: 700, marginTop: "36px", marginBottom: "10px", color: "var(--gray-900)" };
const P: React.CSSProperties = { lineHeight: "1.7", marginTop: "0", marginBottom: "14px", color: "var(--gray-700)" };
const UL: React.CSSProperties = { paddingLeft: "20px", lineHeight: "1.7", color: "var(--gray-700)", marginBottom: "14px" };

export function PrivacyES() {
  return (
    <>
      <h1 style={{ fontSize: "28px", fontWeight: 800, color: "var(--gray-900)", marginBottom: "6px", letterSpacing: "-0.5px" }}>
        Política de privacidad
      </h1>
      <p style={{ color: "var(--gray-500)", fontSize: "14px", marginTop: "0", marginBottom: "32px" }}>
        Última actualización: 6 de noviembre de 2026
      </p>

      <p style={P}>
        JChat es operado por <strong>Otunity Labs LLC</strong> ("Otunity Labs", "nosotros"), 6000 Palm Trace
        Landings Dr APT 312, Davie, FL 33314, Estados Unidos. Esta política explica qué información
        recopilamos cuando usas la app móvil JChat, el sitio jchat.cloud, el panel de negocios (incluido
        dashboard.tabpos.cloud) y los servicios relacionados (en conjunto, el "Servicio"), cómo la usamos y
        qué opciones tienes.
      </p>

      {/* Tabla de contenido */}
      <nav
        style={{
          background: "var(--gray-100)",
          borderRadius: "10px",
          padding: "20px 24px",
          marginBottom: "40px",
          fontSize: "14px",
        }}
      >
        <p style={{ fontWeight: 700, marginTop: 0, marginBottom: "10px", color: "var(--gray-900)" }}>Contenido</p>
        <ol style={{ paddingLeft: "18px", margin: 0, lineHeight: "2" }}>
          <li><a href="#who-this-applies" style={LINK}>A quién aplica</a></li>
          <li><a href="#information-we-collect" style={LINK}>Información que recopilamos</a></li>
          <li><a href="#how-we-use" style={LINK}>Cómo usamos la información</a></li>
          <li><a href="#who-we-share" style={LINK}>Con quién compartimos la información</a></li>
          <li><a href="#your-content" style={LINK}>Tu contenido y otros usuarios</a></li>
          <li><a href="#data-retention" style={LINK}>Conservación</a></li>
          <li><a href="#delete-account" style={LINK}>Eliminar tu cuenta</a></li>
          <li><a href="#your-rights" style={LINK}>Tus derechos</a></li>
          <li><a href="#children" style={LINK}>Menores</a></li>
          <li><a href="#security" style={LINK}>Seguridad</a></li>
          <li><a href="#international" style={LINK}>Usuarios internacionales</a></li>
          <li><a href="#tracking" style={LINK}>Rastreo y publicidad</a></li>
          <li><a href="#changes" style={LINK}>Cambios</a></li>
          <li><a href="#contact" style={LINK}>Contacto</a></li>
        </ol>
      </nav>

      <h2 id="who-this-applies" style={H2}>1. A quién aplica</h2>
      <p style={P}>
        JChat tiene tres tipos de usuarios: <strong>miembros</strong> (personas que usan la app para ver
        lugares cercanos, chatear y pedir), <strong>dueños y personal de negocios</strong> (que administran
        un local con el panel y las herramientas de punto de venta) e <strong>invitados</strong> (personas
        que piden o pagan en un local escaneando un código QR sin crear cuenta). Esta política cubre a todos.
      </p>

      <h2 id="information-we-collect" style={H2}>2. Información que recopilamos</h2>
      <ul style={UL}>
        <li>
          <em>Cuenta:</em> correo, contraseña (guardada cifrada por nuestro proveedor de autenticación),
          nombre, usuario, foto de perfil, biografía, idioma y ajustes. Si inicias sesión con Apple o Google,
          recibimos el nombre y correo que esos servicios comparten.
        </li>
        <li>
          <em>Ubicación precisa, solo mientras usas la app:</em> para mostrarte lugares cercanos, permitirte
          entrar al chat de un lugar o grupo cuando estás dentro de su radio, y conectar lectores de tarjeta
          cercanos. No recopilamos ubicación en segundo plano. Necesitamos tu ubicación para confirmar que
          estás dentro del local. Así nadie de afuera entra al chat. No guardamos tu ubicación exacta; solo
          confirmamos que estás aquí.
        </li>
        <li>
          <em>Contenido que creas:</em> mensajes de chat, mensajes directos, publicaciones, fotos, historias,
          reseñas, notas de voz y cualquier otra cosa que compartas. Las fotos requieren permiso de cámara o
          galería; las notas de voz, de micrófono.
        </li>
        <li>
          <em>Pedidos y pagos:</em> artículos pedidos, importes, propinas y códigos de recibo.{" "}
          <strong>Nunca vemos ni guardamos tu número de tarjeta.</strong> Los pagos los procesa Stripe; solo
          recibimos la confirmación del pago, la marca de la tarjeta y sus últimos cuatro dígitos.
        </li>
        <li>
          <em>Pedidos de invitado:</em> si pides o pagas en un local por QR sin cuenta, guardamos un
          identificador aleatorio de dispositivo, una huella de dispositivo cifrada y una dirección IP
          cifrada, por seguridad y prevención de fraude (por ejemplo, para limitar pedidos abusivos). No se
          vinculan a tu nombre.
        </li>
        <li>
          <em>Datos de negocio:</em> si eres dueño o empleado, información de tu negocio, menú, empleados,
          mesas, ventas, inventario y tu cuenta de Stripe Connect.
        </li>
        <li>
          <em>Datos del dispositivo y diagnóstico:</em> tipo de dispositivo, sistema operativo, versión de
          la app, token de notificaciones push, registros de errores.
        </li>
        <li>
          <em>Datos de seguridad:</em> reportes que envías, usuarios que bloqueas, acciones de moderación de
          los dueños de locales y resultados de verificación CAPTCHA.
        </li>
      </ul>

      <h2 id="how-we-use" style={H2}>3. Cómo usamos la información</h2>
      <p style={P}>
        Para prestar el Servicio (mapa, chat, pedidos, pagos, recibos, notificaciones); para mantenerlo
        seguro (prevención de fraude, límites de uso, moderación, bloqueo de dispositivos abusivos); para
        comunicarnos contigo sobre tu cuenta y pedidos; para mejorar el Servicio; y para cumplir la ley.
        Usamos la ubicación solo para las funciones descritas.
      </p>

      <h2 id="who-we-share" style={H2}>4. Con quién compartimos la información</h2>
      <p style={P}>
        No vendemos tu información personal. Solo la compartimos con proveedores que la procesan para
        nosotros bajo contrato y en la medida necesaria:
      </p>
      {/* BORRADOR PARA REVISIÓN LEGAL (A6, 2026-11): la lista de proveedores y los plazos de conservación de abajo son decisiones de Juan y NO los ha revisado un abogado. */}
      <ul style={UL}>
        <li><strong>Supabase</strong> — base de datos, autenticación y archivos, alojados en Estados Unidos.</li>
        <li><strong>Stripe</strong> — procesamiento de pagos, pagos a negocios y lectores de tarjeta. Nunca vemos ni guardamos el número de tu tarjeta.</li>
        <li><strong>Google Cloud Vision</strong> — revisión de seguridad de las fotos que envías en Match y en mensajes directos: los bytes de la foto se envían a Google para detectar contenido que incumple nuestras reglas.</li>
        <li><strong>Google Maps</strong> y <strong>Firebase Cloud Messaging</strong> (Google) — mapas en Android y notificaciones push. <strong>Apple</strong> — notificaciones push y Apple Maps en iOS.</li>
        <li><strong>Expo</strong> — notificaciones push (el título y el texto de una notificación pasan por el servicio push de Expo antes de llegar a tu teléfono) y compilación y actualizaciones de la app.</li>
        <li><strong>Sentry</strong> — diagnósticos técnicos (informes de errores y cierres inesperados) sin datos personales.</li>
        <li><strong>hCaptcha</strong> — protección contra bots al iniciar sesión, registrarte o recuperar la contraseña.</li>
        <li><strong>Vercel</strong> — alojamiento web.</li>
      </ul>
      <p style={P}>
        Los dueños que usan el
        asistente de menús con IA envían su propio contenido de menú a un proveedor de IA (Anthropic /
        Claude); no se envían datos de miembros. Cuando pides en un local, el local recibe los detalles de
        tu pedido (y, en reservas, el nombre y contacto que indiques). También podemos divulgar información
        si la ley lo exige o para proteger los derechos y la seguridad de los usuarios y del Servicio.
      </p>

      <h2 id="your-content" style={H2}>5. Tu contenido y otros usuarios</h2>
      <p style={P}>
        Los mensajes que publicas en el chat de un lugar o grupo son visibles para las demás personas de ese
        chat. Tu perfil público (usuario, nombre, foto, biografía) es visible para otros miembros. Los
        dueños pueden moderar sus propios chats (silenciar, expulsar, bloquear). Puedes reportar o bloquear
        a cualquier persona desde su perfil.
      </p>

      <h2 id="data-retention" style={H2}>6. Conservación</h2>
      <p style={P}>
        Conservamos tu información mientras tu cuenta esté activa. Cuando eliminas tu cuenta borramos{" "}
        <strong>al momento</strong> tu perfil, fotos, mensajes, perfil de Match y publicaciones. Algunos
        registros se conservan después, durante estos plazos:
      </p>
      <ul style={UL}>
        <li><strong>Pedidos y pagos:</strong> 7 años, sin tus datos personales, por obligaciones fiscales y contables.</li>
        <li><strong>Registros de seguridad:</strong> 90 días.</li>
        <li><strong>Reportes de moderación:</strong> 1 año.</li>
      </ul>
      <p style={P}>
        Los identificadores de pedidos de invitados se conservan un tiempo limitado por seguridad.
      </p>

      <h2 id="delete-account" style={H2}>7. Eliminar tu cuenta</h2>
      <p style={P}>
        Puedes eliminar tu cuenta de forma permanente en cualquier momento desde la app:{" "}
        <strong>Ajustes → Eliminar cuenta</strong>, o en la web en{" "}
        <a href="/account/delete" style={LINK}>jchat.cloud/account/delete</a>. La eliminación es inmediata e irreversible. Si no puedes
        acceder a la app, escríbenos a{" "}
        <a href="mailto:soporte@jchat.cloud" style={LINK}>soporte@jchat.cloud</a> desde el correo
        de tu cuenta y la eliminaremos.
      </p>
      <p style={P}>
        <strong>Cuentas de dueños de locales.</strong> Puedes eliminar tu cuenta tú mismo desde la app (Ajustes → Eliminar
        cuenta) o en jchat.cloud/account/delete. Tu local se cierra (deja de ser visible y de aceptar pedidos) y tus datos
        personales se borran de inmediato. Los registros de pedidos, pagos y recibos del local se conservan hasta 7 años,
        sin tus datos personales, porque la contabilidad y la normativa fiscal lo exigen. Tu suscripción se cancela al
        momento, sin reembolso del periodo ya pagado. Si Stripe aún tiene saldo tuyo sin transferir, primero debe llegar a
        tu banco.
      </p>

      <h2 id="your-rights" style={H2}>8. Tus derechos</h2>
      <p style={P}>
        Según dónde vivas, puedes tener derecho a acceder, corregir, descargar o eliminar tu información
        personal, y a oponerte o limitar ciertos tratamientos. Puedes editar tu perfil y ajustes en la app y
        contactarnos para lo demás. No te discriminaremos por ejercer tus derechos.
      </p>

      <h2 id="children" style={H2}>9. Menores</h2>
      <p style={P}>
        JChat es para adultos. Debes tener <strong>18 años o más</strong> para crear una cuenta. No
        recopilamos a sabiendas información de menores de 18; si crees que lo hemos hecho, contáctanos y la
        eliminaremos.
      </p>

      <h2 id="security" style={H2}>10. Seguridad</h2>
      <p style={P}>
        Los datos se cifran en tránsito (HTTPS/TLS). El acceso a datos personales está restringido y las
        operaciones sensibles (pagos, eliminación de cuenta, moderación) se ejecutan en nuestros servidores,
        no en tu dispositivo. Ningún sistema es totalmente seguro; usa una contraseña fuerte y activa el
        bloqueo biométrico opcional en Ajustes.
      </p>

      <h2 id="international" style={H2}>11. Usuarios internacionales</h2>
      <p style={P}>
        Nuestros servidores están en Estados Unidos. Si usas el Servicio desde otro país, tu información se
        transfiere y procesa en Estados Unidos.
      </p>

      <h2 id="tracking" style={H2}>12. Rastreo y publicidad</h2>
      <p style={P}>
        No usamos tus datos para publicidad de terceros ni te rastreamos en apps o sitios de otras empresas.
      </p>

      <h2 id="changes" style={H2}>13. Cambios</h2>
      <p style={P}>
        Podemos actualizar esta política. Publicaremos la nueva versión aquí con su fecha y, si el cambio es
        importante, te avisaremos en la app.
      </p>

      <h2 id="contact" style={H2}>14. Contacto</h2>
      <p style={P}>
        Otunity Labs LLC · 6000 Palm Trace Landings Dr APT 312, Davie, FL 33314, EE. UU. ·{" "}
        <a href="mailto:soporte@jchat.cloud" style={LINK}>soporte@jchat.cloud</a>
      </p>
    </>
  );
}
