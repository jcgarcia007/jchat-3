# Migración 253 — reservada (respuesta escrita de Truth or Dare)

El número 253 está reservado para la respuesta escrita de Truth or Dare. Todavía no existe el archivo (ni en `supabase/migrations/` ni
en la historia); este documento deja anotado lo que NO se puede olvidar cuando se escriba:

- **La respuesta escrita tiene que pasar por el filtro de texto** (migración 259, `public.content_filter_trigger()`). Con la columna
  que guarde el texto (ejemplo, si fuera `answer_text` en `public.tod_answers`):

  ```sql
  create or replace trigger trg_content_filter_answer_text
    before insert or update of answer_text on public.tod_answers
    for each row execute function public.content_filter_trigger('answer_text');
  ```

  Va en la propia 253 (después de crear la columna). Sin eso, la respuesta escrita sería la única entrada de texto de usuario sin
  filtro (las cartas, `tod_cards.body`, ya lo tienen desde la 259).
- La app debe mostrar el error `message_not_allowed` al guardarla (`errors:app.message_not_allowed`, es/en, ya existe desde A4).
- La 253 no tiene que aplicarse antes ni después de la 259, pero si se aplica ANTES de la 259 `content_filter_trigger()` aún no existe:
  en ese caso la 253 debe esperar a la 259 o crear el trigger en una migración posterior.
