import type { HelpChapter } from '../../types';

const chapter: HelpChapter = {
  id: 'billing',
  title: 'Facturación',
  summary: 'Revisa tu plan, cambia de plan, actualiza tu tarjeta y descarga tus facturas.',
  goal: 'Vas a ver el estado de tu suscripción y manejar tu método de pago y tus facturas.',
  sections: [
    {
      id: 'where-to-find-it',
      title: 'Dónde está la facturación',
      blocks: [
        {
          type: 'p',
          text: 'La suscripción de tu negocio se maneja en el panel web, no en la app. En el menú lateral, abre el grupo **Pagos** y entra en **Facturación**. La página se llama **Facturación y suscripción**.',
        },
        {
          type: 'p',
          text: 'Los precios y lo que incluye cada plan están en [Planes y prueba gratis](/help/business/plans-and-trial).',
        },
      ],
    },
    {
      id: 'your-plan',
      title: 'Lee el estado de tu plan',
      blocks: [
        {
          type: 'p',
          text: 'En **Plan actual** ves el nombre de tu plan y su estado: **Prueba gratis**, **Activo**, **Problema de pago** o **Cancelado**. También ves:',
        },
        {
          type: 'list',
          items: [
            '**La prueba termina**: la fecha en que acaba tu prueba gratis, con los días que te quedan.',
            '**Cobro**: cada cuánto se te cobra (**Cada mes**, **Cada 6 meses** o **Cada año**).',
            '**Se renueva**: la fecha de la próxima renovación.',
          ],
        },
        {
          type: 'p',
          text: 'Cuando faltan 3 días o menos para que acabe tu prueba, el panel te lo recuerda y te pide añadir un método de pago para continuar sin interrupciones.',
        },
        {
          type: 'note',
          kind: 'tip',
          text: 'Si acabas de pagar y el plan no cambia, espera un momento y recarga la página. El panel avisa que puede tardar un momento en reflejarse.',
        },
      ],
    },
    {
      id: 'subscribe-or-change',
      title: 'Suscríbete o cambia de plan',
      blocks: [
        {
          type: 'steps',
          items: [
            'En **Facturación**, baja a **Planes disponibles**.',
            'Si aún no tienes un plan de negocio, pulsa **Suscribirme** en el plan que quieras. Te llevamos a la página de pago.',
            'Si ya tienes un plan, pulsa **Cambiar plan** en el nuevo plan. Se abre el portal de facturación, donde haces el cambio.',
            'Al volver al panel verás el aviso **¡Suscripción actualizada!** o **Se canceló el pago. Tu plan no cambió.**',
          ],
        },
        {
          type: 'p',
          text: 'El plan **Custom** no tiene pago en línea: pulsa **Contactar**: se abre un correo para escribir a [ventas@jchat.cloud](mailto:ventas@jchat.cloud).',
        },
      ],
    },
    {
      id: 'card-and-invoices',
      title: 'Actualiza tu tarjeta, descarga facturas o cancela',
      blocks: [
        {
          type: 'steps',
          items: [
            'En **Facturación**, baja a **Actualiza el método de pago o los datos de facturación**.',
            'Para cambiar tu tarjeta o cancelar tu suscripción, pulsa **Gestionar facturación**.',
            'Para ver y descargar cada factura y recibo, baja a **Historial de pagos** y pulsa **Ver facturas y recibos**.',
          ],
        },
        {
          type: 'note',
          kind: 'important',
          text: 'Los dos botones abren el portal de facturación de Stripe. Si el portal no se abre porque aún no tienes una cuenta de facturación, primero suscríbete a un plan.',
        },
      ],
    },
    {
      id: 'payment-problem',
      title: 'Si hay un problema con el pago',
      blocks: [
        {
          type: 'p',
          text: 'Si un cobro falla, tu plan pasa a **Problema de pago** y verás el aviso «Hay un problema con tu pago. Actualiza tu método de pago para mantener tu plan activo.»',
        },
        {
          type: 'steps',
          items: [
            'Abre **Facturación**.',
            'Pulsa **Gestionar facturación**.',
            'Actualiza tu tarjeta en el portal.',
          ],
        },
        {
          type: 'p',
          text: 'Si no logras resolverlo, escríbenos a [soporte@jchat.cloud](mailto:soporte@jchat.cloud).',
        },
      ],
    },
  ],
};

export default chapter;
