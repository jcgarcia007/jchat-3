import type { HelpChapter } from '../../types';

const chapter: HelpChapter = {
  id: 'reservations',
  title: 'Reservas',
  summary: 'Define tu horario, responde las solicitudes de mesa y crea reservas por teléfono.',
  goal: 'Vas a recibir solicitudes de reserva, confirmarlas o rechazarlas y llevar el control de quién llega.',
  sections: [
    {
      id: 'how-it-works',
      title: 'Cómo funcionan las reservas',
      blocks: [
        {
          type: 'p',
          text: 'Los clientes piden su mesa desde la app: eligen el día, la hora y cuántas personas son. Cada solicitud llega a tu panel como **Pendiente** y el cliente espera tu respuesta.',
        },
        {
          type: 'p',
          text: 'Las horas que se ofrecen salen de tu horario de atención: cada 30 minutos, desde la apertura hasta el cierre, y hasta 60 días por delante. Los días que marques como cerrados no reciben reservas.',
        },
        {
          type: 'p',
          text: 'Las reservas están en el panel web, en el grupo **Pedidos**, en la opción **Reservas**. La hora se muestra en 24 horas en español y en 12 horas en inglés.',
        },
      ],
    },
    {
      id: 'set-hours',
      title: 'Define el horario en que recibes reservas',
      blocks: [
        {
          type: 'steps',
          items: [
            'En el panel, abre **Configuración** (el engranaje al pie del menú lateral).',
            'Busca la sección **Horario de atención**.',
            'Para cada día, elige la hora de apertura y la de cierre, o activa **Cerrado** si ese día no atiendes.',
            'Si tu horario es igual todos los días, usa el botón **Copiar a todos los días** de una fila.',
            'Pulsa **Guardar horario**.',
          ],
        },
        {
          type: 'note',
          kind: 'tip',
          text: 'Si cierras después de la medianoche, el panel te lo recuerda con el aviso **Cierra al día siguiente**.',
        },
        {
          type: 'note',
          kind: 'important',
          text: 'Si cambias el horario, las solicitudes que ya tienes no se modifican. Revisa tu lista de **Reservas** por si alguna cae en un día que ya no atiendes.',
        },
      ],
    },
    {
      id: 'answer-requests',
      title: 'Confirma o rechaza una solicitud',
      blocks: [
        {
          type: 'p',
          text: 'El número de solicitudes sin responder aparece en la pestaña **Pendientes** y en el menú **Reservas**. Puedes ver las reservas en **Calendario** o en **Lista**, y filtrarlas por estado: **Todas**, **Confirmada**, **Llegó**, **Ausente**, **Cancelada**, **Rechazada** o **Sin respuesta**.',
        },
        {
          type: 'steps',
          items: [
            'En **Reservas**, busca la solicitud **Pendiente**. Verás la fecha, la hora, las personas y las peticiones del cliente (por ejemplo, terraza o cumpleaños).',
            'Para aceptarla, pulsa **Confirmar**. Verás el mensaje **Reserva confirmada. Se avisó al cliente.**',
            'Para no aceptarla, pulsa **Rechazar**.',
            'Si quieres, elige un motivo: **Sin disponibilidad**, **Local cerrado ese día** o **Grupo demasiado grande**. Es opcional y el cliente lo verá.',
            'Pulsa **Rechazar reserva**. Si te arrepientes, pulsa **Volver**.',
          ],
        },
        {
          type: 'note',
          kind: 'important',
          text: 'Una reserva ya **Confirmada** todavía se puede rechazar si algo cambia. El cliente recibe el aviso del cambio.',
        },
        {
          type: 'p',
          text: 'Si el cliente marcó **Alergias (avisará al llegar)**, lo verás en la solicitud. Prepárate para que te lo repita al llegar.',
        },
      ],
    },
    {
      id: 'manual-and-arrival',
      title: 'Crea reservas, edítalas y marca la llegada',
      blocks: [
        {
          type: 'steps',
          items: [
            'Para anotar una reserva que te piden por teléfono, pulsa **Nueva Reserva**.',
            'Escribe el **Teléfono**. Si el cliente ya existe, verás **Cliente encontrado — datos autocompletados**; si no, completa **Nombre** y **Apellido**.',
            'Elige la **Fecha y hora** y las **Personas**.',
            'Si quieres, elige las **Mesas** (es opcional y puedes asignarlas después). También puedes completar **Tipo de evento** y **Solicitudes especiales (opcional)**.',
            'Pulsa **Confirmar Reserva**.',
          ],
        },
        {
          type: 'p',
          text: 'Para cambiar una reserva, pulsa **Editar** en su fila y luego **Guardar cambios**. Desde ahí también puedes marcar **Ausente** a quien no se presentó o pulsar **Cancelar reserva**.',
        },
        {
          type: 'steps',
          items: [
            'Cuando el cliente llegue, pulsa **Check-in** en su reserva.',
            'Asigna una mesa. Sin mesa no puedes confirmar la llegada.',
            'Pulsa **Confirmar llegada**. La reserva pasa a **Llegó**.',
          ],
        },
      ],
    },
    {
      id: 'no-answer',
      title: 'Si no respondes a tiempo',
      blocks: [
        {
          type: 'p',
          text: 'Si pasa la hora de una solicitud **Pendiente** y nadie la respondió, en tu panel aparece como **Sin respuesta** y ya no se puede confirmar. Unas 2 horas después de esa hora, el sistema la cierra de forma definitiva y libera las mesas que tuviera asignadas. No se avisa al cliente.',
        },
        {
          type: 'note',
          kind: 'tip',
          text: 'Mira la pestaña **Pendientes** al empezar cada turno para que ninguna solicitud caduque sin respuesta.',
        },
      ],
    },
    {
      id: 'notices',
      title: 'Qué avisos recibes y qué recibe el cliente',
      blocks: [
        {
          type: 'list',
          items: [
            'Tú recibes un aviso en tu teléfono cuando llega una solicitud nueva: «Nueva solicitud» con las personas, la fecha y la hora.',
            'Tú recibes otro aviso si el cliente cancela: «Reserva cancelada», con su nombre, la fecha y la hora. Revisa tu lista para liberar la mesa si la habías asignado.',
            'El cliente recibe un aviso cuando confirmas («Reserva confirmada») o rechazas («Reserva no aceptada»), y un recordatorio antes de la reserva.',
          ],
        },
      ],
    },
  ],
};

export default chapter;
