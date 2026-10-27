-- 064: el dueño del negocio puede RESPONDER a las reseñas de su negocio.
-- Antes: única política de UPDATE = autor (auth.uid() = user_id) → el UPDATE del dueño
-- no matcheaba NINGUNA política → 0 filas, sin error → la respuesta se perdía en silencio.
-- Patrón de la migr 060: la RLS decide QUÉ FILAS; los column grants deciden QUÉ COLUMNAS.
--
-- Allow-list = SOLO (response, responded_at), verificado en el código (PASO 0):
--   el DUEÑO escribe {response, responded_at} (respondToReview / submitResponse) y el
--   AUTOR nunca edita rating/body desde ninguna pantalla (solo INSERT al crear la reseña).
--   Por eso NO se conceden rating/body (contra el ejemplo del spec) — sin evidencia de uso.
--   `status` (reportReview) se deja FUERA: ya fallaba por RLS (no hay política de reporter)
--   y queda como issue aparte, no se abre aquí.

begin;

-- 1. RLS: el dueño puede actualizar las reseñas de SUS negocios.
create policy "reviews: business owner respond"
  on public.reviews for update to authenticated
  using (
    exists (
      select 1 from public.businesses b
       where b.id = reviews.business_id
         and b.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.businesses b
       where b.id = reviews.business_id
         and b.owner_id = auth.uid()
    )
  );

-- 2. Column allow-list: quitar el UPDATE de tabla completa (authenticated y anon lo tenían
--    sobre las 9 columnas) y re-conceder SOLO las columnas operativas de respuesta.
revoke update on table public.reviews from authenticated;
revoke update on table public.reviews from anon;

grant update (response, responded_at) on table public.reviews to authenticated;

commit;
