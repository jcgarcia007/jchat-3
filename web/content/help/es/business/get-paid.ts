import type { HelpChapter } from '../../types';

const chapter: HelpChapter = {
  id: 'get-paid',
  title: 'Cobra tus pedidos',
  summary: 'Conecta tu cuenta de Stripe para recibir el dinero de los pedidos y revisa su estado desde el panel.',
  goal: 'Conectar tu cuenta de Stripe para que el dinero de los pedidos que pagan tus clientes llegue a tu negocio.',
  sections: [
    {
      id: 'how-it-works',
      title: 'Cómo funciona',
      blocks: [
        { type: 'p', text: 'Los clientes pagan sus pedidos con tarjeta dentro de JChat. Para que el dinero llegue a tu cuenta, conectas tu negocio con Stripe, que hace su propia verificación segura.' },
        { type: 'note', kind: 'important', text: 'Sin Stripe conectado no se pueden hacer pedidos ni pagos desde la app.' },
      ],
    },
    {
      id: 'connect-stripe',
      title: 'Conecta Stripe',
      blocks: [
        {
          type: 'steps',
          items: [
            'Abre el panel y entra a **Pagos**.',
            'Si tienes más de un local, elige cuál en el selector **Negocio**. Cada local necesita su propia cuenta de Stripe.',
            'Verás **Conecta Stripe para recibir tus pagos**. Pulsa **Conectar con Stripe**.',
            'Se abre la página segura de Stripe. Completa los datos que te pida y envíalos.',
            'Al terminar, Stripe te devuelve a JChat. Abre **Pagos** otra vez para ver tu estado.',
          ],
        },
        { type: 'note', kind: 'tip', text: 'Si ves **El enlace expiró, inténtalo de nuevo.**, vuelve a pulsar el botón de conexión para recibir un enlace nuevo.' },
      ],
    },
    {
      id: 'check-your-status',
      title: 'Revisa tu estado',
      blocks: [
        { type: 'p', text: 'En **Pagos** verás uno de estos estados:' },
        {
          type: 'list',
          items: [
            '**Verificación pendiente — aún no puedes recibir pagos**: Stripe necesita más información para activar tu cuenta. Pulsa **Completar verificación** para seguir donde lo dejaste.',
            '**Conectado — recibes los pagos de tus pedidos**: tu cuenta está activa. Debajo ves **Cobros habilitados (charges)** y **Retiros habilitados (payouts)**.',
          ],
        },
        { type: 'p', text: 'En el estado pendiente también ves **Datos enviados (details submitted)**, para saber qué le falta a tu cuenta.' },
      ],
    },
    {
      id: 'stripe-dashboard',
      title: 'Tu panel de Stripe',
      blocks: [
        {
          type: 'steps',
          items: [
            'Con tu cuenta conectada, en **Pagos** pulsa **Abrir panel de Stripe**.',
            'Se abre tu panel de Stripe en una pestaña nueva, donde gestionas tu cuenta y tus retiros.',
          ],
        },
        { type: 'note', kind: 'important', text: 'JChat no fija el calendario de los depósitos a tu banco. Consulta ese dato en tu panel de Stripe.' },
      ],
    },
    {
      id: 'tax-and-tips',
      title: 'Impuesto y propina',
      blocks: [
        { type: 'p', text: 'Cada pedido muestra **Subtotal**, **Impuesto**, **Propina** y **Total**. JChat calcula el impuesto de cada pedido por ti. Para ver ese detalle, mira [Pedidos](/help/business/orders#order-details).' },
      ],
    },
  ],
};

export default chapter;
