import type { HelpChapter } from '../../types';

const chapter: HelpChapter = {
  id: 'reservations',
  title: 'Reservar una mesa',
  summary: 'Cómo reservar desde la ficha de un local, qué significa cada estado y cómo cancelar.',
  goal: 'Vas a reservar una mesa en un local, seguir su estado y cancelarla si cambian tus planes.',
  sections: [
    {
      id: 'make-a-reservation',
      title: 'Hacer una reserva',
      blocks: [
        { type: 'p', text: `Solo eliges: no hay nada que escribir. Una reserva es una solicitud: el local la confirma después.` },
        {
          type: 'steps',
          items: [
            `Abre la pestaña **Mapa** y toca el local donde quieres reservar.`,
            `En la ficha del local, toca **Reservar**.`,
            `Paso **¿Qué día?**: elige un día de la tira de 14 días. Para ir más lejos, toca **Más fechas** y elige en el calendario (hasta 60 días). Los días en que el local no recibe reservas no se pueden elegir.`,
            `Paso **¿A qué hora?**: elige una hora. Las horas van de 30 en 30 minutos y son las del local. Las que dicen **Lista de espera** están llenas, pero aún puedes anotarte en la lista.`,
            `Paso **¿Cuántas personas?**: elige de 1 a 8. Toca **9+** si son más (hasta 20).`,
            `Paso **¿Alguna petición? (opcional)**: marca las que quieras (por ejemplo **Cumpleaños**, **Terraza** o **Alergias**) o ninguna, y toca **Continuar**.`,
            `En **Revisa tu reserva** comprueba los datos. Si algo no es correcto, toca **Cambiar** junto a ese dato.`,
            `Toca **Confirmar reserva**. Si elegiste una hora llena, el botón dice **Unirme a la lista de espera**.`,
          ],
        },
        { type: 'note', kind: 'important', text: `Si marcas **Alergias**, la app te recuerda: avísale al local al llegar.` },
      ],
    },
    {
      id: 'times-and-clock',
      title: 'Cómo se muestra la hora',
      blocks: [
        { type: 'p', text: `La hora de una reserva es siempre la del local. En español se muestra en formato de 24 horas (por ejemplo, 19:00). En inglés se muestra en formato de 12 horas (por ejemplo, 7:00 PM).` },
        { type: 'p', text: `Cambia el idioma de la app en **Ajustes** → **Idioma**. Lo explicamos en [Perfil y privacidad](/help/users/profile-and-privacy).` },
      ],
    },
    {
      id: 'status',
      title: 'Qué significa cada estado',
      blocks: [
        { type: 'p', text: `Cada reserva muestra una etiqueta con su estado:` },
        {
          type: 'list',
          items: [
            `**Pendiente de confirmación**: enviaste la solicitud y el local aún no responde.`,
            `**Confirmada**: el local aceptó tu reserva.`,
            `**Rechazada**: el local no pudo aceptarla. Si lo indicó, verás el motivo: **Sin disponibilidad**, **Local cerrado ese día** o **Grupo demasiado grande**.`,
            `**Cancelada**: la reserva se canceló.`,
            `**Sin respuesta del local**: la hora ya pasó y el local nunca respondió.`,
            `**Llegó** y **No se presentó**: los marca el local después de la hora.`,
            `**Lista de espera**: etiqueta extra de las reservas que hiciste en una hora llena.`,
          ],
        },
        { type: 'p', text: `Cuando el local confirma o rechaza tu solicitud, recibes una notificación.` },
      ],
    },
    {
      id: 'my-reservations',
      title: 'Ver tus reservas',
      blocks: [
        {
          type: 'steps',
          items: [
            `Toca la pestaña **Perfil**.`,
            `Toca el icono de ajustes.`,
            `Toca **Mis reservas**.`,
          ],
        },
        { type: 'p', text: `La lista tiene dos partes: **Próximas** y **Anteriores**. Arriba verás **Tu próxima reserva** con la información más importante. Esa tarjeta también aparece al principio de la pestaña **Cerca** mientras tengas una reserva pendiente o confirmada.` },
        { type: 'p', text: `La tarjeta tiene cuatro botones: **Cómo llegar** (abre la app de mapas de tu teléfono), **Añadir al calendario**, **Ver local** y **Cancelar**.` },
        { type: 'note', kind: 'tip', text: `Después de reservar, toca **Ver mis reservas** en la pantalla de confirmación para ir directo a la lista.` },
      ],
    },
    {
      id: 'calendar-and-reminders',
      title: 'Calendario y recordatorios',
      blocks: [
        {
          type: 'steps',
          items: [
            `En **Mis reservas** o en la tarjeta **Tu próxima reserva**, toca **Añadir al calendario**.`,
            `Revisa el evento que se abre y guárdalo en tu calendario.`,
          ],
        },
        { type: 'p', text: `El botón aparece solo en reservas pendientes o confirmadas que todavía no han pasado. En Android se abre el editor del calendario directamente. En iPhone con iOS 17 o más nuevo también; en versiones anteriores de iOS la app te pide permiso la primera vez. Si lo negaste, verás: Permite el acceso al calendario en Ajustes para añadir la reserva.` },
        { type: 'p', text: `Si tu reserva está pendiente o confirmada, también puedes recibir un aviso el día anterior (**Mañana a las…**) y otro 2 horas antes (**En 2 horas…**).` },
      ],
    },
    {
      id: 'cancel',
      title: 'Cancelar una reserva',
      blocks: [
        {
          type: 'steps',
          items: [
            `Abre **Mis reservas** o la tarjeta **Tu próxima reserva**.`,
            `Toca **Cancelar reserva** (en la tarjeta, **Cancelar**).`,
            `En **¿Cancelar la reserva?**, toca **Cancelar reserva** para confirmar. Si cambias de idea, toca **Volver**.`,
            `Verás el aviso **Reserva cancelada** y el estado cambiará a **Cancelada**.`,
          ],
        },
        { type: 'note', kind: 'important', text: `Solo puedes cancelar reservas pendientes o confirmadas que aún no han pasado. La app no permite editar una reserva: si necesitas otra fecha u hora, cancela y haz una nueva.` },
      ],
    },
  ],
};

export default chapter;
