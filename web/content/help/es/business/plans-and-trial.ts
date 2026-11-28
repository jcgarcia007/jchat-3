import type { HelpChapter } from '../../types';

const chapter: HelpChapter = {
  id: 'plans-and-trial',
  title: 'Planes y prueba gratis',
  summary: 'Qué planes hay para negocios, cómo empezar tu prueba gratis y cómo cambiar de plan o cancelar.',
  goal: 'Elegir un plan para tu negocio, empezar tu prueba gratis y saber cómo cambiar de plan o cancelar.',
  sections: [
    {
      id: 'plans',
      title: 'Los planes',
      blocks: [
        { type: 'p', text: 'Los planes para negocios están en [jchat.cloud/pricing](https://jchat.cloud/pricing), en la sección **Venue POS — Para tu negocio**. Hay tres tarjetas:' },
        {
          type: 'list',
          items: [
            '**Business** ($49 / mes): 1 local o evento, hasta 10 empleados por local con roles, reservas y programa de lealtad, entre otras funciones.',
            '**Pro** ($99 / mes): todo lo de Business, hasta 10 locales o eventos en total, hasta 50 empleados por local, asistente de menú con IA y traducción de descripciones, y analíticas avanzadas.',
            '**Custom** (Contáctanos): para cadenas o más de 10 negocios o eventos.',
          ],
        },
        { type: 'note', kind: 'important', text: 'Los precios y lo que incluye cada plan son los que muestra esa página el día que la abres. Si algo cambia, vale lo que ves ahí.' },
      ],
    },
    {
      id: 'start-trial',
      title: 'Empieza tu prueba gratis',
      blocks: [
        { type: 'p', text: 'Tu primera suscripción empieza con 30 días gratis. No se te cobra al empezar; cuando termina la prueba se cobra a tu tarjeta el precio del periodo elegido y se renueva automáticamente hasta que canceles. Si cancelas antes de que termine la prueba, no pagas nada.' },
        {
          type: 'steps',
          items: [
            'Entra a [jchat.cloud/pricing](https://jchat.cloud/pricing). Si no has iniciado sesión, te pedimos hacerlo y vuelves a la misma página.',
            'Lee el aviso **Antes de continuar** y marca la casilla **Entiendo que se me cobrará automáticamente al terminar la prueba, y que puedo cancelar antes sin ningún cargo.**',
            'Pulsa **Suscribirme** en el plan que quieres, Business o Pro.',
            'En la pantalla de pago de Stripe escribe los datos de tu tarjeta. Stripe la pide aunque la prueba sea gratis.',
            'Al volver verás tu plan en **Facturación** del panel. Puede tardar un momento en reflejarse.',
          ],
        },
        { type: 'note', kind: 'important', text: 'La prueba gratis es solo para la primera suscripción de cada cuenta.' },
        { type: 'note', kind: 'tip', text: 'También puedes suscribirte desde el panel, en **Pagos** > **Facturación**, con el botón **Suscribirme** de **Planes disponibles**.' },
      ],
    },
    {
      id: 'promo-code',
      title: 'Si tienes un código promocional',
      blocks: [
        { type: 'p', text: 'Un código promocional puede darte otros días de prueba.' },
        {
          type: 'steps',
          items: [
            'En [jchat.cloud/pricing](https://jchat.cloud/pricing), busca **¿Tienes un código promocional?** y escribe tu código en **Escribe tu código**.',
            'Pulsa **Comprobar**. Verás cuántos días de prueba te da y para qué plan.',
            'Pulsa **Suscribirme** en ese plan para aplicarlo.',
          ],
        },
        { type: 'note', kind: 'important', text: 'Cada código aplica solo al plan para el que fue creado. Si no sirve, verás un mensaje como **Ese código ya fue canjeado.**, **Ese código venció.** o **Ese código no aplica a este plan.**' },
      ],
    },
    {
      id: 'change-or-cancel',
      title: 'Cambia de plan o cancela',
      blocks: [
        { type: 'p', text: 'Para cambiar de plan:' },
        {
          type: 'steps',
          items: [
            'Abre el panel y entra a **Pagos** > **Facturación**.',
            'En **Planes disponibles**, pulsa **Cambiar plan** en el plan que quieres.',
          ],
        },
        { type: 'p', text: 'Para cancelar o actualizar tu tarjeta:' },
        {
          type: 'steps',
          items: [
            'En **Facturación**, pulsa **Gestionar facturación**.',
            'Se abre el portal de facturación de Stripe: ahí puedes actualizar tu tarjeta, descargar facturas o cancelar tu suscripción.',
          ],
        },
        { type: 'p', text: 'Al cancelar verás **Tu plan sigue activo hasta el** y la fecha, y que no se renovará. Según los [Términos](/terms), la cancelación se aplica al final del periodo en curso y lo ya pagado no se reembolsa, salvo que la ley lo exija. Más detalle en [Facturación](/help/business/billing).' },
        { type: 'note', kind: 'important', text: 'El panel solo se abre con un plan Business o Pro activo. Si tu plan no está activo o tu prueba venció, no podrás entrar hasta que tengas uno.' },
      ],
    },
  ],
};

export default chapter;
