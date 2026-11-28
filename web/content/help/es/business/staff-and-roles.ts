import type { HelpChapter } from '../../types';

const chapter: HelpChapter = {
  id: 'staff-and-roles',
  title: 'Empleados y roles',
  summary: 'Añade a tu equipo, asigna un rol y crea roles propios con los permisos que quieras.',
  goal: 'Vas a añadir empleados a tu local, darles un rol y decidir qué puede hacer cada uno.',
  sections: [
    {
      id: 'add-employee',
      title: 'Añade un empleado',
      blocks: [
        {
          type: 'p',
          text: 'Tu equipo se maneja en el panel web. La persona que quieres añadir necesita tener ya una cuenta de JChat: la buscas por su nombre de usuario.',
        },
        {
          type: 'image',
          src: '/help/business/staff-and-roles/dash-es.webp',
          alt: 'Pantalla Empleados con la lista de personal, el botón Añadir empleado y la referencia de roles.',
          platform: 'web',
          width: 1280,
          height: 800,
        },
        {
          type: 'steps',
          items: [
            'En el panel, abre **Configuración** (el engranaje al pie del menú lateral) y entra en **Empleados**.',
            'Pulsa **+ Añadir empleado**.',
            'En **Nombre de usuario**, escribe su usuario (por ejemplo **@usuario**).',
            'En **Rol**, elige uno del grupo **Estándar** o uno **Personalizado** que hayas creado.',
            'Pulsa **Añadir**. Verás un mensaje como «Se añadió a @usuario como Cajero.»',
          ],
        },
        {
          type: 'note',
          kind: 'important',
          text: 'Si ves **No se encontró ningún usuario con el nombre @usuario.**, revisa que esté bien escrito y que la persona ya tenga su cuenta.',
        },
        {
          type: 'p',
          text: 'Quien añades desde el formulario queda aceptado al instante, sin tener que responder, y recibe un aviso en su teléfono: «te agregó como…». En **Plantilla** ves a todo tu equipo con su rol y su estado (por ejemplo **Activo**). Los estados **Sin responder** y **Rechazado** solo aparecen en invitaciones antiguas. En cada fila puedes poner el **Nombre en el recibo** (opcional) con **Editar nombre en el recibo** y **Guardar nombre**; si lo dejas vacío, se usa su nombre en JChat.',
        },
      ],
    },
    {
      id: 'fixed-roles',
      title: 'Los roles estándar',
      blocks: [
        {
          type: 'p',
          text: 'Estos son los roles que vienen listos. Los ves también en **Referencia de roles**, al final de la página **Empleados**:',
        },
        {
          type: 'list',
          items: [
            '**Gerente**: acceso total: configuración, ofertas, informes, personal.',
            '**Cajero**: procesa pedidos y pagos.',
            '**Mesero**: toma pedidos y gestiona el servicio de mesas.',
            '**Cocina**: pensado para el personal de cocina.',
            '**Moderador de chat**: gestiona el contenido y los usuarios del chat.',
            '**Analista**: acceso de solo lectura a analíticas e informes.',
          ],
        },
        {
          type: 'p',
          text: 'Tú eres el **Dueño**: tienes todos los permisos, incluida la facturación y los pagos. Esos dos permisos son **Solo el dueño** y no se pueden dar a nadie más.',
        },
      ],
    },
    {
      id: 'custom-roles',
      title: 'Crea un rol propio',
      blocks: [
        {
          type: 'p',
          text: 'Si ningún rol estándar te sirve, crea uno con los permisos exactos que necesitas. Por ejemplo, alguien que solo gestione reservas.',
        },
        {
          type: 'steps',
          items: [
            'En el menú de **Configuración**, entra en **Roles**.',
            'Pulsa **Nuevo rol** (o **Crear el primer rol** si aún no tienes ninguno).',
            'Escribe el **Nombre del rol**, por ejemplo «Cajero senior».',
            'Si quieres partir de un rol estándar, elígelo en **Empezar desde una plantilla**. Rellena los interruptores y luego puedes ajustar cualquiera.',
            'En **Permisos**, activa solo lo que esa persona necesita. Por ejemplo, **Gestionar reservas**, **Crear / editar ofertas** o **Moderar el chat**.',
            'Pulsa **Crear rol**.',
          ],
        },
        {
          type: 'p',
          text: 'Para cambiar un rol, pulsa su botón de editar y luego **Actualizar rol**. El rol nuevo aparece en el grupo **Personalizado** cuando añades un empleado.',
        },
        {
          type: 'note',
          kind: 'tip',
          text: 'Empieza con pocos permisos y ve añadiendo. Es más fácil dar más acceso después que quitarlo.',
        },
      ],
    },
    {
      id: 'remove-and-limits',
      title: 'Quita a un empleado y límites del plan',
      blocks: [
        {
          type: 'steps',
          items: [
            'En **Empleados**, busca a la persona en **Plantilla**.',
            'Pulsa el botón de quitar de su fila.',
            'Confirma el mensaje «¿Quitar a… de tu personal? Esto no se puede deshacer.»',
          ],
        },
        {
          type: 'p',
          text: 'Si borras un rol personalizado, los empleados que lo tenían vuelven a mostrar su rol como texto simple.',
        },
        {
          type: 'p',
          text: 'La barra **Uso de personal** te dice cuántos empleados llevas y cuántos permite tu plan por local: hasta 10 con Business y hasta 50 con Pro.',
        },
        {
          type: 'note',
          kind: 'important',
          text: 'Cada persona de la lista cuenta para el límite, también las que quedaron como pendientes o rechazadas en invitaciones antiguas. Si llegas al límite verás «Has alcanzado el límite de empleados de tu plan actual». Revisa los planes en [Planes y prueba gratis](/help/business/plans-and-trial).',
        },
      ],
    },
  ],
};

export default chapter;
