import type { HelpChapter } from '../../types';

const chapter: HelpChapter = {
  id: 'venue-chat',
  title: 'Chat del local',
  summary: 'Cómo entrar al chat de un local estando ahí, escribir, mandar fotos y notas de voz, y salir.',
  goal: 'Vas a entrar al chat del local donde estás, a usarlo con tranquilidad y a salir cuando quieras.',
  sections: [
    {
      id: 'enter-the-chat',
      title: 'Entrar al chat del local',
      blocks: [
        {
          type: 'p',
          text: 'El chat de un local es para la gente que está en el local en ese momento. Por eso la app comprueba tu ubicación al entrar: así nadie de afuera se une. Usa tu ubicación solo mientras la app está abierta.',
        },
        {
          type: 'steps',
          items: [
            'Elige el local. En **Mapa**, toca su pin y luego **Entrar al chat**. En **Cerca**, toca **Entrar** en su tarjeta. También puedes escanear con la cámara de tu teléfono el QR del local o de tu mesa, si lo tiene.',
            'Si la app te lo pide, inicia sesión. Con un QR verás **Vas a entrar a** y el nombre del local antes de iniciar sesión.',
            'En la pantalla del local, lee cómo se usa tu ubicación y toca **Entrar a la sala**. En algunos locales el botón dice **Entrar al chat**.',
            'Permite la ubicación en el aviso de tu teléfono.',
            'Espera mientras la app muestra **Verificando tu ubicación…**. Si estás dentro del local, entras al chat.',
          ],
        },
        {
          type: 'note',
          kind: 'important',
          text: 'Si no estás dentro del local, la app te dice a qué distancia estás y no te deja entrar. Acércate y toca **Reintentar**. Mientras tanto puedes tocar **Ver menú** para ver el menú.',
        },
        {
          type: 'note',
          kind: 'tip',
          text: 'Si negaste la ubicación, toca **Permitir ubicación**. Si el teléfono ya no deja preguntar, el botón es **Abrir Ajustes**: activa la ubicación para JChat y vuelve; la app lo intenta de nuevo.',
        },
      ],
    },
    {
      id: 'send-messages',
      title: 'Escribir, fotos y notas de voz',
      blocks: [
        { type: 'p', text: 'Para escribir un mensaje:' },
        {
          type: 'steps',
          items: [
            'Toca el campo **Mensaje…** y escribe.',
            'Toca el botón de enviar.',
          ],
        },
        { type: 'p', text: 'Para mandar una foto:' },
        {
          type: 'steps',
          items: [
            'Toca el botón de la cámara, junto al campo de mensaje.',
            'En **Enviar una foto**, elige **Cámara** para tomarla ahora o **Galería** para usar una que ya tienes.',
            'Si es la primera vez, permite el acceso a la cámara o a las fotos.',
          ],
        },
        { type: 'p', text: 'Para mandar una nota de voz:' },
        {
          type: 'steps',
          items: [
            'Con el campo de mensaje vacío, toca el botón del micrófono. Si es la primera vez, permite el micrófono.',
            'Habla. La app muestra el tiempo que llevas grabando.',
            'Toca el botón de enviar el mensaje de voz, o el de cancelar la grabación si no quieres mandarlo.',
          ],
        },
        {
          type: 'note',
          kind: 'important',
          text: 'Si tu mensaje tiene lenguaje que JChat no permite, la app muestra **Mensaje no enviado**. Reescríbelo con respeto. Si el local te silenció, verás **Estás silenciado** y no podrás escribir en esa sala.',
        },
      ],
    },
    {
      id: 'rooms-and-pins',
      title: 'Salas, mensajes fijados y ayuda del local',
      blocks: [
        {
          type: 'p',
          text: 'Arriba del chat ves cuántas personas hay en la sala y sus fotos. Si el local tiene más de una sala, aparecen como pestañas; toca una para cambiar de sala.',
        },
        {
          type: 'list',
          items: [
            'Una pestaña con candado es una sala protegida con contraseña. Al tocarla, escribe la **Contraseña de la sala** y toca **Entrar a la sala**. Si fallas varias veces, la app te pide esperar un rato.',
            'Cuando el local fija un mensaje, aparece en una franja arriba del chat. Tócala para ver todos los **Mensajes fijados**.',
            'El botón **+** de la barra de abajo abre un panel con **Foto**, **Menú** y **Servicio**.',
            'La campana abre tus notificaciones.',
          ],
        },
        { type: 'p', text: 'Para llamar al mesero o pedir ayuda al local:' },
        {
          type: 'steps',
          items: [
            'Toca el botón **+** y luego **Servicio**. También puedes tocar los tres puntos de arriba y elegir **Pedir ayuda al local**.',
            'Si quieres, escribe tu mesa o ubicación y una nota para el mesero.',
            'Toca **Llamar al mesero**.',
          ],
        },
        {
          type: 'note',
          kind: 'tip',
          text: 'Si ya llamaste hace poco, la app te pide esperar unos minutos antes de volver a llamar. Para pedir comida o bebida, mira [Pedir y pagar](/help/users/order-and-pay).',
        },
      ],
    },
    {
      id: 'people-and-safety',
      title: 'Otras personas, reportar y bloquear',
      blocks: [
        {
          type: 'steps',
          items: [
            'Toca la foto de alguien, arriba o junto a su mensaje. Se abre una tarjeta con **Perfil**, **DM**, **Seguir**, **Reportar** y **Bloquear**.',
            'Para actuar sobre un mensaje en concreto, mantén presionado el mensaje de otra persona y elige **Reportar mensaje** o **Bloquear a** esa persona.',
            'Si reportas, elige un motivo y toca **Enviar reporte**.',
          ],
        },
        {
          type: 'p',
          text: 'Al bloquear a alguien dejas de ver sus mensajes. Para ver los motivos de reporte y qué pasa después, mira [Seguridad](/help/users/safety#reporting). Para escribir a alguien en privado, mira [Mensajes](/help/users/messages).',
        },
      ],
    },
    {
      id: 'messages-expire',
      title: 'Los mensajes se borran a las 24 horas',
      blocks: [
        {
          type: 'p',
          text: 'Los mensajes del chat del local se borran 24 horas después de enviarse. Esto vale para los tuyos y para los de los demás.',
        },
        {
          type: 'list',
          items: [
            'El borrado se hace cada pocos minutos, así que un mensaje puede verse un rato más de lo esperado.',
            'Un mensaje fijado por el local se conserva mientras siga fijado.',
            'Un mensaje que se haya reportado puede conservarse más tiempo mientras se revisa el reporte.',
          ],
        },
        {
          type: 'note',
          kind: 'important',
          text: 'Esta regla es solo para el chat del local. Los mensajes directos son otra cosa: se explican en [Mensajes](/help/users/messages).',
        },
      ],
    },
    {
      id: 'leave',
      title: 'Salir del local',
      blocks: [
        {
          type: 'steps',
          items: [
            'En el chat, toca el botón de los tres puntos (**Más opciones**).',
            'Toca **Salir del local**.',
            'La app pregunta si quieres salir. Toca **Salir del local** para confirmar o **Cancelar** para quedarte.',
          ],
        },
        {
          type: 'p',
          text: 'La flecha de volver solo te saca de la pantalla: sigues en el local. Desde las otras pestañas verás una barra con **Volver al chat** y **Salir**.',
        },
        {
          type: 'note',
          kind: 'important',
          text: 'Al salir se pierde la conversación del local. Para volver tienes que escanear el QR del local o estar dentro de él.',
        },
        {
          type: 'p',
          text: 'Mientras tienes el chat abierto, la app vuelve a comprobar de vez en cuando que sigues en el local. Si te vas del local, puede sacarte del chat y avisarte de que estás fuera del área del local. No sigue tu ubicación con la app cerrada.',
        },
      ],
    },
  ],
};

export default chapter;
