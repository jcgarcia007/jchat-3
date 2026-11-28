import type { HelpChapter } from '../../types';

const chapter: HelpChapter = {
  id: 'find-a-venue',
  title: 'Encontrar un local',
  summary: 'Usa el mapa, la lista Cerca de ti, la búsqueda y los filtros para encontrar locales y ver su ficha y sus ofertas.',
  goal: 'Vas a encontrar un local cerca de ti y a saber qué puedes hacer desde su ficha.',
  sections: [
    {
      id: 'map',
      title: 'El mapa',
      blocks: [
        {
          type: 'p',
          text: 'La barra de abajo tiene cuatro pestañas (**Mapa**, **Cerca**, **Mensajes** y **Perfil**) y un botón central, **Ofertas**. El mapa es la primera pestaña.',
        },
        {
          type: 'steps',
          items: [
            'Toca **Mapa**.',
            'La primera vez, la app te explica para qué usa tu ubicación. Toca **Continuar** y permite la ubicación en el aviso de tu teléfono.',
            'Mueve el mapa con el dedo. Usa los botones de acercar y alejar, o el de centrar en tu ubicación, para volver a donde estás.',
            'Para cambiar el aspecto del mapa, toca el botón de estilo y elige **Normal** o **Satélite**.',
            'Toca un pin para abrir la ficha de ese local.',
          ],
        },
        {
          type: 'list',
          items: [
            'Cada pin muestra el nombre del local y, si hay gente dentro, cuántas personas hay.',
            'Un local cerrado se ve en gris y su pin dice **cerrado**.',
          ],
        },
        {
          type: 'note',
          kind: 'important',
          text: 'Si no permites la ubicación, el mapa se ve, pero sin distancias ni filtro por radio. La app muestra un aviso con **Abrir Ajustes** para activarla. Si no se pudieron cargar los lugares, toca **Toca para reintentar**.',
        },
      ],
    },
    {
      id: 'nearby-list',
      title: 'La lista Cerca de ti',
      blocks: [
        {
          type: 'p',
          text: 'Si prefieres una lista en vez de un mapa, usa la pestaña **Cerca**. Cada local aparece en una tarjeta con su categoría, si está abierto o cerrado, cuántas salas tiene, cuántas personas hay y la distancia.',
        },
        {
          type: 'steps',
          items: [
            'Toca **Cerca**.',
            'Para buscar por nombre, escribe en **Buscar locales…**.',
            'Para ver un tipo de local, toca una categoría. **Todos** quita el filtro.',
            'Toca **Entrar** en la tarjeta del local. Tienes que estar dentro del local para entrar al chat (mira [Chat del local](/help/users/venue-chat)).',
            'Para actualizar la lista, desliza hacia abajo.',
          ],
        },
        {
          type: 'note',
          kind: 'tip',
          text: 'Si ves **No hay locales cerca** o **No se encontraron resultados**, prueba otra búsqueda o quita la categoría.',
        },
      ],
    },
    {
      id: 'search-and-filters',
      title: 'Buscar y filtrar en el mapa',
      blocks: [
        {
          type: 'steps',
          items: [
            'En el mapa, escribe el nombre o la categoría en **Buscar lugares…**. Debajo aparece una lista de resultados.',
            'Toca un resultado: el mapa se centra en ese local y se abre su ficha. **Cancelar** limpia la búsqueda.',
            'Para ver solo un tipo de local, toca una categoría de la fila de arriba: **Todas**, **Abierto ahora**, **Restaurante**, **Café**, **Bar y discoteca** y las demás que haya.',
            'Para más opciones, toca el botón de filtros avanzados. En **Filtros** puedes elegir la **Distancia** y activar **Solo abierto ahora**.',
            'Toca **Aplicar**. Para volver a ver todo, toca **Restablecer todo** o **Restablecer**.',
          ],
        },
        {
          type: 'p',
          text: 'Con la ubicación activada, el mapa te dice cuántos lugares hay cerca de ti. La distancia se muestra en kilómetros o en millas, según la región de tu teléfono.',
        },
        {
          type: 'note',
          kind: 'important',
          text: 'El filtro por distancia necesita tu ubicación. Sin ella verás **Activa la ubicación para filtrar por distancia.**',
        },
      ],
    },
    {
      id: 'venue-card',
      title: 'La ficha del local',
      blocks: [
        {
          type: 'p',
          text: 'La ficha se abre al tocar un pin, un resultado de búsqueda o **Ver local** en la pestaña de ofertas. Muestra las fotos, la descripción, la dirección y la distancia, la calificación, el horario y cuántas personas hay activas.',
        },
        {
          type: 'list',
          items: [
            '**Entrar al chat**: abre el chat del local. Solo funciona cuando estás dentro del local.',
            '**Cómo llegar**: abre tu app de mapas con la ruta al local.',
            '**Menú**: abre el menú del local (mira [Pedir y pagar](/help/users/order-and-pay)).',
            '**Ofertas**: te lleva a las ofertas de los negocios cercanos.',
            '**Reservar**: abre el formulario para reservar una mesa (mira [Reservas](/help/users/reservations)).',
            '**Ver más** y **Ver horario**: despliegan la descripción completa y el horario de cada día.',
            'El botón de compartir envía el enlace del local a quien tú quieras.',
          ],
        },
        {
          type: 'note',
          kind: 'important',
          text: 'Si estás lejos, el botón **Entrar al chat** aparece desactivado y la ficha te dice a qué distancia estás. Solo puedes entrar al chat cuando estás dentro del local.',
        },
        {
          type: 'note',
          kind: 'tip',
          text: 'Si el local está cerrado, la ficha muestra **Cerrado ahora** y a qué hora abre. Puedes entrar al chat, pero los pedidos se abren cuando el local abra.',
        },
      ],
    },
    {
      id: 'offers',
      title: 'Ofertas de los negocios',
      blocks: [
        {
          type: 'p',
          text: 'El botón central de la barra, **Ofertas**, muestra las ofertas y las publicaciones de los negocios cercanos. Cada oferta puede traer su fecha de vencimiento y un código.',
        },
        {
          type: 'steps',
          items: [
            'Toca **Ofertas**.',
            'Recorre la lista. Para ver el local de una oferta, toca **Ver local**.',
            'Si quieres ver más lejos o más cerca, toca el botón del radio y elige un radio. La app lo guarda.',
            'Para volver, toca la flecha de regreso.',
          ],
        },
        {
          type: 'note',
          kind: 'tip',
          text: 'Si ves **No hay ofertas por ahora**, aún no hay ofertas de negocios verificados. Si ves que no hay novedades en tu radio, prueba con uno mayor.',
        },
      ],
    },
  ],
};

export default chapter;
