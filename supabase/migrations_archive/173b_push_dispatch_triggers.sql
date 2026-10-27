-- 173b: enviar push al insertar notificaciones sociales y mensajes directos
create extension if not exists pg_net with schema extensions;

create or replace function public.push_dispatch(p_kind text, p_record jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'push_webhook_secret'
  limit 1;

  if v_secret is null then
    return;
  end if;

  perform net.http_post(
    url := 'https://klfsgcfoahdtkojyqspd.supabase.co/functions/v1/send-push',
    body := jsonb_build_object('kind', p_kind, 'record', p_record),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', v_secret
    ),
    timeout_milliseconds := 10000
  );
exception when others then
  -- Nunca bloquear el insert original por un fallo de push
  raise warning 'push_dispatch failed: %', sqlerrm;
end;
$$;
revoke all on function public.push_dispatch(text, jsonb) from public, anon, authenticated;

-- Notificaciones sociales y de trabajo (los DMs van por dm_messages, no por aquí)
create or replace function public.push_on_notification_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.push_dispatch(
    'notification',
    jsonb_build_object(
      'id', new.id,
      'user_id', new.user_id,
      'type', new.type,
      'payload', new.payload,
      'created_at', new.created_at
    )
  );
  return new;
end;
$$;
revoke all on function public.push_on_notification_insert() from public, anon, authenticated;

drop trigger if exists trg_push_on_notification_insert on public.notifications;
create trigger trg_push_on_notification_insert
  after insert on public.notifications
  for each row
  when (new.type in ('follower', 'like', 'comment', 'work_alert'))
  execute function public.push_on_notification_insert();

-- Mensajes directos
create or replace function public.push_on_dm_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.push_dispatch(
    'dm',
    jsonb_build_object(
      'id', new.id,
      'conversation_id', new.conversation_id,
      'sender_id', new.sender_id,
      'body', new.body
    )
  );
  return new;
end;
$$;
revoke all on function public.push_on_dm_insert() from public, anon, authenticated;

drop trigger if exists trg_push_on_dm_insert on public.dm_messages;
create trigger trg_push_on_dm_insert
  after insert on public.dm_messages
  for each row
  execute function public.push_on_dm_insert();
