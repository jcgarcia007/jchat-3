import type { HelpChapter } from '../../types';

const chapter: HelpChapter = {
  id: 'delete-account',
  title: 'Borrar tu cuenta',
  summary: 'Cómo eliminar tu cuenta desde la app o desde la web, qué se borra y qué se conserva.',
  goal: 'Vas a eliminar tu cuenta de JChat, con o sin la app, sabiendo qué pasa con tus datos.',
  sections: [
    {
      id: 'before-you-start',
      title: 'Antes de empezar',
      blocks: [
        { type: 'p', text: `Eliminar tu cuenta es inmediato y no se puede deshacer. Si solo quieres descansar de las notificaciones o esconder tu perfil, mira [Perfil y privacidad](/help/users/profile-and-privacy).` },
        { type: 'note', kind: 'important', text: `Si eres dueño de un local, eliminar tu cuenta cierra tu local (no se reabre) y cancela tu suscripción. Antes de confirmar verás exactamente qué pasa. Lee [Cerrar tu local](/help/business/close-your-venue).` },
      ],
    },
    {
      id: 'in-the-app',
      title: 'Desde la app',
      blocks: [
        {
          type: 'steps',
          items: [
            `Toca la pestaña **Perfil** y luego el icono de ajustes.`,
            `Baja hasta **Eliminar cuenta** y tócalo.`,
            `En **Eliminar cuenta**, lee el aviso y toca **Continuar**.`,
            `En **¿Estás totalmente seguro?**, toca **Eliminar mi cuenta**.`,
            `Espera a que termine (**Borrando tu cuenta…**). Verás **Cuenta eliminada** y la app cerrará tu sesión.`,
          ],
        },
        {
          type: 'image',
          src: '/help/users/delete-account/settings-bottom-es.webp',
          alt: 'La opción Eliminar cuenta al final de Ajustes.',
          platform: 'ios',
          width: 780,
          height: 1696,
        },
        { type: 'note', kind: 'tip', text: `Si algo falla, la app muestra un código. Escríbenos a [soporte@jchat.cloud](mailto:soporte@jchat.cloud) con ese código.` },
      ],
    },
    {
      id: 'on-the-web',
      title: 'Desde la web',
      blocks: [
        {
          type: 'steps',
          items: [
            `Abre [jchat.cloud/account/delete](/account/delete).`,
            `Toca **Iniciar sesión para borrar mi cuenta** e inicia sesión con la cuenta que quieres eliminar.`,
            `De vuelta en la página, escribe la palabra **ELIMINAR** para confirmar.`,
            `Toca **Eliminar mi cuenta**.`,
          ],
        },
        { type: 'p', text: `Si no puedes entrar, escribe a [soporte@jchat.cloud](mailto:soporte@jchat.cloud) desde el correo de tu cuenta.` },
      ],
    },
    {
      id: 'what-is-deleted',
      title: 'Qué se borra y qué se conserva',
      blocks: [
        { type: 'p', text: `Se borra al momento:` },
        {
          type: 'list',
          items: [
            `Tu perfil: nombre, usuario, biografía y fotos.`,
            `Tus mensajes (chats de locales y mensajes directos) y tus comentarios.`,
            `Tus publicaciones, historias, seguidos, bloqueos, reseñas, notificaciones y ajustes.`,
          ],
        },
        { type: 'p', text: `Se conserva, sin tu identidad o por tiempo limitado:` },
        {
          type: 'list',
          items: [
            `Pedidos y pagos: 7 años, sin tus datos personales, por obligaciones fiscales y contables.`,
            `Registros de seguridad: 90 días.`,
            `Reportes de moderación: 1 año desde que se resuelven (2 años los de seguridad infantil).`,
            `Los regalos y los reportes que enviaste o recibiste se conservan sin tu identidad.`,
          ],
        },
        { type: 'p', text: `El detalle completo está en [Política de privacidad](/privacy) y en [jchat.cloud/account/delete](/account/delete).` },
      ],
    },
  ],
};

export default chapter;
