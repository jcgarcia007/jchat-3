import type { HelpChapter } from '../../types';

const chapter: HelpChapter = {
  id: 'troubleshooting',
  title: 'Problemas frecuentes',
  summary: 'Qué hacer si no puedes entrar al chat de un local, no llegan notificaciones, olvidaste tu contraseña o un pago falló.',
  goal: 'Vas a resolver los problemas más comunes por tu cuenta y sabrás cómo contactarnos si no basta.',
  sections: [
    {
      id: 'cant-join-chat',
      title: 'No me deja entrar al chat',
      blocks: [
        { type: 'p', text: `Para entrar al chat de un local tienes que estar en el local. La app usa tu ubicación solo mientras la usas, para confirmar que estás dentro. No guarda tu ubicación exacta.` },
        {
          type: 'steps',
          items: [
            `Si la app dice **No estás en** el local o **Estás a…**, acércate al local e inténtalo de nuevo.`,
            `Si dice **Necesitamos tu ubicación**, toca **Permitir ubicación**.`,
            `Si dice que la ubicación está desactivada para JChat, toca **Abrir Ajustes** y permite la ubicación para JChat en los ajustes de tu teléfono. Vuelve a la app.`,
            `Si dice **No pudimos leer tu ubicación**, comprueba que la ubicación del teléfono esté activada y toca **Reintentar**.`,
          ],
        },
        { type: 'note', kind: 'important', text: `Si sales del área del local, la app te saca del chat. Para volver a entrar, vuelve al local y escanea el QR.` },
      ],
    },
    {
      id: 'notifications',
      title: 'No llegan notificaciones',
      blocks: [
        {
          type: 'steps',
          items: [
            `Abre los ajustes de tu teléfono y comprueba que JChat tenga permiso para enviar notificaciones.`,
            `En la app, abre **Ajustes** y revisa que **Social** esté activado en **Notificaciones**.`,
            `Si las ves pero sin contenido, revisa **Vista previa de mensajes**: con **Discreta** solo dice Tienes una novedad en JChat.`,
          ],
        },
        { type: 'p', text: `Más sobre estos ajustes en [Perfil y privacidad](/help/users/profile-and-privacy#settings).` },
      ],
    },
    {
      id: 'forgot-password',
      title: 'Olvidé mi contraseña',
      blocks: [
        {
          type: 'steps',
          items: [
            `En la pantalla de inicio de sesión con correo, toca **¿Olvidaste tu contraseña?**.`,
            `Escribe tu correo y toca **Enviar código**.`,
            `Escribe el código de 6 dígitos que te llegó y toca **Verificar**. Si no llega, toca **Reenviar código**.`,
            `Escribe tu nueva contraseña (mínimo 8 caracteres) dos veces y toca **Guardar contraseña**.`,
          ],
        },
        { type: 'note', kind: 'tip', text: `Si ves El código es incorrecto o caducó, pide uno nuevo. Si ves que debes esperar un momento, espera y vuelve a pedirlo. También puedes usar la opción de contraseña olvidada en [jchat.cloud/forgot-password](/forgot-password).` },
      ],
    },
    {
      id: 'payment-failed',
      title: 'El pago falló',
      blocks: [
        { type: 'p', text: `Si ves **El pago falló**, toca **Intentar de nuevo**. Para ver cómo se paga un pedido, mira [Pedir y pagar](/help/users/order-and-pay).` },
        {
          type: 'list',
          items: [
            `**Para pedir necesitas estar en** el local: toca **Permitir ubicación / Reintentar** cuando estés dentro.`,
            `**No pudimos verificar tu identidad**: el pago no se realizó. Inténtalo de nuevo y confirma con tu huella o tu cara.`,
            `**El total cambió**: se actualizaron los precios y no se cobró nada. Revisa el nuevo total y paga de nuevo.`,
            `**Este local todavía no acepta pagos en la app**: puedes pedir en el mostrador.`,
          ],
        },
        { type: 'note', kind: 'important', text: `Los reembolsos los gestiona el local que te atendió. Contáctalo primero con tu número de pedido. Si pagaste con JChat y no puedes comunicarte con el local, escríbenos.` },
      ],
    },
    {
      id: 'contact',
      title: 'Cómo contactarnos',
      blocks: [
        { type: 'p', text: `Escribe a [soporte@jchat.cloud](mailto:soporte@jchat.cloud). Incluye el correo de tu cuenta y, si es por un pedido, el número de pedido. También puedes usar [Contacto](/contact) o la página de [Ayuda y soporte](/support).` },
        { type: 'p', text: `Si quieres reportar a alguien, mira [Seguridad](/help/users/safety).` },
      ],
    },
  ],
};

export default chapter;
