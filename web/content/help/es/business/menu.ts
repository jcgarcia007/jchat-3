import type { HelpChapter } from '../../types';

const chapter: HelpChapter = {
  id: 'menu',
  title: 'Tu menú',
  summary: 'Crea categorías y productos, elige cómo se ve tu menú y comparte su enlace público.',
  goal: 'Armar tu menú, decidir cómo lo ven tus clientes y compartir su enlace.',
  sections: [
    {
      id: 'menu-mode',
      title: 'Elige el modo de tu menú',
      blocks: [
        { type: 'p', text: 'En el panel, abre **Menú** > **Menú**: se abre el **Editor de menú**. En **Modo del menú** eliges cómo muestras tu menú a los clientes en el hub web.' },
        {
          type: 'image',
          src: '/help/business/menu/dash-es.webp',
          alt: 'Editor de menú del panel con el modo de menú, las categorías y la vista en vivo del teléfono.',
          platform: 'web',
          width: 1280,
          height: 800,
        },
        {
          type: 'list',
          items: [
            '**Crear mi Menú Web (plantilla)**: crea tu propio menú interactivo con el editor de JChat (categorías, productos, precios).',
            '**Tengo mi propio menú (link)**: pega el link a tu menú existente (PDF, Linktree, Google Docs, etc.).',
          ],
        },
        {
          type: 'steps',
          items: [
            'En **Modo del menú**, elige una de las dos opciones.',
            'Si elegiste **Tengo mi propio menú (link)**, pega la dirección, que debe empezar con http:// o https://, y pulsa **Guardar**.',
            'Verás **Modo de menú guardado.** y, junto a **Estado actual:**, cómo quedó tu menú.',
          ],
        },
        { type: 'note', kind: 'tip', text: 'Con **Quitar menú (no mostrar nada)** dejas de mostrar tu menú. Las secciones **Plantilla de menú**, **Paleta de colores** y **Efecto de tarjetas** solo aparecen con **Crear mi Menú Web (plantilla)**.' },
      ],
    },
    {
      id: 'categories',
      title: 'Crea tus categorías',
      blocks: [
        {
          type: 'steps',
          items: [
            'En **Categorías del menú**, pulsa **Nueva categoría**.',
            'Escribe el **Nombre de la categoría** (es obligatorio).',
            'Elige una imagen en **Icono**, o sube tu propia imagen en la pestaña **Foto**.',
            'Pulsa **Guardar**.',
          ],
        },
        { type: 'p', text: 'En cada categoría hay botones con estos nombres:' },
        {
          type: 'list',
          items: [
            '**Subir categoría** y **Bajar categoría**: cambian su orden.',
            '**Editar categoría**: cambia su nombre, su icono o su foto.',
            '**Ocultar categoría** y **Mostrar categoría**: la quitan o la devuelven a tu menú sin borrarla.',
            '**Eliminar categoría**: la borra.',
          ],
        },
        { type: 'note', kind: 'important', text: 'Al eliminar una categoría también se eliminan todos sus productos. JChat te lo pregunta antes: **¿Eliminar la categoría "…"? Esto también eliminará todos sus productos.**' },
        { type: 'note', kind: 'tip', text: 'Con el plan Pro, el botón **Asistente IA** te propone categorías y productos. Nada se publica hasta que tú lo decidas.' },
      ],
    },
    {
      id: 'products',
      title: 'Agrega productos',
      blocks: [
        {
          type: 'steps',
          items: [
            'En la categoría, pulsa **Agregar producto**.',
            'Escribe el **Nombre del producto** y el **Precio base (USD)**. Los dos son obligatorios.',
            'Escribe una **Descripción** breve, con ingredientes o estilo de preparación.',
            'Pulsa **Guardar producto**.',
          ],
        },
        { type: 'p', text: 'En cada producto hay botones con estos nombres:' },
        {
          type: 'list',
          items: [
            '**Editar producto**: cambia sus datos.',
            '**Ocultar del menú** y **Mostrar en el menú**: lo quitan o lo devuelven sin borrarlo.',
            '**Eliminar producto**: lo borra.',
          ],
        },
        { type: 'note', kind: 'tip', text: 'En **Costo unitario (USD)** puedes anotar lo que te cuesta el producto. Es privado: nunca se muestra en tu menú público.' },
      ],
    },
    {
      id: 'photos-and-options',
      title: 'Fotos, etiquetas y opciones',
      blocks: [
        {
          type: 'steps',
          items: [
            'En el producto, baja a **Fotos del producto** y pulsa **Agregar fotos (jpeg, png, webp · máx 5 MB)**.',
            'Elige tus imágenes. La insignia **Principal** marca la foto principal del producto.',
            'Si quieres, marca las **Etiquetas dietéticas** que apliquen y elige una **Insignia**.',
            'En **Grupos de opciones**, pulsa **Nuevo grupo** para ofrecer algo que el cliente elige, como el tamaño o un extra.',
            'Escribe el **Nombre del grupo** (por ejemplo, Tamaño) y elige si es **Único** (elige uno) o **Múltiple**. Con **Mín:** y **Máx:** limitas cuántas opciones puede elegir; el grupo es **requerido** cuando el mínimo es mayor que cero.',
            'Pulsa **Agregar opción**, escribe su nombre y, si cuesta más, su precio adicional.',
            'Pulsa **Guardar producto**.',
          ],
        },
        {
          type: 'list',
          items: [
            'Etiquetas dietéticas: **Vegano**, **Vegetariano**, **Sin gluten**, **Sin lácteos**, **Sin frutos secos**, **Picante** y **Mariscos**.',
            'Insignias: **Ninguno**, **Nuevo**, **Popular** y **Más vendido**.',
            '**Cantidad en stock**: déjala en blanco para tener existencias ilimitadas. Cuando llega a 0, el producto se oculta automáticamente.',
            '**Nombre (idioma alt.)** y **Descripción (idioma alt.)**: para escribir el producto en un segundo idioma.',
          ],
        },
        { type: 'note', kind: 'tip', text: 'Si ya creaste un grupo de opciones en otro producto, usa **Reutilizar grupo del negocio** para no escribirlo de nuevo. Con el plan Pro, el botón **→ EN** o **→ ES** traduce la descripción con IA.' },
      ],
    },
    {
      id: 'look-and-feel',
      title: 'Plantilla, colores y efecto',
      blocks: [
        { type: 'p', text: 'Con **Crear mi Menú Web (plantilla)** activo, el editor te muestra tres secciones plegables. Todas se guardan al elegir.' },
        {
          type: 'steps',
          items: [
            'Abre **Plantilla de menú** y toca la que te guste. Verás **Plantilla guardada.** y la marca **✓ Activa**.',
            'Abre **Paleta de colores** y elige una de las 40 paletas, o **Original de la plantilla** para volver a sus colores. La tipografía no cambia.',
            'Abre **Efecto de tarjetas** y elige la animación que verán tus clientes al pasar el cursor sobre cada platillo.',
          ],
        },
        { type: 'note', kind: 'tip', text: 'En pantallas anchas ves a la derecha una vista previa de tu menú en un teléfono. Para ver el resultado real, usa **Ver menú público →**.' },
      ],
    },
    {
      id: 'share-your-menu',
      title: 'Comparte tu menú',
      blocks: [
        {
          type: 'steps',
          items: [
            'En **Modo del menú**, con **Crear mi Menú Web (plantilla)** activo, pulsa **Ver mi Menú Web ↗**.',
            'Se abre tu menú público. Copia la dirección de la barra de tu navegador para compartirla.',
            'Activa **Mostrar menú en el chat** para que tus clientes vean el ícono de tu menú en el chat del local.',
          ],
        },
        { type: 'note', kind: 'important', text: 'Una categoría o un producto oculto no aparece para tus clientes. Si un producto se agota, verás la marca **Agotado** en su tarjeta.' },
      ],
    },
  ],
};

export default chapter;
