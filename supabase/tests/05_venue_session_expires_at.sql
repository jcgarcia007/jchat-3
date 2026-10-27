-- venue_session_expires_at: when a guest session ends, from the venue's weekly hours and time zone. now() is fixed inside the
-- transaction, so every expectation is computed from the same now(). The venue gets a fixed-offset zone (Etc/GMT±N) chosen so that
-- its LOCAL time is about 12:00 right now: the cases below then never straddle local midnight, whatever time the suite runs.
do $t$
declare
  biz constant uuid := pg_temp.seed_venue();
  v_off int := ((12 - extract(hour from now() at time zone 'UTC')::int + 36) % 24) - 12;   -- -12 .. +11
  v_tz text := case when v_off = 0 then 'Etc/GMT' when v_off > 0 then 'Etc/GMT-' || v_off else 'Etc/GMT+' || (-v_off) end;
  v_local timestamp := now() at time zone v_tz;
  v_today date := v_local::date;
  keys text[] := array['sun','mon','tue','wed','thu','fri','sat'];
  k_today text; k_yday text; k_tom text;
  res timestamptz;
  fb timestamptz := now() + interval '24 hours';
  all_days jsonb;
begin
  k_today := keys[extract(dow from v_today)::int + 1];
  k_yday := keys[extract(dow from v_today - 1)::int + 1];
  k_tom := keys[extract(dow from v_today + 1)::int + 1];
  update public.businesses set timezone = v_tz where id = biz;
  select jsonb_object_agg(k, '{"open":"08:00","close":"20:00"}'::jsonb) into all_days from unnest(keys) k;

  perform pg_temp.t_ok(extract(hour from v_local) between 11 and 12, 'harness: the venue''s local time is about 12:00', v_local::text);

  -- no hours / unknown business → 24 h
  update public.businesses set hours = '{}' where id = biz;
  perform pg_temp.t_ok(public.venue_session_expires_at(biz) = fb, 'empty hours → now() + 24 h');
  perform pg_temp.t_ok(public.venue_session_expires_at('99999999-0000-4000-8000-000000000000') = fb, 'unknown business → now() + 24 h');

  -- open now (08:00–20:00): ends today 20:00 local
  update public.businesses set hours = all_days where id = biz;
  res := public.venue_session_expires_at(biz);
  perform pg_temp.t_ok(res = (v_today + time '20:00') at time zone v_tz, 'open now → today''s closing time', res::text);

  -- closes in less than an hour → 24 h fallback
  update public.businesses set hours = jsonb_set(all_days, array[k_today, 'close'], to_jsonb(to_char(v_local + interval '20 minutes', 'HH24:MI'))) where id = biz;
  perform pg_temp.t_ok(public.venue_session_expires_at(biz) = fb, 'closing in under one hour → now() + 24 h');

  -- today closed → 24 h
  update public.businesses set hours = jsonb_set(all_days, array[k_today], '{"closed":true}') where id = biz;
  perform pg_temp.t_ok(public.venue_session_expires_at(biz) = fb, 'today closed → now() + 24 h');

  -- today already closed hours ago (06:00–10:00): the next day's closing time
  update public.businesses set hours = jsonb_set(all_days, array[k_today], '{"open":"06:00","close":"10:00"}') where id = biz;
  res := public.venue_session_expires_at(biz);
  perform pg_temp.t_ok(res = ((v_today + 1) + time '20:00') at time zone v_tz, 'today already closed → tomorrow''s closing time', res::text);

  -- today already closed and tomorrow closed too → the day after
  update public.businesses set hours = jsonb_set(jsonb_set(all_days, array[k_today], '{"open":"06:00","close":"10:00"}'), array[k_tom], '{"closed":true}') where id = biz;
  res := public.venue_session_expires_at(biz);
  perform pg_temp.t_ok(res = ((v_today + 2) + time '20:00') at time zone v_tz, 'today over and tomorrow closed → the day after', res::text);

  -- overnight shift that opens this evening (18:00 → 03:00): ends tomorrow 03:00
  update public.businesses set hours = jsonb_set(all_days, array[k_today], '{"open":"18:00","close":"03:00"}') where id = biz;
  res := public.venue_session_expires_at(biz);
  perform pg_temp.t_ok(res = ((v_today + 1) + time '03:00') at time zone v_tz, 'overnight shift (close after midnight) → tomorrow''s 03:00', res::text);

  -- yesterday's overnight shift is still running (20:00 → 14:00 today): ends today 14:00
  update public.businesses set hours = jsonb_set(jsonb_set(all_days, array[k_yday], '{"open":"20:00","close":"14:00"}'), array[k_today], '{"closed":true}') where id = biz;
  res := public.venue_session_expires_at(biz);
  perform pg_temp.t_ok(res = (v_today + time '14:00') at time zone v_tz, 'yesterday''s overnight shift still open → today''s 14:00', res::text);

  -- malformed data never raises: it falls back to 24 h
  update public.businesses set hours = jsonb_set(all_days, array[k_today], '{"open":"xx","close":"yy"}') where id = biz;
  perform pg_temp.t_ok(public.venue_session_expires_at(biz) = fb, 'unparseable times → now() + 24 h');
  update public.businesses set hours = jsonb_set(all_days, array[k_today], '{"closed":"maybe","open":"08:00","close":"20:00"}') where id = biz;
  perform pg_temp.t_ok(public.venue_session_expires_at(biz) = fb, '"closed" that is not a boolean → now() + 24 h');
  update public.businesses set hours = all_days, timezone = 'Mars/Phobos' where id = biz;
  perform pg_temp.t_ok(public.venue_session_expires_at(biz) = fb, 'unknown time zone → now() + 24 h');
  update public.businesses set hours = all_days, timezone = '' where id = biz;
  perform pg_temp.t_ok(public.venue_session_expires_at(biz) is not null, 'empty time zone → falls back to America/New_York, no error');

  perform pg_temp.as_user(pg_temp.uid(1));
  perform pg_temp.t_raises($q$select public.venue_session_expires_at('10000000-0000-4000-8000-000000000001')$q$, 'permission denied', 'an authenticated user cannot call it directly');
  perform pg_temp.as_service();
end
$t$;
