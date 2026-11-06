-- JChat — SOLO el perfil de Match completo de @jchatreview2 (bloque 4 de review_seed.sql, para ejecutarlo sin repetir todo el seed). NO ES UNA MIGRACIÓN: lo ejecuta Juan.
-- Idempotente. Solo filas con ids d4000000-0000-4000-8000-… (foto 699) y los 2 intereses; género/busca solo si faltan. Si @jchatreview2 no existe, no hace nada.
-- Antes: sube supabase/scripts/review-seed-avatars/demo-reviewer.png al bucket PRIVADO match-photos con la ruta demo/review-seed/demo-reviewer.png.
-- Reversión: review_unseed.sql (borra la foto por id; los intereses de la cuenta se quitan desde la app o a mano: son de la cuenta real).
do $seed$
declare
  v_reviewer2 uuid;
begin
  -- 4. la cuenta 2 (@jchatreview2): perfil de Match COMPLETO, solo filas con ids d4000000-… y solo si ella existe.
  --    Requisitos de utils/matchProfileState.ts (summarize/deckGate): género, "busca", al menos una foto y al menos una APROBADA (state = 'complete' → deckGate = null).
  --    Género y "busca" se ponen solo si aún no tiene perfil; si ya lo tiene, no se pisan. Los intereses no son requisito del mazo, pero el perfil se ve mejor con 2.
  select id into v_reviewer2 from public.users where lower(username) = 'jchatreview2';
  if v_reviewer2 is not null then
    insert into public.match_profiles (user_id, gender, seeking) values (v_reviewer2, 'nonbinary', 'all') on conflict (user_id) do nothing;
    update public.match_profiles set gender = 'nonbinary' where user_id = v_reviewer2 and gender is null;
    update public.match_profiles set seeking = 'all' where user_id = v_reviewer2 and seeking is null;
    insert into public.match_photos (id, user_id, path, sort, status, reviewed_at)
    values ('d4000000-0000-4000-8000-000000000699', v_reviewer2, 'demo/review-seed/demo-reviewer.png', 0, 'approved', now())
    on conflict (id) do update set status = 'approved', reviewed_at = now();
    insert into public.user_interests (user_id, interest_key)
    select v_reviewer2, k from unnest(array['music', 'food']) k where exists (select 1 from public.interests i where i.key = k)
    on conflict do nothing;
  end if;
end
$seed$;
