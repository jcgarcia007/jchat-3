-- Versionada tal cual está en producción (supabase_migrations.schema_migrations, versión 20261010201500). APLICADA 2026-10-10.
-- 219: el super-admin puede saber si el contenido reportado todavía existe (solo booleano) + índice para la retención (218).
create index if not exists reports_content_idx on public.reports (content_type, content_id) where content_id is not null;

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
notify pgrst, 'reload schema';
