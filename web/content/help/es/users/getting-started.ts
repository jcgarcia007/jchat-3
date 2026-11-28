import type { HelpChapter } from '../../types';

const chapter: HelpChapter = {
  id: 'getting-started',
  title: 'Crear tu cuenta y empezar',
  summary: 'Regístrate con correo, Apple o Google, confirma tu edad y conoce los permisos que pide la app.',
  goal: 'Vas a tener tu cuenta de JChat lista y a saber para qué pide cada permiso la app.',
  sections: [
    {
      id: 'before-you-start',
      title: 'Antes de empezar',
      blocks: [
        {
          type: 'p',
          text: 'JChat es una app para mayores de 18 años. Necesitas un iPhone o un teléfono Android. Si te registras con correo, usa una dirección que puedas abrir en ese mismo teléfono.',
        },
        {
          type: 'image',
          src: '/help/users/getting-started/welcome-es.webp',
          alt: 'Pantalla de bienvenida de JChat con los botones Comenzar e Iniciar sesión.',
          platform: 'ios',
          width: 780,
          height: 1696,
        },
        {
          type: 'list',
          items: [
            'Tu fecha de nacimiento. Solo la usamos para confirmar tu edad: guardamos únicamente el año y no se muestra en tu perfil.',
            'Una contraseña de al menos 8 caracteres, con una letra y un número (si te registras con correo).',
            'Un nombre de usuario de 3 a 30 caracteres, con minúsculas, números y guiones bajos.',
          ],
        },
        {
          type: 'note',
          kind: 'important',
          text: 'Si tu fecha de nacimiento no cumple el requisito de edad, la app muestra **No elegible** y no puedes crear la cuenta.',
        },
      ],
    },
    {
      id: 'create-account',
      title: 'Crear tu cuenta con correo',
      blocks: [
        {
          type: 'p',
          text: 'El registro tiene dos pasos. Empieza en la pantalla de bienvenida, que tiene los botones **Comenzar** e **Iniciar sesión**. Paso 1 de 2:',
        },
        {
          type: 'image',
          src: '/help/users/getting-started/register-es.webp',
          alt: 'Primer paso de Crea tu cuenta: nombre completo, correo, contraseña y confirmar contraseña, con el selector de idioma ES y EN arriba.',
          platform: 'ios',
          width: 780,
          height: 1696,
        },
        {
          type: 'steps',
          items: [
            'Toca **Comenzar**.',
            'Escribe tu **Nombre completo** y tu **Correo**.',
            'Escribe una **Contraseña**. Debajo verás qué reglas ya cumples: **Mínimo 8 caracteres**, **Al menos una letra** y **Al menos un número**.',
            'Repite la contraseña en **Confirmar contraseña**.',
            'Toca **Continuar**.',
          ],
        },
        { type: 'p', text: 'Paso 2 de 2:' },
        {
          type: 'steps',
          items: [
            'Escribe tu **Fecha de nacimiento** en las casillas de día, mes y año. En español va primero el día; en inglés, primero el mes.',
            'Elige tu **Idioma**: **English** o **Español**.',
            'Escribe tu **Nombre de usuario**. Si está libre verás **¡Nombre de usuario disponible!**; si no, **Este nombre de usuario ya está en uso.**',
            'Marca la casilla para aceptar los [Términos del servicio](/terms) y la [Política de privacidad](/privacy).',
            'Toca **Crear mi cuenta**.',
          ],
        },
        {
          type: 'p',
          text: 'La app te muestra **Revisa tu correo**: te enviamos un enlace de confirmación. Para activar tu cuenta:',
        },
        {
          type: 'steps',
          items: [
            'Abre el correo de confirmación en este mismo teléfono.',
            'Toca el enlace.',
            'Verás **Correo confirmado** y entrarás a la app automáticamente.',
          ],
        },
        {
          type: 'note',
          kind: 'tip',
          text: 'Si el enlace ya se usó o caducó, la app muestra **Enlace caducado**. Inicia sesión para pedir uno nuevo.',
        },
        {
          type: 'p',
          text: 'La primera vez que entras ves unas pantallas de bienvenida. Toca **Siguiente** para avanzar, **Omitir** para saltarlas y, al final, **Explorar el mapa**.',
        },
      ],
    },
    {
      id: 'social-sign-in',
      title: 'Registrarte con Apple o Google',
      blocks: [
        {
          type: 'p',
          text: 'Puedes crear tu cuenta sin escribir contraseña, con tu cuenta de Apple o de Google.',
        },
        {
          type: 'image',
          src: '/help/users/getting-started/register-social-es.webp',
          alt: 'Final de la pantalla de registro con los botones Sign up with Apple y Google, y el enlace Iniciar sesión.',
          platform: 'ios',
          width: 780,
          height: 1696,
        },
        {
          type: 'steps',
          items: [
            'En el paso 1 (**Crea tu cuenta**), toca **Apple** o **Google**, debajo de **o continúa con**. También los encuentras al tocar **Iniciar sesión** en la pantalla de bienvenida.',
            'Autoriza el acceso en la ventana de Apple o de Google.',
            'Cuando la app te pida confirmar tu edad, sigue la sección siguiente.',
          ],
        },
        {
          type: 'note',
          kind: 'tip',
          text: 'En iPhone, Apple usa su botón nativo. En Android, el acceso con Apple se abre en una ventana del navegador.',
        },
      ],
    },
    {
      id: 'confirm-age',
      title: 'Confirmar tu edad',
      blocks: [
        {
          type: 'p',
          text: 'Si entras con Apple o Google, la app te muestra **Confirma tu edad** antes de dejarte usarla. La pantalla te lo recuerda: JChat es solo para mayores de 18 años, y solo guardamos el año de tu fecha de nacimiento. También aparece si no pudo guardar tu edad al registrarte con correo, por ejemplo por mala conexión.',
        },
        {
          type: 'steps',
          items: [
            'Escribe tu fecha de nacimiento en las casillas **Día**, **Mes** y **Año**. Solo números.',
            'Marca la casilla para aceptar los Términos y la Política de privacidad.',
            'Toca **Continuar**.',
            'Cuando la app pregunte si esa es tu fecha de nacimiento, toca **Sí, continuar**. Si te equivocaste, toca **Editar**.',
          ],
        },
        {
          type: 'note',
          kind: 'important',
          text: 'Si no cumples el requisito de edad, la app muestra **No elegible** y la cuenta que acabas de crear se elimina.',
        },
      ],
    },
    {
      id: 'sign-in',
      title: 'Iniciar sesión y recuperar tu contraseña',
      blocks: [
        {
          type: 'p',
          text: 'Si ya tienes cuenta, puedes entrar con correo, con Apple o con Google. Con correo:',
        },
        {
          type: 'image',
          src: '/help/users/getting-started/sign-in-es.webp',
          alt: 'Pantalla de inicio de sesión con Continuar con email, Sign in with Apple y Google, y el enlace Crear cuenta.',
          platform: 'ios',
          width: 780,
          height: 1696,
        },
        {
          type: 'steps',
          items: [
            'En la pantalla de bienvenida, toca **Iniciar sesión**.',
            'Toca **Continuar con email**.',
            'Escribe tu email y tu contraseña.',
            'Toca **Entrar**.',
          ],
        },
        { type: 'p', text: 'Si olvidaste tu contraseña:' },
        {
          type: 'steps',
          items: [
            'En esa misma pantalla, toca **¿Olvidaste tu contraseña?**',
            'Escribe tu correo y toca **Enviar código**.',
            'Escribe el código de 6 dígitos que te llegó y toca **Verificar**.',
            'Escribe tu nueva contraseña, repítela y toca **Guardar contraseña**.',
          ],
        },
      ],
    },
    {
      id: 'permissions',
      title: 'Permisos que pide la app',
      blocks: [
        {
          type: 'p',
          text: 'La app pide cada permiso cuando lo necesita. Puedes decir que no: solo dejará de funcionar la parte que depende de ese permiso.',
        },
        {
          type: 'list',
          items: [
            '**Ubicación**, solo mientras usas la app: para mostrarte lo que hay cerca y confirmar que estás dentro de un local antes de dejarte entrar a su chat. JChat no comparte tu ubicación en tiempo real con otras personas.',
            '**Notificaciones**: para avisarte de mensajes, seguidores, pedidos y reservas.',
            '**Cámara**: para tomar fotos para el chat, las publicaciones y tu perfil.',
            '**Fotos**: para elegir imágenes de tu galería para tu perfil, tus publicaciones y tus mensajes.',
            '**Micrófono**: para grabar mensajes de voz.',
            '**Face ID o huella** (opcional): para desbloquear JChat al abrirlo y confirmar pagos, solo si lo activas. En iPhone es Face ID o Touch ID; en Android, la huella o el reconocimiento facial.',
          ],
        },
        {
          type: 'note',
          kind: 'important',
          text: 'Sin permiso de ubicación puedes ver el mapa, pero no puedes entrar al chat de un local. La app te muestra **Abrir Ajustes** para activarlo.',
        },
        {
          type: 'note',
          kind: 'tip',
          text: 'Para cambiar un permiso más tarde, abre los ajustes de tu teléfono y busca JChat: en iPhone está en la lista de apps de **Ajustes**; en Android, en los ajustes de apps, dentro de los permisos de JChat.',
        },
      ],
    },
  ],
};

export default chapter;
