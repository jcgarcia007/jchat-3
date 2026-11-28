import type { HelpChapter } from '../../types';

const chapter: HelpChapter = {
  id: 'profile-and-privacy',
  title: 'Perfil, publicaciones y privacidad',
  summary: 'Edita tu perfil, publica fotos, decide quién te ve y ajusta idioma, apariencia, notificaciones y bloqueo de la app.',
  goal: 'Vas a dejar tu perfil y tu privacidad como tú quieres.',
  sections: [
    {
      id: 'your-profile',
      title: 'Tu perfil',
      blocks: [
        { type: 'p', text: `Tu perfil está en la pestaña **Perfil**. Ahí ves tus publicaciones y tu red (seguidores, siguiendo y solicitudes).` },
        {
          type: 'steps',
          items: [
            `Toca la pestaña **Perfil**.`,
            `Toca **Editar perfil**.`,
            `Para cambiar tu foto, toca el avatar y elige una imagen de tu galería.`,
            `Cambia lo que quieras: **Nombre visible**, **Nombre de usuario**, **Biografía** y **Ciudad**.`,
            `Si quieres, toca **Elegir tema** para cambiar el **Tema del perfil**.`,
            `Toca **Guardar**.`,
          ],
        },
        { type: 'note', kind: 'important', text: `El **Nombre de usuario** lleva de 3 a 30 caracteres: minúsculas, números y guiones bajos. La app te dice si está disponible (**Nombre de usuario disponible**) o si ya lo usa otra persona (**Nombre de usuario ya en uso**). En **Ciudad** escribes tú el texto: JChat nunca usa tu ubicación para llenarla.` },
      ],
    },
    {
      id: 'posts',
      title: 'Publicar fotos',
      blocks: [
        {
          type: 'steps',
          items: [
            `En tu perfil, toca **Publicar**.`,
            `Toca **Galería** o **Cámara** para añadir fotos. Puedes adjuntar hasta 4. Si es la primera vez, la app te pide permiso para tus fotos o la cámara.`,
            `Escribe una descripción en **Escribe una descripción…** (hasta 2200 caracteres).`,
            `Si quieres, escribe un lugar en **Ubicación**. Es solo texto que escribes tú: la ubicación nunca se detecta sola.`,
            `Toca **Publicar**.`,
          ],
        },
        {
          type: 'steps',
          items: [
            `Para borrar una publicación tuya, ábrela desde tu perfil.`,
            `Abre el menú de acciones de la publicación y toca **Eliminar**.`,
            `En **¿Eliminar publicación?**, confirma con **Eliminar**.`,
          ],
        },
        { type: 'note', kind: 'important', text: `Al eliminar una publicación, la publicación y sus fotos se borran para siempre.` },
      ],
    },
    {
      id: 'privacy',
      title: 'Quién te ve',
      blocks: [
        { type: 'p', text: `Todo esto está en **Ajustes** → **Ajustes de privacidad**. En esa pantalla la app te recuerda que tu ubicación en tiempo real nunca se comparte y que eso no se puede cambiar.` },
        {
          type: 'steps',
          items: [
            `Toca la pestaña **Perfil** y luego el icono de ajustes.`,
            `Toca **Ajustes de privacidad**.`,
            `En **Visibilidad de la cuenta**, elige **Público** o **Privado**.`,
          ],
        },
        { type: 'p', text: `Con una cuenta privada, quien quiera ver tus publicaciones debe seguirte y tú recibes **Solicitudes**. Quien no te sigue ve **Esta cuenta es privada**.` },
        {
          type: 'list',
          items: [
            `**Quién ve mis publicaciones** y **Quién ve mis historias**: elige entre **Todos**, **Seguidores** o **Solo yo**.`,
            `**Quién puede enviarme MD**: elige entre **Todos**, **Seguidores** o **Nadie**.`,
            `**Quién puede mencionarme (@)**: elige quién puede mencionarte.`,
            `**Confirmaciones de lectura**: permite o no que otros vean cuándo leíste sus mensajes.`,
            `**Estado activo** y **Modo sin conexión**: muestra u oculta cuándo estuviste activo.`,
            `**Ciudad de residencia**: decide si tu ciudad se muestra en tu perfil.`,
            `**Usuarios bloqueados**: la lista de personas que bloqueaste (mira [Seguridad](/help/users/safety)).`,
          ],
        },
      ],
    },
    {
      id: 'settings',
      title: 'Idioma, apariencia y notificaciones',
      blocks: [
        { type: 'p', text: `Entra con la pestaña **Perfil** y el icono de ajustes. La pantalla se llama **Ajustes**.` },
        {
          type: 'steps',
          items: [
            `En **Idioma**, elige **English** o **Español**. La app cambia al momento.`,
            `En **Apariencia** → **Tema**, elige **Oscuro**, **Claro** o **Sistema** (sigue el ajuste de tu teléfono).`,
            `En **Notificaciones**, activa o desactiva **Social** (seguidores, reacciones, mensajes).`,
            `En **Vista previa de mensajes**, elige qué muestra la pantalla bloqueada: **Completa**, **Solo nombre** o **Discreta**.`,
          ],
        },
        { type: 'note', kind: 'tip', text: `Con **Discreta**, la notificación solo dice Tienes una novedad en JChat. El nombre JChat siempre se ve en la notificación.` },
      ],
    },
    {
      id: 'security',
      title: 'Bloqueo de la app y contraseña',
      blocks: [
        { type: 'p', text: `Puedes pedir tu huella o tu cara al abrir la app y antes de pagar.` },
        {
          type: 'steps',
          items: [
            `Abre **Ajustes** y baja hasta **Privacidad y seguridad**.`,
            `En iPhone, activa **Usar Face ID / huella**. En Android, activa **Usar huella o reconocimiento facial**.`,
          ],
        },
        { type: 'note', kind: 'important', text: `Si el interruptor está desactivado, tu teléfono no tiene huella ni reconocimiento facial configurado. En iPhone, configura Face ID o Touch ID en los ajustes del teléfono. En Android, configura una huella o el reconocimiento facial. Luego vuelve.` },
        {
          type: 'steps',
          items: [
            `Para cambiar tu contraseña, abre **Ajustes** y toca **Cambiar contraseña**.`,
            `Escribe **Contraseña actual**, **Nueva contraseña** (mínimo 8 caracteres) y **Confirmar nueva contraseña**.`,
            `Toca **Guardar contraseña**.`,
          ],
        },
        { type: 'p', text: `Para salir de tu cuenta, toca **Cerrar sesión** en **Ajustes** y confirma. Si quieres borrar tu cuenta, mira [Borrar tu cuenta](/help/users/delete-account).` },
      ],
    },
  ],
};

export default chapter;
