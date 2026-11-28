import type { HelpChapter } from '../../types';

const chapter: HelpChapter = {
  id: 'register-your-business',
  title: 'Registra tu negocio',
  summary: 'Crea tu cuenta, registra tu local y deja listo lo necesario para que lo verifiquemos y aparezca en el mapa.',
  goal: 'Crear tu cuenta, registrar tu local en JChat y dejarlo listo para que lo revisemos y aparezca en el mapa de la app.',
  sections: [
    {
      id: 'create-account',
      title: 'Crea tu cuenta',
      blocks: [
        { type: 'p', text: 'Tu cuenta es la misma para la app y para el panel de negocios. Debes tener 18 años o más.' },
        {
          type: 'steps',
          items: [
            'Entra a [jchat.cloud/auth/register](https://jchat.cloud/auth/register).',
            'Escribe tu **Nombre completo**, tu **Correo electrónico** y una **Contraseña** de al menos 8 caracteres, con una letra y un número. Repítela en **Confirmar contraseña**.',
            'Pulsa **Continuar →**. También puedes usar **Continuar con Google**.',
            'En el paso 2 escribe tu **Fecha de nacimiento**, elige tu **Idioma** y un **Nombre de usuario** (de 3 a 30 caracteres: letras minúsculas, números y guion bajo).',
            'Acepta los [Términos de servicio](/terms) y la [Política de privacidad](/privacy) y pulsa **Crear mi cuenta 🎉**.',
          ],
        },
        { type: 'note', kind: 'tip', text: 'Si al iniciar sesión ves **Primero confirma tu correo. Revisa tu bandeja de entrada.**, abre el correo que te enviamos y toca el enlace de confirmación.' },
      ],
    },
    {
      id: 'choose-a-plan',
      title: 'Elige un plan antes de registrar el local',
      blocks: [
        { type: 'p', text: 'Para registrar un local, tu cuenta necesita un plan Business o Pro activo; la prueba gratis cuenta. Sin plan, el formulario de registro muestra **Llegaste al límite de negocios**, con los botones **Contáctanos** y **Volver al panel**. Si el límite se alcanza al terminar el registro, verás «Llegaste al límite de negocios y eventos de tu plan. Mejora tu plan para añadir más.» con el enlace **Ver planes**. Mira los planes y empieza tu prueba en [Planes y prueba gratis](/help/business/plans-and-trial).' },
        { type: 'note', kind: 'important', text: 'El plan Business permite 1 local o evento. El plan Pro permite hasta 10 locales o eventos en total.' },
      ],
    },
    {
      id: 'venue-info',
      title: 'Datos y ubicación del local',
      blocks: [
        { type: 'p', text: 'Con tu plan activo, abre [jchat.cloud/business/register](https://jchat.cloud/business/register) e inicia sesión si te lo pide. Si entras al panel con una cuenta sin local, también verás el botón **Registrar mi negocio**.' },
        { type: 'note', kind: 'important', text: 'Los campos que terminan en asterisco (*) son obligatorios: **Nombre del negocio**, **Categoría**, **Dirección** y **Teléfono**, además de la ubicación.' },
        {
          type: 'steps',
          items: [
            'En el paso **Datos**, escribe el **Nombre del negocio** y elige la **Categoría** (por ejemplo Restaurante, Café o Bar y discoteca).',
            'Si quieres, escribe una **Descripción** (hasta 500 caracteres), sube una foto con **Subir foto de portada** (JPG, PNG o WebP) y elige un emoji en **Emoji de icono**.',
            'Pulsa **Continuar**. En el paso **Ubicación** escribe la **Dirección** y el **Teléfono**. Puedes añadir tu **Sitio web**.',
            'Pulsa **Continuar**. JChat busca tu dirección en el mapa y rellena **Latitud** y **Longitud**; te quedas en este paso para que las revises.',
            'Revisa las coordenadas y pulsa **Continuar** otra vez.',
          ],
        },
        {
          type: 'list',
          items: [
            'La ubicación es obligatoria: así confirmamos que las personas están en tu local. Si no encuentra la dirección, escribe tú la latitud y la longitud.',
            '**Radio (m)** empieza en 100 y no puede ser menor de 10. Es el radio de tu local.',
          ],
        },
      ],
    },
    {
      id: 'hours-and-finish',
      title: 'Horario y fin del registro',
      blocks: [
        {
          type: 'steps',
          items: [
            'En el paso **Horario**, toca en **Días de apertura** los días en que abres (Lu a Do). También puedes usar **Marcar todos** o **Quitar todos**.',
            'Para cada día abierto, elige la hora de apertura y la de cierre. Marca **Abierto 24 h** si no cierras. Si cierras después de medianoche, verás el aviso **Cierra al día siguiente**.',
            'Con **Copiar a todos los días** repites el horario de un día en los demás.',
            'Pulsa **Continuar**. El último paso se llama **Cobros** y es solo informativo: no hay nada que conectar ahí. Te recuerda que conectarás Stripe desde Pagos cuando termines, y que tengas a mano los datos de tu negocio y los de la cuenta bancaria donde quieres recibir el dinero.',
            'Pulsa **Completar registro**.',
          ],
        },
        { type: 'note', kind: 'important', text: 'Puedes completar el registro sin Stripe. Conecta Stripe desde **Pagos** cuando termines, como se explica en [Cobra tus pedidos](/help/business/get-paid). Hasta entonces, los pedidos y los pagos dentro de la app no estarán disponibles.' },
      ],
    },
    {
      id: 'review-and-map',
      title: 'Verificación y mapa',
      blocks: [
        { type: 'p', text: 'Al terminar verás **Verifica tu negocio**. La pantalla dice que recibimos tu negocio, que un administrador lo revisará en menos de 24 h y que te avisaremos por correo. No tienes que enviar nada más.' },
        {
          type: 'steps',
          items: [
            'Pulsa **Ir a mi dashboard**.',
            'Para cobrar en la app, pulsa **Ir a Pagos** y conecta Stripe. Mientras esperas, prepara también tu [menú](/help/business/menu). Más en [Cobra tus pedidos](/help/business/get-paid).',
          ],
        },
        { type: 'p', text: 'Cuando tu negocio queda verificado, aparece en el mapa y entre los locales cercanos de la app. Si todavía no está verificado, no aparece. Si esa pantalla dice **Tu negocio ya está verificado**, ya está listo.' },
        { type: 'note', kind: 'tip', text: '¿Dudas sobre la verificación? Escríbenos a [soporte@jchat.cloud](mailto:soporte@jchat.cloud).' },
      ],
    },
  ],
};

export default chapter;
