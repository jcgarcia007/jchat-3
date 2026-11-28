import type { HelpChapter } from '../../types';

const chapter: HelpChapter = {
  id: 'close-your-venue',
  title: 'Cerrar tu local y eliminar tu cuenta',
  summary: 'Qué pasa cuando cierras tu local: suscripción, equipo, reservas y datos.',
  goal: 'Vas a saber cómo cerrar tu local eliminando tu cuenta de dueño y qué pasa con todo lo que tienes en JChat.',
  sections: [
    {
      id: 'how-it-works',
      title: 'Cómo se cierra un local',
      blocks: [
        {
          type: 'p',
          text: 'En JChat el local se cierra al eliminar la cuenta de su dueño. El cierre se aplica a todos los locales que tengas a la vez.',
        },
        {
          type: 'note',
          kind: 'important',
          text: 'Es inmediato y no se puede deshacer. Un local cerrado no se vuelve a abrir.',
        },
        {
          type: 'p',
          text: 'Antes de confirmar, la app y la web te muestran qué va a pasar con tu local.',
        },
      ],
    },
    {
      id: 'before-you-start',
      title: 'Antes de empezar',
      blocks: [
        {
          type: 'p',
          text: 'Hay dos cosas que te lo impiden. Si ocurre alguna, no se borra nada y puedes volver a intentarlo cuando se resuelva:',
        },
        {
          type: 'list',
          items: [
            '**Pedidos en curso o mesas abiertas**: ciérralos primero. La app te dice cuántos tienes.',
            '**Dinero por cobrar en Stripe**: si Stripe aún tiene ventas tuyas sin transferir a tu banco, espera a que lleguen (normalmente entre 2 y 7 días) y vuelve cuando el saldo sea cero.',
          ],
        },
        {
          type: 'p',
          text: 'Cuando el saldo te bloquea, la app muestra el botón **Abrir mi panel de Stripe** para que lo revises.',
        },
      ],
    },
    {
      id: 'close-in-app',
      title: 'Ciérralo desde la app',
      blocks: [
        {
          type: 'steps',
          items: [
            'En la app, abre **Perfil** y entra en **Ajustes**.',
            'Pulsa **Eliminar cuenta**.',
            'Lee la pantalla **Tienes un local** (o **Tienes N locales**). Ahí ves qué pasará.',
            'Marca la casilla **Entiendo que mi local se cerrará y que esto no se puede deshacer.**',
            'Pulsa **Continuar y eliminar**.',
            'Confirma con **Eliminar todo**. El proceso puede tardar hasta 30 segundos.',
            'Cuando veas **Cuenta eliminada**, el local queda cerrado y se cierra tu sesión.',
          ],
        },
      ],
    },
    {
      id: 'close-on-web',
      title: 'O ciérralo desde la web',
      blocks: [
        {
          type: 'steps',
          items: [
            'Abre [Eliminar tu cuenta](/account/delete) e inicia sesión con tu cuenta de dueño.',
            'Verás **Tienes un negocio en JChat** con el nombre de tu local y lo que pasará.',
            'Marca **Entiendo que mi local se cerrará y que no se puede deshacer.**',
            'Escribe la palabra **ELIMINAR** donde la pide la página.',
            'Pulsa **Eliminar mi cuenta y cerrar mi local**.',
          ],
        },
        {
          type: 'p',
          text: 'Si no puedes entrar, escribe a [soporte@jchat.cloud](mailto:soporte@jchat.cloud) desde el correo de tu cuenta.',
        },
      ],
    },
    {
      id: 'what-happens',
      title: 'Qué pasa con todo',
      blocks: [
        {
          type: 'list',
          items: [
            '**Tu local**: se oculta del mapa y deja de aceptar pedidos.',
            '**Tu suscripción**: se cancela hoy. No hay reembolso del periodo ya pagado.',
            '**Tu equipo**: pierde el acceso y recibe un aviso. Sus cuentas siguen activas.',
            '**Las reservas futuras**: se cancelan y avisamos a tus clientes.',
            '**Tus datos personales**: se borran ahora mismo (perfil, fotos y mensajes).',
            '**Pedidos, pagos y recibos**: se guardan 7 años sin tus datos personales, como exige la ley fiscal.',
            '**Reseñas, publicaciones y chat del local**: dejan de verse.',
          ],
        },
        {
          type: 'p',
          text: 'Si tienes más de un local, todo esto se aplica a cada uno. Más detalles sobre los datos en [Eliminar tu cuenta](/account/delete) y en la [Política de privacidad](/privacy).',
        },
      ],
    },
  ],
};

export default chapter;
