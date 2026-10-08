/** Seguridad y normas de la comunidad — contenido en español. Página pública. */

const LINK: React.CSSProperties = { color: "var(--color-brand)", textDecoration: "underline" };
const H1: React.CSSProperties = { fontSize: "28px", fontWeight: 800, color: "var(--gray-900)", marginBottom: "6px", letterSpacing: "-0.5px" };
const H2: React.CSSProperties = { fontSize: "18px", fontWeight: 700, marginTop: "32px", marginBottom: "10px", color: "var(--gray-900)" };
const P: React.CSSProperties = { lineHeight: "1.7", marginTop: "0", marginBottom: "14px", color: "var(--gray-700)" };
const UL: React.CSSProperties = { lineHeight: "1.8", paddingLeft: "20px", marginTop: "0", marginBottom: "14px", color: "var(--gray-700)" };
const DATE: React.CSSProperties = { color: "var(--gray-500)", fontSize: "14px", marginTop: "0", marginBottom: "28px" };

export function SafetyES() {
  return (
    <>
      <h1 style={H1}>Seguridad y normas de la comunidad</h1>
      <p style={DATE}>Última actualización: 8 de octubre de 2026</p>

      <p style={P}>
        JChat es para adultos (18+) que quieren conocer gente y conversar en lugares reales. Todos deben sentirse seguros.
        Aquí explicamos nuestras normas, cómo reportar un problema y con qué rapidez actuamos.
      </p>

      <h2 style={H2}>Tolerancia cero</h2>
      <p style={P}>No permitimos y retiramos —y reportamos cuando la ley lo exige—:</p>
      <ul style={UL}>
        <li>Cualquier contenido sexual con menores y cualquier intento de contactar, engañar o explotar a un menor.</li>
        <li>Acoso, amenazas, discurso de odio y discriminación.</li>
        <li>Contenido sexualmente explícito, violencia y actividad ilegal.</li>
        <li>Spam, estafas y suplantación de identidad.</li>
      </ul>
      <p style={P}>Las cuentas que incumplen estas normas se suspenden o eliminan. Los casos graves pueden reportarse a las autoridades.</p>

      <h2 style={H2}>Seguridad infantil (CSAE)</h2>
      <p style={P}>
        JChat es solo para personas de 18 años o más: verificamos la edad al registrarse y eliminamos las cuentas que resulten ser
        de un menor. El material de abuso y explotación sexual infantil (CSAM) y cualquier conducta que ponga en peligro a
        niños y niñas están estrictamente prohibidos. Cuando encontramos o nos avisan de ese contenido, lo retiramos de inmediato,
        conservamos las pruebas que exige la ley, suspendemos la cuenta y lo reportamos al Centro Nacional para Niños
        Desaparecidos y Explotados (NCMEC) y a las autoridades competentes. Nuestro contacto designado de seguridad infantil es <a href="mailto:safety@jchat.cloud" style={LINK}>safety@jchat.cloud</a>.
      </p>

      <h2 style={H2}>Cómo reportar</h2>
      <ul style={UL}>
        <li><strong>En la app:</strong> abre el perfil o el menú del mensaje y elige <em>Reportar</em>. También puedes elegir <em>Bloquear</em> para cortar todo contacto.</li>
        <li><strong>Por correo:</strong> <a href="mailto:safety@jchat.cloud" style={LINK}>safety@jchat.cloud</a>. Indica el usuario, qué pasó y, si puedes, una captura de pantalla.</li>
        <li><strong>Emergencia:</strong> si alguien está en peligro inmediato, llama primero al número de emergencias de tu país.</li>
      </ul>

      <h2 style={H2}>Con qué rapidez respondemos</h2>
      <p style={P}>
        Revisamos cada reporte en un máximo de <strong>24 horas</strong>; los de seguridad infantil se atienden primero. Si el contenido
        o la cuenta incumple las normas, lo retiramos y te informamos del resultado cuando es posible.
      </p>

      <h2 style={H2}>Herramientas de bloqueo y privacidad</h2>
      <p style={P}>
        Puedes bloquear a cualquier persona desde su perfil o desde un chat. Quien bloqueas no puede escribirte ni ver tu perfil.
        Tú decides quién puede seguirte y escribirte en <em>Ajustes → Privacidad</em>. Puedes eliminar tu cuenta cuando quieras
        (consulta <a href="/support#delete-account" style={LINK}>Ayuda y soporte</a>).
      </p>

      <h2 style={H2}>Contacto</h2>
      <p style={P}>Reportes de seguridad y abuso: <a href="mailto:safety@jchat.cloud" style={LINK}>safety@jchat.cloud</a>. Otras consultas: consulta <a href="/contact" style={LINK}>Contacto</a>.</p>
    </>
  );
}
