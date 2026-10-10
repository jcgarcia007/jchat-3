-- 219 (PROPUESTA — NO APLICADA): el super-admin puede saber si el contenido reportado todavía existe.
-- Solo lectura (sin DELETE ni DROP): se puede aplicar como una migración normal.
--
-- Por qué
--   La cola de reportes necesita saber si el contenido reportado ya fue purgado (p. ej. un mensaje de sala de más de 24 h) para
--   mostrar "El contenido ya expiró; se muestra la copia guardada" y desactivar "Ocultar contenido". El super-admin NO puede leer
--   esas filas con una consulta normal: las políticas de messages / posts / dm_messages dependen de ser miembro de la sala o
--   participante, así que un select desde el navegador daría "no existe" por error. Esta función corre como security definer.
--
-- Qué hace
--   admin_report_content_exists(p_content_type, p_content_id) → true si la fila existe. Solo is_platform_admin(). Solo devuelve un
--   booleano: no expone el contenido. Tipos: post, comment, message, dm_message; cualquier otro → true (no se sabe, no se bloquea nada).
--
-- Cómo probarlo (como superadmin, en la app web, o con un id real y uno inventado):
--   select public.admin_report_content_exists('message', '<id de un mensaje existente>');        -- true
--   select public.admin_report_content_exists('message', '00000000-0000-0000-0000-000000000000'); -- false
--   Como usuario normal → error forbidden (42501).
--
-- Rollback:
--   drop function public.admin_report_content_exists(text, uuid);

create or replace function public.admin_report_content_exists(p_content_type text, p_content_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_content_id is null then return false; end if;
  return case p_content_type
    when 'post'       then exists (select 1 from public.posts       where id = p_content_id)
    when 'comment'    then exists (select 1 from public.comments    where id = p_content_id)
    when 'message'    then exists (select 1 from public.messages    where id = p_content_id)
    when 'dm_message' then exists (select 1 from public.dm_messages where id = p_content_id)
    else true
  end;
end;
$$;
revoke all on function public.admin_report_content_exists(text, uuid) from public, anon;
grant execute on function public.admin_report_content_exists(text, uuid) to authenticated;
