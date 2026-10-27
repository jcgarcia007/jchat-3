-- 172: borrar notificaciones propias + ocultar conversaciones DM solo para un lado
drop policy if exists "notifications: user delete own" on public.notifications;
create policy "notifications: user delete own"
  on public.notifications for delete
  to authenticated
  using ((select auth.uid()) = user_id);

alter table public.dm_conversations
  add column if not exists hidden_at_a timestamptz,
  add column if not exists hidden_at_b timestamptz;

comment on column public.dm_conversations.hidden_at_a is 'Momento en que user_a ocultó la conversación de su bandeja; mensajes anteriores no se le muestran. NULL = visible.';
comment on column public.dm_conversations.hidden_at_b is 'Momento en que user_b ocultó la conversación de su bandeja; mensajes anteriores no se le muestran. NULL = visible.';

create or replace function public.hide_dm_conversation(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_conv public.dm_conversations%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_conv from public.dm_conversations where id = p_conversation_id;
  if not found then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;

  if v_conv.user_a = v_uid then
    update public.dm_conversations set hidden_at_a = now() where id = p_conversation_id;
  elsif v_conv.user_b = v_uid then
    update public.dm_conversations set hidden_at_b = now() where id = p_conversation_id;
  else
    raise exception 'not_a_participant' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.hide_dm_conversation(uuid) from public, anon;
grant execute on function public.hide_dm_conversation(uuid) to authenticated;
