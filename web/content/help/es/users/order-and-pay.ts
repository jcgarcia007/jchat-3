import type { HelpChapter } from '../../types';

const chapter: HelpChapter = {
  id: 'order-and-pay',
  title: 'Pedir y pagar',
  summary: 'Cómo ver el menú, armar tu pedido, elegir mesa o mostrador, poner propina, pagar y seguir tu pedido.',
  goal: 'Vas a pedir desde el menú de un local, pagar desde tu teléfono y seguir tu pedido hasta que llegue.',
  sections: [
    {
      id: 'menu',
      title: 'Ver el menú y agregar artículos',
      blocks: [
        {
          type: 'steps',
          items: [
            'Abre el menú del local. Puedes hacerlo con **Menú** en la ficha del local, con el icono del menú arriba del chat, o con **Menú** en el panel que abre el botón **+** del chat.',
            'Para buscar algo, escribe en **Buscar en el menú…**.',
            'Toca un artículo para ver sus detalles. Si tiene opciones, elígelas: **Tamaño** (obligatorio), **Extras** (opcionales) e **Instrucciones especiales**, por ejemplo alergias.',
            'Cambia la **Cantidad** si quieres más de uno.',
            'Toca **Agregar al carrito**. Si falta elegir un tamaño, el botón dice **Elige un tamaño**.',
            'Abajo verás el botón **Ver carrito** con el total de lo que llevas.',
          ],
        },
        {
          type: 'image',
          src: '/help/users/order-and-pay/menu-es.webp',
          alt: 'Menú de un local con categorías, precios y el botón más para añadir cada producto.',
          platform: 'ios',
          width: 780,
          height: 1696,
        },
        {
          type: 'note',
          kind: 'important',
          text: 'Estés donde estés puedes ver el menú. Para pedir, tienes que estar dentro del local. Si estás fuera, el menú es solo de lectura y la app te avisa de que solo puedes verlo desde fuera, salvo que el local permita pedir para recoger.',
        },
        {
          type: 'note',
          kind: 'tip',
          text: 'Algunos artículos traen el aviso **Solo para mayores de 21. Te pedirán identificación en el local.** Si el local está cerrado, la app te avisa de que podrás pedir cuando abra.',
        },
      ],
    },
    {
      id: 'cart',
      title: 'Tu carrito: mesa o mostrador',
      blocks: [
        {
          type: 'steps',
          items: [
            'Toca **Ver carrito**. La pantalla se llama **Tu pedido**.',
            'Revisa los artículos. Con los botones de cantidad cambias cuántos llevas; si bajas de uno, la app te pregunta si quieres quitarlo.',
            'En **¿Cómo quieres tu pedido?**, elige **Mesa** (el mesero lo lleva) o **Mostrador** (lo recoges tú).',
            'Si elegiste **Mesa**, escribe tu mesa o lugar en **Mesa o lugar**, por ejemplo 5, barra o terraza. Es obligatorio.',
            'Toca **Ir al pago**. El botón muestra el subtotal.',
          ],
        },
        {
          type: 'image',
          src: '/help/users/order-and-pay/cart-es.webp',
          alt: 'Carrito con la opción Mesa o Mostrador, el campo de mesa y el botón que pide indicar la mesa para continuar.',
          platform: 'ios',
          width: 780,
          height: 1696,
        },
        {
          type: 'p',
          text: 'Si el botón está desactivado, te dice qué falta, por ejemplo **Indica tu mesa para continuar**. Debajo del carrito, la app avisa que **Los impuestos y la propina se calculan al pagar.**',
        },
        {
          type: 'note',
          kind: 'tip',
          text: 'Cuando solo quedan pocas unidades de un artículo, la app muestra **Existencias limitadas** y no te deja pedir más de las que hay.',
        },
      ],
    },
    {
      id: 'checkout',
      title: 'Propina, impuesto y total',
      blocks: [
        {
          type: 'p',
          text: 'La pantalla **Pago** te muestra el precio exacto antes de cobrar: la app lo recalcula cada vez que cambias el pedido o la propina.',
        },
        {
          type: 'steps',
          items: [
            'Revisa el resumen del pedido. Si algo no es lo que querías, toca **Editar**.',
            'En **Agregar propina**, elige **10%**, **15%** o **20%**, o toca **Otra** y escribe el monto en dólares. Ya viene elegido el 15%.',
            'Revisa el desglose: **Subtotal**, el **Impuesto**, la **Propina** y el **Total**.',
            'Toca el botón **Pagar** con el total.',
          ],
        },
        {
          type: 'list',
          items: [
            'El impuesto lo define cada local. Si el local no lo configuró, la app muestra **El negocio no tiene impuestos configurados.**',
            'La propina va al local.',
            'Si el precio cambió mientras pagabas, la app muestra **El total cambió** y no cobra nada. Revisa el nuevo total y paga de nuevo.',
          ],
        },
        {
          type: 'note',
          kind: 'important',
          text: 'Algunos locales todavía no cobran en la app: verás **Este local todavía no acepta pagos en la app. Puedes pedir en el mostrador.** Si estás fuera del local, la app te dice que necesitas estar en él para pedir; toca **Permitir ubicación / Reintentar**, o **Pedir para recoger** si el local lo permite.',
        },
      ],
    },
    {
      id: 'payment-methods',
      title: 'Pagar con tarjeta, Apple Pay o Google Pay',
      blocks: [
        {
          type: 'p',
          text: 'El pago se hace en una hoja de pago de Stripe, que se abre sobre la app. Ahí eliges cómo pagar: con una tarjeta, con una que guardaste, y con Apple Pay en iPhone o Google Pay en Android si los tienes configurados en tu teléfono. Los pagos los procesa Stripe: la app muestra **Protegido por Stripe**.',
        },
        {
          type: 'steps',
          items: [
            'Toca **Pagar**. Si activaste **Usar Face ID / huella** en **Ajustes**, la app te pide verificarte antes de cobrar.',
            'En la hoja de pago, elige la forma de pago o escribe los datos de tu tarjeta.',
            'Confirma el pago.',
            'Espera mientras la app muestra **Procesando el pago…**.',
          ],
        },
        {
          type: 'p',
          text: 'Cuando el pago termina, la app puede preguntarte **¿Guardar la tarjeta para pagar más rápido?** Toca **Guardar tarjeta** o **Ahora no**.',
        },
        {
          type: 'note',
          kind: 'important',
          text: 'Si no pasas la verificación de Face ID o huella, el pago no se hace: toca **Intentar de nuevo**. Si el pago falla, la app muestra **El pago falló** y puedes intentarlo de nuevo. Para más ayuda, mira [Solución de problemas](/help/users/troubleshooting#payment-failed).',
        },
      ],
    },
    {
      id: 'track-order',
      title: 'Seguir tu pedido',
      blocks: [
        {
          type: 'p',
          text: 'Al terminar el pago ves **¡Pago confirmado!** con tu **Número de pedido**, el negocio y el tipo de pedido. Debajo, la app te recuerda: «Puedes seguirlo en Mis pedidos.»',
        },
        {
          type: 'steps',
          items: [
            'Toca **Ver pedido**. Si la app aún está terminando tu pedido, el botón dice **Ver mis pedidos**.',
            'Sigue los pasos **Confirmado**, **Preparando** y **Listo**. Al final verás **¡Entregado!**',
            'Para avisar al local, toca **Avisar al local** y elige **Voy en camino**, **Ya llegué al local** o **Tengo una pregunta sobre mi pedido** (máximo 200 caracteres). Toca **Enviar**.',
            'Si pediste a la mesa y estás en el local, también puedes tocar **Llamar al mesero**.',
          ],
        },
        {
          type: 'list',
          items: [
            'Cuando el local aún no confirma, la app dice **Pedido recibido — esperando confirmación.** o **Esperando la aprobación del negocio.**',
            'Si el local rechaza el pedido, verás **Rechazado** con el motivo. Si ves **En revisión**, contacta al local.',
            'Para volver a un pedido más tarde, entra a **Mis pedidos**: en el chat, toca los tres puntos y luego **Mi cuenta y pedidos**; o ve a **Ajustes** y toca **Mis pedidos**.',
            'Un pedido en curso también aparece arriba de tus notificaciones en **Mensajes**, con **En curso**.',
          ],
        },
        {
          type: 'note',
          kind: 'tip',
          text: 'Las novedades de tu pedido te llegan como notificación: recibido, confirmado, en preparación, listo y entregado.',
        },
      ],
    },
    {
      id: 'receipts-refunds',
      title: 'Tu comprobante y reembolsos',
      blocks: [
        {
          type: 'p',
          text: 'Tus pedidos pagados quedan en **Mis pedidos**. Al abrir uno ves los artículos, el **Subtotal**, el **Impuesto**, la **Propina** y el **Total**.',
        },
        {
          type: 'steps',
          items: [
            'Habla primero con el local que te atendió y dile tu número de pedido. Los reembolsos los gestiona el local.',
            'Si pagaste a través de JChat y no logras contactar al local, escríbenos a [soporte@jchat.cloud](mailto:soporte@jchat.cloud) con tu número de pedido.',
          ],
        },
        {
          type: 'note',
          kind: 'important',
          text: 'El local es quien vende: precios, disponibilidad, impuestos y reembolsos son responsabilidad suya. Lee los [Términos del servicio](/terms) y escríbenos desde [Contacto](/contact) si necesitas más ayuda.',
        },
      ],
    },
  ],
};

export default chapter;
