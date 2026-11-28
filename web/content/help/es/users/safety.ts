import type { HelpChapter } from '../../types';

const chapter: HelpChapter = {
  id: 'safety',
  title: 'Seguridad: reportar y bloquear',
  summary: 'Cómo reportar a una persona, un mensaje o una publicación, cómo bloquear y cuáles son las normas de la comunidad.',
  goal: 'Vas a saber reportar y bloquear en la app y qué esperamos de todas las personas que usan JChat.',
  sections: [
    {
      id: 'community-rules',
      title: 'Normas de la comunidad',
      blocks: [
        { type: 'p', text: `JChat es para personas de 18 años o más que quieren conocerse y conversar en lugares reales. Lee las normas completas en [Seguridad y normas de la comunidad](/safety). No se permite:` },
        {
          type: 'list',
          items: [
            `Contenido sexual con menores, ni intentar contactar o aprovecharse de un menor.`,
            `Acoso, amenazas, discurso de odio o discriminación.`,
            `Contenido sexual explícito, violencia o actividad ilegal.`,
            `Spam, estafas o suplantación de identidad.`,
          ],
        },
        { type: 'note', kind: 'important', text: `Las cuentas que incumplen las normas se suspenden o se eliminan. Los casos graves pueden comunicarse a las autoridades.` },
      ],
    },
    {
      id: 'reporting',
      title: 'Reportar',
      blocks: [
        { type: 'p', text: `Puedes reportar desde varios lugares de la app:` },
        {
          type: 'list',
          items: [
            `En el chat de un local: mantén presionado un mensaje de otra persona y toca **Reportar mensaje**. También puedes tocar a la persona y elegir **Reportar**.`,
            `En un perfil: abre el menú del perfil y toca **Reportar**.`,
            `En una publicación: abre el menú de acciones y toca **Reportar publicación**.`,
            `En una historia: toca el icono de reporte (**Reportar esta historia**).`,
            `En un mensaje directo: abre el menú del chat y toca **Reportar usuario**, o mantén presionado un mensaje recibido y toca **Reportar mensaje**.`,
          ],
        },
        {
          type: 'steps',
          items: [
            `Elige el motivo: **Spam o estafa**, **Acoso o intimidación**, **Discurso de odio o discriminación**, **Amenazas o violencia**, **Contenido sexual**, **Seguridad de un menor — un menor está en riesgo**, **Suplantación de identidad**, **Infracción de derechos de autor** u **Otro**.`,
            `Añade detalles. Son opcionales, salvo en **Otro**, donde debes contar qué pasó.`,
            `Toca **Enviar reporte**.`,
          ],
        },
        { type: 'note', kind: 'important', text: `Si alguien está en peligro inmediato, llama al 911. No esperes a que se revise un reporte.` },
        { type: 'p', text: `No puedes reportar tu propio contenido, y hay un límite de reportes por día: si lo alcanzas, la app te avisa y puedes intentarlo mañana.` },
      ],
    },
    {
      id: 'blocking',
      title: 'Bloquear',
      blocks: [
        { type: 'p', text: `Bloquear a alguien hace que dejes de ver sus mensajes y que no pueda contactarte. En su perfil, además, no podrá ver tu perfil ni escribirte.` },
        {
          type: 'steps',
          items: [
            `Abre el menú de la persona: su perfil, el chat del local o el chat directo.`,
            `Toca **Bloquear** (en un chat directo: **Bloquear a** seguido del nombre).`,
            `Confirma con **Bloquear**.`,
          ],
        },
        { type: 'note', kind: 'important', text: `Bloquear no te quita de la sala de un local ni quita a la otra persona de ella. Los seguimientos que se quitaron al bloquear no se restauran al desbloquear.` },
        {
          type: 'steps',
          items: [
            `Para desbloquear, abre **Ajustes** → **Ajustes de privacidad** → **Usuarios bloqueados**.`,
            `Toca **Desbloquear** junto a la persona y confirma.`,
          ],
        },
      ],
    },
    {
      id: 'more-help',
      title: 'Más ayuda',
      blocks: [
        { type: 'p', text: `También puedes escribir a [safety@jchat.cloud](mailto:safety@jchat.cloud) con el nombre de usuario, lo que pasó y, si puedes, una captura de pantalla. Para otras dudas, escribe a [soporte@jchat.cloud](mailto:soporte@jchat.cloud).` },
        { type: 'p', text: `Si tienes problemas para entrar a un chat o con las notificaciones, mira [Problemas frecuentes](/help/users/troubleshooting).` },
      ],
    },
  ],
};

export default chapter;
