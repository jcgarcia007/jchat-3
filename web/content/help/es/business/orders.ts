import type { HelpChapter } from '../../types';

const chapter: HelpChapter = {
  id: 'orders',
  title: 'Pedidos',
  summary: 'Mira los pedidos que llegan, revisa su detalle y márcalos como entregados desde el panel.',
  goal: 'Ver los pedidos de tus clientes en el panel, revisar su detalle y marcarlos como entregados.',
  sections: [
    {
      id: 'see-your-orders',
      title: 'Mira tus pedidos',
      blocks: [
        { type: 'p', text: 'Los pedidos llegan cuando un cliente paga desde la app. Para verlos, abre el panel y entra a **Pedidos** > **Pedidos**. La lista se actualiza en vivo: no tienes que recargar la página.' },
        {
          type: 'image',
          src: '/help/business/orders/dash-es.webp',
          alt: 'Pantalla Pedidos del panel con los filtros por estado y la lista de pedidos.',
          platform: 'web',
          width: 1280,
          height: 800,
        },
        {
          type: 'list',
          items: [
            '**Pedido**: el número del pedido, el mismo que ve tu cliente.',
            '**Cliente**: quién lo pidió. Si no hay un cliente, verás **Invitado**.',
            '**Estado**, **Ítems**, **Total** y **Hora**: en qué punto está, cuántos productos tiene, cuánto suma y hace cuánto llegó.',
          ],
        },
        { type: 'note', kind: 'tip', text: 'Arriba hay filtros para ver solo **Pendiente**, **Preparando**, **Listo**, **Entregado** o **Cancelado**, cada uno con su cantidad. **Todos** los muestra juntos.' },
      ],
    },
    {
      id: 'order-statuses',
      title: 'Los estados de un pedido',
      blocks: [
        { type: 'p', text: 'Cada pedido tiene uno de estos estados:' },
        {
          type: 'list',
          items: [
            '**Pendiente**: llegó y todavía no se empieza.',
            '**Preparando**: se está preparando.',
            '**Listo**: está listo para entregarse.',
            '**Entregado**: ya se entregó al cliente.',
            '**Cancelado**: se canceló.',
          ],
        },
        { type: 'note', kind: 'important', text: 'En esta pantalla solo puedes marcar un pedido como **Entregado**.' },
      ],
    },
    {
      id: 'order-details',
      title: 'El detalle de un pedido',
      blocks: [
        {
          type: 'steps',
          items: [
            'En la fila del pedido, pulsa **Ver**.',
            'Revisa cada producto con su cantidad y sus notas, y la mesa si el pedido la tiene.',
            'Mira el desglose: **Subtotal**, **Descuento** (si hay), **Impuesto**, **Propina** y **Total**.',
          ],
        },
        { type: 'p', text: 'Si el pedido tiene un tiempo estimado, verás una línea como **ETA 15 min · registrado hace 2 min**. Si un cliente lo envió de regalo, la lista muestra **🎁 Regalo de** quien lo envía **para** quien lo recibe, y en el detalle la mesa y las notas de entrega.' },
      ],
    },
    {
      id: 'mark-delivered',
      title: 'Marca un pedido como entregado',
      blocks: [
        {
          type: 'steps',
          items: [
            'Cuando entregues el pedido, búscalo en **Pedidos**.',
            'Si está en **Listo**, pulsa **Entregado** en su fila. Si está en **Pendiente** o **Preparando**, pulsa **Ver** y luego **Entregado**.',
            'El pedido pasa a **Entregado** y tu cliente recibe un aviso.',
          ],
        },
        { type: 'note', kind: 'important', text: 'Marcar **Entregado** no se puede deshacer desde esta pantalla. Hazlo cuando el pedido ya esté en manos de tu cliente.' },
      ],
    },
  ],
};

export default chapter;
