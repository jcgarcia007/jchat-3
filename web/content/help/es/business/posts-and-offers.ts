import type { HelpChapter } from '../../types';

const chapter: HelpChapter = {
  id: 'posts-and-offers',
  title: 'Publicaciones y ofertas',
  summary: 'Comparte novedades con fotos y crea ofertas que tus clientes ven en la app.',
  goal: 'Vas a publicar novedades y ofertas de tu local para que te vean los usuarios cercanos.',
  sections: [
    {
      id: 'where-they-show',
      title: 'Dónde se ven',
      blocks: [
        {
          type: 'p',
          text: 'Tus publicaciones y tus ofertas aparecen en la pantalla **Ofertas de negocios** de la app (el botón central de la barra inferior). Cada usuario elige el radio de distancia en el que quiere ver novedades.',
        },
        {
          type: 'p',
          text: 'Una oferta aparece en la app desde su fecha de inicio hasta que caduca. Además, si empieza al crearla y eliges una sala, sale como una tarjeta dentro de la sala de chat de tu local.',
        },
        {
          type: 'note',
          kind: 'important',
          text: 'Solo se muestran los locales verificados. Puedes crear publicaciones y ofertas antes, pero los usuarios las verán cuando tu local esté verificado. Mira cómo verificarlo en [Registra tu negocio](/help/business/register-your-business).',
        },
        {
          type: 'p',
          text: 'Las dos herramientas están en el panel web, en el grupo **Menú**: **Publicaciones** y **Ofertas**.',
        },
      ],
    },
    {
      id: 'create-post',
      title: 'Crea una publicación',
      blocks: [
        {
          type: 'steps',
          items: [
            'En el panel, abre **Publicaciones**.',
            'Pulsa **Nueva publicación**.',
            'En **Texto**, escribe lo que quieres compartir (hasta 1000 caracteres).',
            'Pulsa **Añadir fotos** y elige hasta 4. Deben ser JPG, PNG o WebP, de hasta 10 MB cada una.',
            'Mira la vista **Así se verá en la app** y, si quieres quitar una foto, pulsa **Quitar foto**.',
            'Pulsa **Publicar**. Verás **Publicación creada.**',
          ],
        },
        {
          type: 'image',
          src: '/help/business/posts-and-offers/posts-es.webp',
          alt: 'Pantalla Publicaciones del panel con el botón Nueva publicación y una publicación existente.',
          platform: 'web',
          width: 1280,
          height: 800,
        },
        {
          type: 'note',
          kind: 'important',
          text: 'Necesitas texto o al menos una foto. Si no, verás **Escribe un texto o añade al menos una foto.**',
        },
      ],
    },
    {
      id: 'manage-posts',
      title: 'Edita o borra una publicación',
      blocks: [
        {
          type: 'p',
          text: 'Tus publicaciones permanecen hasta que las borres. En cada una ves cuántos **Me gusta** y **Comentarios** tiene.',
        },
        {
          type: 'steps',
          items: [
            'En **Publicaciones**, busca la que quieres cambiar.',
            'Pulsa **Editar**, haz los cambios y pulsa **Guardar cambios**.',
            'Para quitarla, pulsa **Borrar** y confirma. No se puede deshacer.',
          ],
        },
      ],
    },
    {
      id: 'create-offer',
      title: 'Crea una oferta',
      blocks: [
        {
          type: 'steps',
          items: [
            'En el panel, abre **Ofertas**.',
            'Pulsa **Nueva oferta**.',
            'En **Tipo de oferta**, elige una opción: **Happy Hour**, **2x1**, **Código de descuento**, **Oferta relámpago** o **Paquete**.',
            'Escribe el **Título de la oferta**, por ejemplo «Happy Hour — cócteles 2x1». Es obligatorio.',
            'Si quieres, completa el **Valor del descuento** (por ejemplo «20%»), la **Compra mínima ($)** y la **Descripción**.',
            'Si elegiste **Código de descuento**, escribe el **Código promo**.',
            'En **Publicar en sala de chat**, elige la sala donde quieres que salga la tarjeta de la oferta, o déjalo en blanco.',
            'Si quieres, pon la fecha y la hora de inicio y de fin. Si no pones inicio, la oferta empieza al crearla.',
            'Pulsa **Crear oferta**.',
          ],
        },
        {
          type: 'image',
          src: '/help/business/posts-and-offers/offers-es.webp',
          alt: 'Pantalla Ofertas y promociones con los contadores y dos ofertas activas.',
          platform: 'web',
          width: 1280,
          height: 800,
        },
        {
          type: 'note',
          kind: 'important',
          text: 'La tarjeta en el chat se publica al crear la oferta solo si empieza en ese momento y elegiste una sala. Si pones un inicio futuro, la oferta queda como **Programada**: aparece en la app a la hora de inicio, pero no se publica sola en el chat, así que no sale ningún aviso ni tarjeta en la sala.',
        },
      ],
    },
    {
      id: 'manage-offers',
      title: 'Pausa o reanuda una oferta',
      blocks: [
        {
          type: 'p',
          text: 'Cada oferta muestra su estado: **Activa**, **Programada**, **Pausada** o **Finalizada**. **Pausar** solo cambia el estado de la oferta en tu panel: no la quita de la app ni retira su tarjeta del chat.',
        },
        {
          type: 'steps',
          items: [
            'En **Ofertas**, busca la oferta.',
            'Pulsa **Pausar** para detenerla, o **Reanudar** para activarla otra vez.',
          ],
        },
        {
          type: 'note',
          kind: 'tip',
          text: 'Ponle fecha de fin a las ofertas con tiempo limitado, como el Happy Hour, para que no tengas que acordarte de quitarlas.',
        },
      ],
    },
  ],
};

export default chapter;
