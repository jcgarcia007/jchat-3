-- APLICADA 2026-10-10 por SQL Editor
alter table public.tod_draws drop constraint if exists tod_draws_round_id_fkey;
alter table public.tod_votes drop constraint if exists tod_votes_draw_id_fkey;
alter table public.tod_rounds add constraint tod_rounds_business_fk foreign key (business_id) references public.businesses(id) on delete cascade;
alter table public.tod_rounds add constraint tod_rounds_room_fk foreign key (room_id) references public.rooms(id) on delete cascade;
alter table public.tod_rounds add constraint tod_rounds_creator_fk foreign key (creator_id) references public.users(id) on delete cascade;
alter table public.tod_draws add constraint tod_draws_round_fk foreign key (round_id) references public.tod_rounds(id) on delete cascade;
alter table public.tod_draws add constraint tod_draws_user_fk foreign key (user_id) references public.users(id) on delete cascade;
alter table public.tod_votes add constraint tod_votes_draw_fk foreign key (draw_id) references public.tod_draws(id) on delete cascade;
alter table public.tod_votes add constraint tod_votes_voter_fk foreign key (voter_id) references public.users(id) on delete cascade;
alter table public.tod_terms add constraint tod_terms_user_fk foreign key (user_id) references public.users(id) on delete cascade;
alter table public.tod_kicks add constraint tod_kicks_user_fk foreign key (user_id) references public.users(id) on delete cascade;
alter table public.tod_kicks add constraint tod_kicks_business_fk foreign key (business_id) references public.businesses(id) on delete cascade;
alter table public.tod_settings add constraint tod_settings_business_fk foreign key (business_id) references public.businesses(id) on delete cascade;
alter table public.tod_moderation_log add constraint tod_modlog_business_fk foreign key (business_id) references public.businesses(id) on delete cascade;
create or replace function public.tod_purge() returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.tod_rounds where created_at < now() - interval '90 days';
  delete from public.tod_moderation_log where created_at < now() - interval '365 days';
end; $$;
revoke all on function public.tod_purge() from public, anon, authenticated;
select cron.schedule('tod-purge', '15 4 * * *', $$select public.tod_purge()$$) where not exists (select 1 from cron.job where jobname = 'tod-purge');
