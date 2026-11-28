import type { HelpChapter } from '../../types';

const chapter: HelpChapter = {
  id: 'messages',
  title: 'Mensajes, amigos y notificaciones',
  summary: 'Cómo escribir por privado, seguir a otras personas, aceptar solicitudes y revisar tus notificaciones.',
  goal: 'Vas a escribirle a alguien por privado, a manejar tus seguidores y a saber dónde ver tus avisos.',
  sections: [
    {
      id: 'inbox',
      title: 'La pestaña Mensajes',
      blocks: [
        {
          type: 'p',
          text: 'Toca **Mensajes** en la barra de abajo. La pantalla tiene dos partes:',
        },
        {
          type: 'list',
          items: [
            '**Mensajes privados**: tus conversaciones uno a uno. Si tienes mensajes sin leer, verás cuántos con la etiqueta **nuevos**.',
            '**Notificaciones**: los avisos de la app, como seguidores nuevos, mensajes, reacciones a tus publicaciones, pedidos y reservas.',
          ],
        },
        {
          type: 'note',
          kind: 'tip',
          text: 'Si aún no tienes conversaciones, la app te dice **Aún no tienes conversaciones** y que puedes iniciar un chat desde el perfil de alguien.',
        },
      ],
    },
    {
      id: 'send-dm',
      title: 'Escribirle a alguien por privado',
      blocks: [
        {
          type: 'steps',
          items: [
            'Abre el perfil de la persona y toca **Mensaje**. En el chat de un local también puedes tocar su foto y luego **DM**.',
            'Escribe en el campo **Mensaje…** y toca el botón de enviar.',
            'Para mandar una foto, toca el botón de la foto, elige **Tomar foto** o **Elegir de la galería** y permite el acceso si la app lo pide.',
            'Para mandar una nota de voz, toca el micrófono, habla y toca el botón de enviar.',
          ],
        },
        {
          type: 'note',
          kind: 'important',
          text: 'No siempre puedes escribirle a alguien. Cada persona decide quién puede mandarle mensajes directos. Si no te deja, la app dice **Este usuario no acepta mensajes directos.**, **Debes seguir a este usuario para enviarle un mensaje.** o **No puedes enviar mensajes a este usuario.**',
        },
        {
          type: 'list',
          items: [
            'Las fotos de los mensajes directos se revisan. A quien la envía le aparece **En revisión**; a quien la recibe, **Revisando foto…**, hasta que se aprueba.',
            'Una foto que puede ser sensible aparece borrosa con **Foto sensible**. Toca **Ver de todos modos** para verla o **Reportar** para avisarnos.',
            'Los GIF no se pueden enviar en mensajes: la app muestra **GIF no permitido**.',
          ],
        },
        {
          type: 'p',
          text: 'Para decidir quién puede escribirte tú, mira [Perfil y privacidad](/help/users/profile-and-privacy#privacy).',
        },
      ],
    },
    {
      id: 'friends',
      title: 'Seguir y aceptar solicitudes',
      blocks: [
        {
          type: 'p',
          text: 'En JChat sigues a otras personas y ellas te siguen. Si una cuenta es privada, tu seguimiento es una solicitud que la otra persona debe aceptar.',
        },
        {
          type: 'steps',
          items: [
            'Abre el perfil de la persona, o toca su foto en el chat de un local.',
            'Toca **Seguir**. El botón pasa a **Siguiendo**; si la cuenta es privada, pasa a **Solicitado**.',
            'Para dejar de seguir, toca **Siguiendo** y confirma con **Dejar de seguir**. Para retirar una solicitud, toca **Solicitado** y confirma con **Cancelar solicitud**.',
          ],
        },
        { type: 'p', text: 'Para ver tus listas y responder solicitudes:' },
        {
          type: 'steps',
          items: [
            'Toca **Perfil** y luego **Editar perfil**.',
            'En **Tu red**, toca **Seguidores**, **Siguiendo** o **Solicitudes**. La pantalla se llama **Amigos**.',
            'En **Solicitudes**, toca **Aceptar** o **Rechazar** en cada una.',
            'En **Seguidores**, **Quitar** deja de tener a esa persona como seguidora. En **Siguiendo**, **Dejar de seguir** hace lo que dice.',
          ],
        },
      ],
    },
    {
      id: 'manage-conversations',
      title: 'Borrar, reportar y bloquear',
      blocks: [
        {
          type: 'steps',
          items: [
            'Para borrar una conversación, desliza su fila en **Mensajes privados** y toca **Eliminar**. La app pregunta **¿Eliminar conversación?**; confirma.',
            'Para reportar o bloquear a la persona, abre la conversación y toca los tres puntos de arriba. Elige **Reportar usuario** o **Bloquear a** esa persona.',
            'Para reportar un solo mensaje, mantén presionado el mensaje de la otra persona.',
          ],
        },
        {
          type: 'note',
          kind: 'important',
          text: 'Borrar una conversación la quita solo de tu bandeja: la otra persona la sigue viendo.',
        },
        {
          type: 'p',
          text: 'Los motivos de reporte y lo que pasa después están en [Seguridad](/help/users/safety#reporting). Para ver o deshacer tus bloqueos, mira [Seguridad](/help/users/safety#blocking).',
        },
      ],
    },
    {
      id: 'notifications',
      title: 'Notificaciones',
      blocks: [
        {
          type: 'p',
          text: 'Los avisos aparecen en **Notificaciones**, debajo de tus mensajes privados. También te llegan como notificaciones del teléfono si permitiste las notificaciones. Si estás en el chat de un local, la campana de arriba las abre.',
        },
        {
          type: 'steps',
          items: [
            'Toca un aviso para ir directo a lo que cambió, por ejemplo un pedido o un mensaje.',
            'Para quitar un aviso, desliza su fila y toca **Eliminar**.',
          ],
        },
        {
          type: 'list',
          items: [
            'Si tienes un pedido en curso, lo verás arriba de la lista con **En curso**. Tócalo para abrir su seguimiento.',
            'Para apagar los avisos sociales (seguidores, reacciones y mensajes) o cambiar qué muestra la pantalla bloqueada, mira [Perfil y privacidad](/help/users/profile-and-privacy#settings).',
            'Si no te llegan, mira [Solución de problemas](/help/users/troubleshooting#notifications).',
          ],
        },
      ],
    },
  ],
};

export default chapter;
