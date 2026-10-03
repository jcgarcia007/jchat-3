-- 186: el nombre de usuario autogenerado ya NO usa el correo (exponía parte del email en un dato público).
-- Base: nombre de la metadata (Google/Apple) o 'user'. El llamador (handle_new_auth_user) agrega el sufijo único.
-- Los usernames existentes no cambian.

create or replace function public.derive_username(_email text, _meta jsonb)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  base text;
begin
  base := lower(coalesce(_meta->>'full_name', _meta->>'name', ''));
  base := regexp_replace(base, '[^a-z0-9_]', '', 'g');

  if length(base) < 3 then
    base := 'user';
  end if;

  return left(base, 30);
end;
$function$;
