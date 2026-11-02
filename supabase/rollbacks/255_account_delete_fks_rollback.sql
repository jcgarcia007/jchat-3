-- Reversión de 255_account_delete_fks.sql. NO la apliques salvo que haga falta: volver las claves a SET NULL REPRODUCE el defecto B2-1
-- (el borrado de una cuenta con mensajes, anclajes o disputas vuelve a fallar con "Database error deleting user").
-- Los mensajes, anclajes y disputas que ya se hayan borrado en cascada NO se recuperan con esta reversión.

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'messages_user_id_fkey' and conrelid = 'public.messages'::regclass and confdeltype <> 'n') then
    alter table public.messages drop constraint messages_user_id_fkey;
    alter table public.messages add constraint messages_user_id_fkey foreign key (user_id) references public.users(id) on delete set null;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'pinned_messages_pinned_by_fkey' and conrelid = 'public.pinned_messages'::regclass and confdeltype <> 'n') then
    alter table public.pinned_messages drop constraint pinned_messages_pinned_by_fkey;
    alter table public.pinned_messages add constraint pinned_messages_pinned_by_fkey foreign key (pinned_by) references public.users(id) on delete set null;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'disputes_opened_by_fkey' and conrelid = 'public.disputes'::regclass and confdeltype <> 'n') then
    alter table public.disputes drop constraint disputes_opened_by_fkey;
    alter table public.disputes add constraint disputes_opened_by_fkey foreign key (opened_by) references public.users(id) on delete set null;
  end if;
end $$;

-- gifts: volver a NOT NULL solo si no hay filas con NULL (si las hay, se detiene aquí sin cambiar nada).
do $$
begin
  if exists (select 1 from public.gifts where from_user is null or to_user is null) then
    raise exception '255 rollback: hay filas de gifts con from_user/to_user NULL (cuentas borradas); no se puede volver a NOT NULL';
  end if;
  alter table public.gifts alter column from_user set not null;
  alter table public.gifts alter column to_user set not null;
end $$;
