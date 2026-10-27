-- JChat 3.0 — 245 BASELINE: the schema of production as of 2026-10-27 (last migration applied there: 244).
-- Source: `supabase db dump --linked` (schema only, no data, no roles, no secrets), reviewed before it entered the repo.
-- Scope: the `public` schema and its extensions. The `otunity` schema (Otunity Labs hub tables) is NOT included: nothing in `public` uses it.
-- What the dump does not carry (storage buckets/policies, pg_cron jobs, the auth.users trigger) is in 246_baseline_extras.sql.
--
-- ONLY FOR NEW DATABASES (local, Supabase branches). Production is never run against this file: it already has all of it, and its own
-- migration history is separate (dated versions applied through MCP). The 241 migrations that led here are in migrations_archive/.
--
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";


COMMENT ON SCHEMA "public" IS 'standard public schema';


CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";


CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";


CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";


CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";


CREATE OR REPLACE FUNCTION "public"."accept_follow_request"("p_requester" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.follow_requests where requester_id = p_requester and target_id = v_me) then
    raise exception 'no such follow request';
  end if;
  insert into public.follows (follower_id, following_id)
    values (p_requester, v_me) on conflict (follower_id, following_id) do nothing;
  delete from public.follow_requests where requester_id = p_requester and target_id = v_me;
end; $$;


ALTER FUNCTION "public"."accept_follow_request"("p_requester" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_hide_content"("p_content_type" "text", "p_content_id" "uuid", "p_report_id" "uuid" DEFAULT NULL::"uuid", "p_unhide" boolean DEFAULT false) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid := auth.uid(); v_at timestamptz := case when p_unhide then null else now() end; v_by uuid := case when p_unhide then null else auth.uid() end; n int;
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_content_type = 'post' then update public.posts set hidden_at = v_at, hidden_by = v_by where id = p_content_id;
  elsif p_content_type = 'comment' then update public.comments set hidden_at = v_at, hidden_by = v_by where id = p_content_id;
  elsif p_content_type = 'message' then update public.messages set hidden_at = v_at, hidden_by = v_by where id = p_content_id;
  elsif p_content_type = 'dm_message' then update public.dm_messages set hidden_at = v_at, hidden_by = v_by where id = p_content_id;
  else raise exception 'invalid_content_type' using errcode = '22023';
  end if;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.security_logs (actor_id, action, target_type, target_id, detail)
  values (v_uid, case when p_unhide then 'content_unhidden' else 'content_hidden' end, p_content_type, p_content_id,
          case when p_report_id is not null then 'report ' || p_report_id end);
end;
$$;


ALTER FUNCTION "public"."admin_hide_content"("p_content_type" "text", "p_content_id" "uuid", "p_report_id" "uuid", "p_unhide" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_list_match_photos_for_review"("p_limit" integer DEFAULT 50) RETURNS TABLE("id" "uuid", "user_id" "uuid", "path" "text", "moderation" "jsonb", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_platform_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  return query select p.id, p.user_id, p.path, p.moderation, p.created_at
  from public.match_photos p where p.status = 'pending' and p.needs_review
  order by p.created_at limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;


ALTER FUNCTION "public"."admin_list_match_photos_for_review"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_report_content_exists"("p_content_type" "text", "p_content_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."admin_report_content_exists"("p_content_type" "text", "p_content_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_resolve_report"("p_report_id" "uuid", "p_resolution" "text", "p_note" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid := auth.uid();
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_resolution not in ('dismissed','no_action','content_removed','user_suspended','escalated_ncmec') then
    raise exception 'invalid_resolution' using errcode = '22023';
  end if;
  update public.reports
     set status = case when p_resolution = 'dismissed' then 'dismissed' else 'resolved' end,
         resolution = p_resolution, admin_note = nullif(left(trim(coalesce(p_note, '')), 2000), ''),
         resolved_at = now(), resolved_by = v_uid
   where id = p_report_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.security_logs (actor_id, action, target_type, target_id, detail)
  values (v_uid, 'report_resolved', 'report', p_report_id, p_resolution);
end;
$$;


ALTER FUNCTION "public"."admin_resolve_report"("p_report_id" "uuid", "p_resolution" "text", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_review_match_photo"("p_photo_id" "uuid", "p_approve" boolean, "p_reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_platform_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  perform set_config('app.match_admin_review', 'on', true);
  update public.match_photos
  set status = case when p_approve then 'approved' else 'rejected' end,
      needs_review = false,
      rejection_reason = case when p_approve then null else coalesce(left(p_reason, 200), 'admin_rejected') end,
      reviewed_at = now()
  where id = p_photo_id;
end;
$$;


ALTER FUNCTION "public"."admin_review_match_photo"("p_photo_id" "uuid", "p_approve" boolean, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_set_business_status"("p_business_id" "uuid", "p_status" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;
  if p_status not in ('pending_verification','verified','rejected','active','suspended','closed') then
    raise exception 'invalid status: %', p_status;
  end if;

  if p_status = 'verified' then
    update public.businesses
      set status = p_status, verified_by = auth.uid(), verified_at = now()
      where id = p_business_id;
  else
    update public.businesses
      set status = p_status, verified_by = null, verified_at = null
      where id = p_business_id;
  end if;
end;
$$;


ALTER FUNCTION "public"."admin_set_business_status"("p_business_id" "uuid", "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_suspend_user"("p_user_id" "uuid", "p_days" integer DEFAULT NULL::integer, "p_reason" "text" DEFAULT NULL::"text", "p_report_id" "uuid" DEFAULT NULL::"uuid") RETURNS timestamp with time zone
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid := auth.uid(); v_until timestamptz;
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_user_id = v_uid then raise exception 'invalid_target' using errcode = '22023'; end if;
  if exists (select 1 from public.users where id = p_user_id and role = 'super_admin') then
    raise exception 'invalid_target' using errcode = '22023';
  end if;
  if p_days is not null and (p_days < 1 or p_days > 3650) then raise exception 'invalid_days' using errcode = '22023'; end if;
  v_until := case when p_days is null then now() + interval '100 years' else now() + make_interval(days => p_days) end;
  update public.users set suspended_until = v_until, suspended_reason = nullif(left(trim(coalesce(p_reason, '')), 500), '')
   where id = p_user_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update auth.users set banned_until = v_until where id = p_user_id;
  delete from auth.sessions where user_id = p_user_id;
  insert into public.security_logs (actor_id, action, target_type, target_id, detail)
  values (v_uid, 'user_suspended', 'user', p_user_id,
          coalesce(p_days::text || ' days', 'permanent') || coalesce(' · report ' || p_report_id, '') || coalesce(' · ' || left(p_reason, 200), ''));
  return v_until;
end;
$$;


ALTER FUNCTION "public"."admin_suspend_user"("p_user_id" "uuid", "p_days" integer, "p_reason" "text", "p_report_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_unsuspend_user"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid := auth.uid();
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.users set suspended_until = null, suspended_reason = null where id = p_user_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update auth.users set banned_until = null where id = p_user_id;
  insert into public.security_logs (actor_id, action, target_type, target_id, detail)
  values (v_uid, 'user_unsuspended', 'user', p_user_id, null);
end;
$$;


ALTER FUNCTION "public"."admin_unsuspend_user"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."affiliate_summary"() RETURNS TABLE("id" "uuid", "affiliate_number" "text", "name" "text", "email" "text", "phone" "text", "commission_pct" numeric, "status" "text", "payouts_held" boolean, "tax_form_type" "text", "tax_form_on_file" boolean, "created_at" timestamp with time zone, "referred_users" bigint, "waiting_cents" bigint, "ready_cents" bigint, "paid_cents" bigint, "reversed_cents" bigint, "last_payout_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_clawback integer;
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;
  select pc.affiliate_clawback_days into v_clawback
    from public.platform_config pc where pc.id = true;
  return query
  select a.id, a.affiliate_number, a.name, a.email, a.phone, a.commission_pct,
         a.status, a.payouts_held, a.tax_form_type, a.tax_form_on_file, a.created_at,
         (select count(*) from public.users u where u.referred_by_affiliate_id = a.id),
         coalesce(sum(c.commission_amount_cents) filter (where c.status='pending' and c.created_at >  now() - make_interval(days => v_clawback)),0),
         coalesce(sum(c.commission_amount_cents) filter (where c.status='pending' and c.created_at <= now() - make_interval(days => v_clawback)),0),
         coalesce(sum(c.commission_amount_cents) filter (where c.status='paid'),0),
         coalesce(sum(c.commission_amount_cents) filter (where c.status='reversed'),0),
         (select max(p.paid_at) from public.affiliate_payouts p where p.affiliate_id = a.id)
  from public.affiliates a
  left join public.affiliate_commissions c on c.affiliate_id = a.id
  group by a.id;
end;
$$;


ALTER FUNCTION "public"."affiliate_summary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."affiliate_yearly_payouts"("p_year" integer) RETURNS TABLE("affiliate_id" "uuid", "affiliate_number" "text", "name" "text", "tax_form_type" "text", "tax_form_on_file" boolean, "total_paid_cents" bigint, "payout_count" bigint, "currency" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;
  return query
  select a.id, a.affiliate_number, a.name, a.tax_form_type, a.tax_form_on_file,
         coalesce(sum(p.amount_cents),0)::bigint,
         count(p.id)::bigint,
         coalesce(min(p.currency),'usd')
  from public.affiliates a
  left join public.affiliate_payouts p
    on p.affiliate_id = a.id and extract(year from p.paid_at) = p_year
  group by a.id
  having count(p.id) > 0;
end;
$$;


ALTER FUNCTION "public"."affiliate_yearly_payouts"("p_year" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assert_venue_order_allowed"("p_business_id" "uuid", "p_user_id" "uuid", "p_order_type" "text", "p_lat" double precision, "p_lng" double precision, "p_source" "text", "p_taken_by" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_inside boolean; v_pickup boolean;
begin
  -- Pedidos tomados por el personal (POS) no pasan por la regla
  if p_taken_by is not null or coalesce(p_source,'') like 'pos%' then return; end if;
  if p_user_id is not null and public.is_venue_staff(p_business_id, p_user_id) then return; end if;
  v_inside := (p_user_id is not null and public.venue_presence_ok(p_business_id, p_user_id)) or public.venue_inside(p_business_id, p_lat, p_lng);
  if v_inside then return; end if;
  if coalesce(p_order_type,'counter') = 'counter' then
    select pickup_enabled into v_pickup from public.businesses where id = p_business_id;
    if coalesce(v_pickup,false) then return; end if;
    raise exception 'pickup_disabled' using errcode = '42501';
  end if;
  raise exception 'outside_venue' using errcode = '42501';
end;
$$;


ALTER FUNCTION "public"."assert_venue_order_allowed"("p_business_id" "uuid", "p_user_id" "uuid", "p_order_type" "text", "p_lat" double precision, "p_lng" double precision, "p_source" "text", "p_taken_by" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_affiliate_to_user"("p_user_id" "uuid", "p_affiliate_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_role text := coalesce(auth.role(), '');
  v_uid uuid := auth.uid();
begin
  -- Llamadas del servidor (Edge Functions con service_role) o conexión directa a la base: permitidas
  if v_role = 'service_role' or v_role = '' then
    update public.users set referred_by_affiliate_id = p_affiliate_id where id = p_user_id;
    return;
  end if;

  -- Usuario con sesión: solo sobre sí mismo, solo la primera vez, y solo con un afiliado existente
  if v_uid is null or v_uid <> p_user_id then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.affiliates a where a.id = p_affiliate_id) then
    raise exception 'affiliate_not_found' using errcode = 'P0002';
  end if;

  update public.users
  set referred_by_affiliate_id = p_affiliate_id
  where id = v_uid and referred_by_affiliate_id is null;
end;
$$;


ALTER FUNCTION "public"."assign_affiliate_to_user"("p_user_id" "uuid", "p_affiliate_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."attach_order_to_tab"("p_order_id" "uuid", "p_tab_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_table uuid;
  v_biz_tab uuid;
  v_biz_ord uuid;
begin
  if p_tab_id is null then
    select t.table_id, t.business_id into v_table, v_biz_tab
    from public.table_tabs t
    join public.orders o on o.tab_id = t.id
    where o.id = p_order_id;
    if v_table is null then raise exception 'ORDER_NOT_ATTACHED'; end if;
  else
    select t.table_id, t.business_id into v_table, v_biz_tab
    from public.table_tabs t where t.id = p_tab_id;
    if v_table is null then raise exception 'TAB_NOT_FOUND'; end if;
  end if;

  if not (public.is_waiter_of_table(v_table)
          or public.owns_business_of_table(v_table)
          or public.is_platform_admin()) then
    raise exception 'NOT_ALLOWED';
  end if;

  select o.business_id into v_biz_ord from public.orders o where o.id = p_order_id;
  if v_biz_ord is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_biz_ord <> v_biz_tab then raise exception 'CROSS_BUSINESS'; end if;

  update public.orders set tab_id = p_tab_id where id = p_order_id;
end $$;


ALTER FUNCTION "public"."attach_order_to_tab"("p_order_id" "uuid", "p_tab_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_uncombine_on_tab_close"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.paid_at is not null and old.paid_at is null and new.table_id is not null then
    if not exists (
      select 1 from public.orders o
      where o.table_id = new.table_id and o.paid_at is null and o.canceled_at is null
    ) then
      -- liberar mesas anexadas
      update public.tables set combined_into = null where combined_into = new.table_id;
      -- limpiar personas de la mesa que pagó → vuelve a libre
      update public.tables set party_size = null where id = new.table_id;
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."auto_uncombine_on_tab_close"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."block_user"("p_target" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if v_me = p_target then raise exception 'cannot block yourself'; end if;
  insert into public.blocks (blocker_id, blocked_id)
    values (v_me, p_target) on conflict (blocker_id, blocked_id) do nothing;
  delete from public.follows
    where (follower_id = v_me and following_id = p_target)
       or (follower_id = p_target and following_id = v_me);
  delete from public.follow_requests
    where (requester_id = v_me and target_id = p_target)
       or (requester_id = p_target and target_id = v_me);
end; $$;


ALTER FUNCTION "public"."block_user"("p_target" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_room"("_room_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1 from public.rooms r where r.id = _room_id and (
      exists (select 1 from public.businesses b where b.id = r.business_id and b.owner_id = auth.uid())
      or (
        not public.is_banned_from_room(_room_id, auth.uid())
        and exists (
          select 1 from public.room_geo_presence g
          where g.room_id = _room_id and g.user_id = auth.uid() and g.expires_at > now()
        )
        and (
          r.is_password_protected = false
          or exists (
            select 1 from public.room_members m
            where m.room_id = _room_id and m.user_id = auth.uid() and m.expires_at > now()
          )
        )
      )
    )
  );
$$;


ALTER FUNCTION "public"."can_access_room"("_room_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_employee_see_table"("p_table_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1 from public.tables t
    where t.id = p_table_id
      and public.is_employee_of_business(t.business_id)
      and (
        public.is_waiter_of_table(t.id)
        or not exists (select 1 from public.table_waiters tw where tw.table_id = t.id)
      )
  );
$$;


ALTER FUNCTION "public"."can_employee_see_table"("p_table_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_publish_business_post"("p_business_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.businesses b
    where b.id = p_business_id
      and b.owner_id = (select auth.uid())
  );
$$;


ALTER FUNCTION "public"."can_publish_business_post"("p_business_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_profile"("viewer" "uuid", "target" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select case
    when public.is_blocked(viewer, target) then false
    when viewer = target then true
    when not coalesce((select is_private from public.users where id = target), false) then true
    else exists (select 1 from public.follows where follower_id = viewer and following_id = target)
  end;
$$;


ALTER FUNCTION "public"."can_view_profile"("viewer" "uuid", "target" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_user_content"("viewer" "uuid", "owner" "uuid", "dimension" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select case
    when public.is_blocked(viewer, owner) then false
    when viewer = owner then true
    else case coalesce((select privacy_settings->>dimension from public.users where id = owner), 'everyone')
      when 'everyone'  then true
      when 'followers' then exists (select 1 from public.follows where follower_id = viewer and following_id = owner)
      when 'nobody'    then false
      else true
    end
  end;
$$;


ALTER FUNCTION "public"."can_view_user_content"("viewer" "uuid", "owner" "uuid", "dimension" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."catalog_lookup"("p_barcode" "text") RETURNS TABLE("barcode" "text", "brand" "text", "name" "text", "size_value" numeric, "size_unit" "text", "packaging" "text", "category" "text", "subcategory" "text", "image_url" "text")
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public'
    AS $$
declare
  v_digits text := regexp_replace(coalesce(p_barcode, ''), '\D', '', 'g');
  v_candidates text[];
begin
  if length(v_digits) < 6 then
    return; -- demasiado corto → sin match
  end if;

  v_candidates := array[v_digits];
  if length(v_digits) = 12 then
    v_candidates := v_candidates || ('0' || v_digits);      -- UPC-A → EAN-13
  end if;
  if length(v_digits) = 13 and left(v_digits, 1) = '0' then
    v_candidates := v_candidates || substr(v_digits, 2);    -- EAN-13(0-pad) → UPC-A
  end if;

  return query
  select pc.barcode, pc.brand, pc.name, pc.size_value, pc.size_unit,
         pc.packaging, pc.category, pc.subcategory, pc.image_url
  from product_catalog pc
  where pc.is_active and pc.barcode = any(v_candidates)
  order by pc.verified desc nulls last
  limit 1;
end
$$;


ALTER FUNCTION "public"."catalog_lookup"("p_barcode" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_geofence_and_join_room"("_room_id" "uuid", "_lat" double precision, "_lng" double precision) RETURNS TABLE("access_granted" boolean, "is_owner" boolean, "distance_m" double precision, "reason" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  _uid uuid;
  _business_id uuid;
  _owner_id uuid;
  _biz_lat float8;
  _biz_lng float8;
  _radius_m float8;
  _dlat float8;
  _dlng float8;
  _a float8;
  _dist float8;
begin
  _uid := auth.uid();

  if _uid is null then
    return query select false, false, null::float8, 'auth_required';
    return;
  end if;

  select r.business_id into _business_id
  from public.rooms r
  where r.id = _room_id and r.is_active = true;

  if _business_id is null then
    return query select false, false, null::float8, 'invalid_room';
    return;
  end if;

  select b.owner_id, b.lat, b.lng, b.geofence_radius_m
  into _owner_id, _biz_lat, _biz_lng, _radius_m
  from public.businesses b
  where b.id = _business_id;

  -- Única excepción de la regla de oro: el dueño de ESE negocio, sin chequeo de distancia.
  if _owner_id = _uid then
    return query select true, true, null::float8, 'owner';
    return;
  end if;

  -- Sin geocerca válida configurada → default restrictivo, NO acceso.
  if _biz_lat is null or _biz_lng is null or _radius_m is null then
    return query select false, false, null::float8, 'no_geofence';
    return;
  end if;

  _dlat := radians(_biz_lat - _lat);
  _dlng := radians(_biz_lng - _lng);
  _a := power(sin(_dlat / 2), 2)
      + cos(radians(_lat)) * cos(radians(_biz_lat)) * power(sin(_dlng / 2), 2);
  _dist := 6371000 * 2 * atan2(sqrt(_a), sqrt(1 - _a));

  if _dist <= _radius_m then
    insert into public.room_geo_presence (room_id, user_id, expires_at, last_seen_at)
    values (_room_id, _uid, now() + interval '10 minutes', now())
    on conflict (room_id, user_id)
    do update set expires_at = excluded.expires_at, last_seen_at = excluded.last_seen_at;

    return query select true, false, _dist, 'inside_radius';
    return;
  else
    -- Fuera del radio: revoca cualquier geo-presencia previa, no solo "no crear una nueva".
    delete from public.room_geo_presence
    where room_id = _room_id and user_id = _uid;

    return query select false, false, _dist, 'outside_radius';
    return;
  end if;
end;
$$;


ALTER FUNCTION "public"."check_geofence_and_join_room"("_room_id" "uuid", "_lat" double precision, "_lng" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_in"("p_business_id" "uuid") RETURNS TABLE("ok" boolean, "reason" "text", "check_in_id" "uuid", "visit_count" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_active boolean;
  v_id uuid;
  v_count integer;
begin
  if v_uid is null then
    return query select false, 'auth_required', null::uuid, null::integer; return;
  end if;
  select b.owner_id, b.is_active into v_owner, v_active from public.businesses b where b.id = p_business_id;
  if v_owner is null then
    return query select false, 'invalid_business', null::uuid, null::integer; return;
  end if;
  if not coalesce(v_active, false) then
    return query select false, 'business_inactive', null::uuid, null::integer; return;
  end if;
  if v_owner = v_uid then
    return query select false, 'owner', null::uuid, null::integer; return;
  end if;
  -- Golden rule: physically at the venue, proven by the server (no client coordinates are trusted here).
  if not public.venue_presence_ok(p_business_id, v_uid) then
    return query select false, 'not_present', null::uuid, null::integer; return;
  end if;
  -- One check-in per venue per 24 h, serialised per (user, venue) so two taps cannot both pass.
  perform pg_advisory_xact_lock(hashtext('check_in:' || v_uid::text || ':' || p_business_id::text));
  select count(*)::integer into v_count from public.check_ins c where c.user_id = v_uid and c.business_id = p_business_id;
  if exists (
    select 1 from public.check_ins c
    where c.user_id = v_uid and c.business_id = p_business_id and c.created_at > now() - interval '24 hours'
  ) then
    return query select false, 'already_checked_in_24h', null::uuid, v_count; return;
  end if;
  insert into public.check_ins (user_id, business_id) values (v_uid, p_business_id) returning id into v_id;
  return query select true, 'checked_in', v_id, v_count + 1;
end;
$$;


ALTER FUNCTION "public"."check_in"("p_business_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_embedded_order"("p_order_id" "uuid", "p_tracking_code" "text", "p_room_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("order_id" "uuid", "order_number" integer, "status" "text", "business_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_row public.orders%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_tracking_code is null or length(p_tracking_code) < 16 then
    raise exception 'invalid_claim' using errcode = '22023';
  end if;

  update public.orders o
     set user_id = v_uid,
         room_id = coalesce(o.room_id, (select r.id from public.rooms r where r.id = p_room_id and r.business_id = o.business_id))
   where o.guest_tracking_code = p_tracking_code
     and (p_order_id is null or o.id = p_order_id)
     and o.user_id is null
     and o.created_at > now() - interval '30 minutes'
  returning o.* into v_row;

  if v_row.id is null then
    raise exception 'claim_not_allowed' using errcode = '42501';
  end if;

  insert into public.notifications (user_id, type, payload)
  values (v_uid, 'order_status', jsonb_build_object(
    'order_id', v_row.id, 'order_number', v_row.order_number, 'business_id', v_row.business_id,
    'business_name', (select b.name from public.businesses b where b.id = v_row.business_id),
    'status', v_row.status, 'order_type', v_row.order_type, 'table_label', v_row.table_label));

  return query select v_row.id, v_row.order_number::integer, v_row.status, v_row.business_id;
end;
$$;


ALTER FUNCTION "public"."claim_embedded_order"("p_order_id" "uuid", "p_tracking_code" "text", "p_room_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_anonymous_users"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_deleted int;
begin
  with victims as (
    select u.id
    from auth.users u
    where u.is_anonymous = true
      and coalesce(u.last_sign_in_at, u.created_at) < now() - interval '24 hours'
      and not exists (
        select 1 from public.table_tabs t
        where t.owner_uid = u.id and t.status = 'open'
      )
  )
  delete from auth.users u using victims v where u.id = v.id;
  get diagnostics v_deleted = row_count;
  raise log '[cleanup_anonymous_users] deleted % stale anonymous users', v_deleted;
  return v_deleted;
end $$;


ALTER FUNCTION "public"."cleanup_anonymous_users"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_age"("p_birth_date" "date", "p_terms_version" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_birth_date is null or p_birth_date > current_date or p_birth_date < date '1900-01-01' then
    raise exception 'invalid_birth_date' using errcode = '22023';
  end if;
  if p_birth_date > (current_date - interval '18 years')::date then
    return jsonb_build_object('ok', false, 'reason', 'underage');
  end if;

  update public.users
  set birth_year = extract(year from p_birth_date)::smallint,
      age_confirmed_at = now(),
      terms_accepted_at = now(),
      terms_version = coalesce(nullif(trim(p_terms_version), ''), 'unversioned')
  where id = v_uid;

  return jsonb_build_object('ok', true);
end;
$$;


ALTER FUNCTION "public"."confirm_age"("p_birth_date" "date", "p_terms_version" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_paid_order"("p_order" "jsonb", "p_items" "jsonb") RETURNS TABLE("id" "uuid", "order_number" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_id uuid; v_number bigint;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'order_without_items' using errcode = '22023';
  end if;
  insert into public.orders (business_id, user_id, room_id, status, order_type, gift_recipient_id, subtotal_cents, tax_cents, tip_cents, discount_cents,
    total_cents, promo_code, special_instructions, table_label, table_id, taken_by, contact_email, contact_phone, contact_name, stripe_pi_id, source,
    status_updated_at, paid_at, guest_device_id, guest_tracking_code)
  values ((p_order->>'business_id')::uuid, nullif(p_order->>'user_id','')::uuid, nullif(p_order->>'room_id','')::uuid, coalesce(p_order->>'status','confirmed'),
    coalesce(p_order->>'order_type','counter'), nullif(p_order->>'gift_recipient_id','')::uuid, coalesce((p_order->>'subtotal_cents')::integer,0),
    coalesce((p_order->>'tax_cents')::integer,0), coalesce((p_order->>'tip_cents')::integer,0), coalesce((p_order->>'discount_cents')::integer,0),
    coalesce((p_order->>'total_cents')::integer,0), p_order->>'promo_code', p_order->>'special_instructions', p_order->>'table_label',
    nullif(p_order->>'table_id','')::uuid, nullif(p_order->>'taken_by','')::uuid, p_order->>'contact_email', p_order->>'contact_phone', p_order->>'contact_name',
    p_order->>'stripe_pi_id', coalesce(p_order->>'source','customer_stripe'), now(), coalesce((p_order->>'paid_at')::timestamptz, now()), p_order->>'guest_device_id',
    nullif(p_order->>'guest_tracking_code',''))
  returning orders.id, orders.order_number into v_id, v_number;
  insert into public.order_items (order_id, menu_item_id, qty, price_cents, options, special_instructions, item_status)
  select v_id, (i->>'menu_item_id')::uuid, greatest(coalesce((i->>'qty')::integer,1),1), coalesce((i->>'price_cents')::integer,0),
         coalesce(i->'options','{}'::jsonb), i->>'special_instructions', 'pending'
  from jsonb_array_elements(p_items) i;
  return query select v_id, v_number;
end;
$$;


ALTER FUNCTION "public"."create_paid_order"("p_order" "jsonb", "p_items" "jsonb") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."promo_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "plan" "text" NOT NULL,
    "trial_days" integer NOT NULL,
    "expires_at" timestamp with time zone,
    "active" boolean DEFAULT true NOT NULL,
    "redeemed_by" "uuid",
    "redeemed_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "promo_codes_plan_check" CHECK (("plan" = ANY (ARRAY['business'::"text", 'pro'::"text"]))),
    CONSTRAINT "promo_codes_trial_days_check" CHECK (("trial_days" > 0))
);


ALTER TABLE "public"."promo_codes" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_promo_code"("p_plan" "text", "p_trial_days" integer, "p_expires_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "public"."promo_codes"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text; v_i int; v_attempts int := 0; v_row public.promo_codes;
begin
  if not public.is_platform_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if p_plan not in ('business','pro') then
    raise exception 'INVALID_PLAN' using errcode = 'P0001';
  end if;
  if p_trial_days is null or p_trial_days <= 0 then
    raise exception 'INVALID_TRIAL_DAYS' using errcode = 'P0001';
  end if;

  loop
    v_attempts := v_attempts + 1;
    v_code := '';
    for v_i in 1..12 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random()*length(v_alphabet))::int, 1);
    end loop;
    begin
      insert into public.promo_codes (code, plan, trial_days, expires_at, created_by)
      values (v_code, p_plan, p_trial_days, p_expires_at, auth.uid())
      returning * into v_row;
      return v_row;
    exception when unique_violation then
      if v_attempts >= 10 then raise; end if;
    end;
  end loop;
end;
$$;


ALTER FUNCTION "public"."create_promo_code"("p_plan" "text", "p_trial_days" integer, "p_expires_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_reservation"("p_business_id" "uuid", "p_reserved_at" timestamp with time zone, "p_party_size" integer, "p_table_ids" "uuid"[], "p_event_type" "text" DEFAULT NULL::"text", "p_phone" "text" DEFAULT NULL::"text", "p_first_name" "text" DEFAULT NULL::"text", "p_last_name" "text" DEFAULT NULL::"text", "p_special_requests" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_customer_id uuid;
  v_reservation_id uuid;
  v_table_id uuid;
  v_note text;
  v_has_tables boolean := (p_table_ids is not null and array_length(p_table_ids, 1) is not null);
begin
  -- Permiso: dueño del negocio o admin.
  if not (
    exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = auth.uid())
    or public.is_platform_admin()
  ) then
    raise exception 'NOT_ALLOWED';
  end if;

  if p_party_size is null or p_party_size < 1 then raise exception 'BAD_PARTY_SIZE'; end if;
  if p_first_name is null or trim(p_first_name) = '' then raise exception 'NO_CUSTOMER_NAME'; end if;
  -- MESA AHORA OPCIONAL: ya NO se exige p_table_ids.

  -- Si vienen mesas, todas deben pertenecer al negocio.
  if v_has_tables and exists (
    select 1 from unnest(p_table_ids) tid
    where not exists (select 1 from public.tables t where t.id = tid and t.business_id = p_business_id)
  ) then
    raise exception 'TABLE_NOT_IN_BUSINESS';
  end if;

  -- Cliente: reusa por teléfono (si viene) o crea nuevo.
  if p_phone is not null and trim(p_phone) <> '' then
    select id into v_customer_id
    from public.reservation_customers
    where business_id = p_business_id and phone = trim(p_phone)
    limit 1;
  end if;

  if v_customer_id is null then
    insert into public.reservation_customers (business_id, phone, first_name, last_name)
    values (p_business_id, nullif(trim(coalesce(p_phone,'')),''), trim(p_first_name), nullif(trim(coalesce(p_last_name,'')),''))
    returning id into v_customer_id;
  end if;

  -- La reserva. user_id null (cliente por teléfono, sin cuenta). status 'pending'.
  insert into public.reservations
    (business_id, user_id, customer_id, reserved_at, party_size, event_type, special_requests, status)
  values
    (p_business_id, null, v_customer_id, p_reserved_at, p_party_size, nullif(trim(coalesce(p_event_type,'')),''), nullif(trim(coalesce(p_special_requests,'')),''), 'pending')
  returning id into v_reservation_id;

  -- Solo si hay mesas: vincular + marcar reservadas (reusa RPC de F8).
  if v_has_tables then
    v_note := trim(p_first_name) || coalesce(' ' || nullif(trim(coalesce(p_last_name,'')),''), '') || ' · ' || p_party_size::text || 'p';
    foreach v_table_id in array p_table_ids loop
      insert into public.reservation_tables (reservation_id, table_id)
      values (v_reservation_id, v_table_id)
      on conflict do nothing;
      perform public.set_table_reserved(v_table_id, true, v_note, p_reserved_at);
    end loop;
  end if;

  return v_reservation_id;
end $$;


ALTER FUNCTION "public"."create_reservation"("p_business_id" "uuid", "p_reserved_at" timestamp with time zone, "p_party_size" integer, "p_table_ids" "uuid"[], "p_event_type" "text", "p_phone" "text", "p_first_name" "text", "p_last_name" "text", "p_special_requests" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."derive_username"("_email" "text", "_meta" "jsonb") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "public"."derive_username"("_email" "text", "_meta" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dm_first_message_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_conv public.dm_conversations%rowtype;
begin
  select * into v_conv from public.dm_conversations where id = new.conversation_id for update;
  if v_conv.ephemeral_business_id is null then return new; end if;
  if v_conv.first_sender_id is null then
    update public.dm_conversations set first_sender_id = new.sender_id, awaiting_reply = true where id = v_conv.id;
  elsif v_conv.awaiting_reply and new.sender_id = v_conv.first_sender_id then
    raise exception 'awaiting_reply' using errcode = '23514';
  elsif v_conv.awaiting_reply and new.sender_id <> v_conv.first_sender_id then
    update public.dm_conversations set awaiting_reply = false where id = v_conv.id;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."dm_first_message_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dm_media_is_blocked"("p_name" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.dm_messages d
     where d.media_url = p_name
       and (d.media_moderation = 'rejected' or d.hidden_at is not null)
  );
$$;


ALTER FUNCTION "public"."dm_media_is_blocked"("p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dm_messages_media_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is not null
     and (new.media_moderation is distinct from old.media_moderation
          or new.media_moderated_at is distinct from old.media_moderated_at
          or new.media_moderation_scores is distinct from old.media_moderation_scores
          or new.media_url is distinct from old.media_url) then
    raise exception 'dm_media_fields_readonly' using errcode = '42501';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."dm_messages_media_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dm_messages_media_init"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.media_moderation := case when new.media_url is not null then 'pending' else null end;
  new.media_moderated_at := null;
  return new;
end;
$$;


ALTER FUNCTION "public"."dm_messages_media_init"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dm_photo_dispatch_moderation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret' limit 1;
  if v_secret is null then return new; end if;
  perform net.http_post(
    url := 'https://klfsgcfoahdtkojyqspd.supabase.co/functions/v1/moderate-dm-photo',
    body := jsonb_build_object('message_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 20000);
  return new;
exception when others then
  raise warning 'dm_photo_dispatch_moderation failed: %', sqlerrm;
  return new;
end;
$$;


ALTER FUNCTION "public"."dm_photo_dispatch_moderation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dm_photo_retry_moderation"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare r record; n int := 0; v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret' limit 1;
  if v_secret is null then return 0; end if;
  for r in select id from public.dm_messages
           where media_moderation = 'pending' and created_at < now() - interval '5 minutes' and created_at > now() - interval '2 days'
           limit 50 loop
    perform net.http_post(
      url := 'https://klfsgcfoahdtkojyqspd.supabase.co/functions/v1/moderate-dm-photo',
      body := jsonb_build_object('message_id', r.id),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
      timeout_milliseconds := 20000);
    n := n + 1;
  end loop;
  return n;
end;
$$;


ALTER FUNCTION "public"."dm_photo_retry_moderation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dm_photo_set_verdict"("p_message_id" "uuid", "p_status" "text", "p_scores" "jsonb" DEFAULT NULL::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_sender uuid; v_conv uuid; v_created timestamptz;
begin
  if p_status not in ('clear', 'blurred', 'rejected') then raise exception 'invalid_status' using errcode = '22023'; end if;
  update public.dm_messages
     set media_moderation = p_status, media_moderated_at = now(), media_moderation_scores = p_scores
   where id = p_message_id and media_moderation = 'pending'
   returning sender_id, conversation_id, created_at into v_sender, v_conv, v_created;
  if not found then return; end if;

  if p_status = 'rejected' then
    insert into public.reports (reporter_id, reported_user_id, content_type, content_id, reason, details, snapshot, priority, status)
    values (null, v_sender, 'dm_message', p_message_id, 'sexual_content',
            'Automatic report: explicit photo detected in a direct message.',
            jsonb_build_object('conversation_id', v_conv, 'created_at', v_created,
                               'media', 'dm-media (private bucket; no public URL is stored here)', 'scores', p_scores),
            'urgent', 'pending');
    insert into public.security_logs (actor_id, action, target_type, target_id, detail)
    values (null, 'dm_photo_rejected', 'dm_message', p_message_id, 'SafeSearch: explicit adult content');
  end if;
end;
$$;


ALTER FUNCTION "public"."dm_photo_set_verdict"("p_message_id" "uuid", "p_status" "text", "p_scores" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."effective_tax_rate"("p_business_id" "uuid") RETURNS TABLE("rate" numeric, "source" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    coalesce(b.tax_rate, t.rate, 0)::numeric as rate,
    case when b.tax_rate is not null then 'business'
         when t.rate is not null then 'state'
         else 'none' end as source
  from public.businesses b
  left join public.us_sales_tax_rates t on t.state = upper(nullif(trim(b.state), ''))
  where b.id = p_business_id;
$$;


ALTER FUNCTION "public"."effective_tax_rate"("p_business_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_business_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_plan  text;
  v_role  text;
  v_limit int;
  v_count int;
begin
  if new.owner_id is null then
    return new;
  end if;

  select plan, role into v_plan, v_role
  from public.users
  where id = new.owner_id;

  -- super_admin bypasses limits entirely.
  if v_role = 'super_admin' then
    return new;
  end if;

  v_limit := case coalesce(v_plan, 'regular')
    when 'pro' then 10
    when 'business' then 1
    else 0
  end;

  -- COMBINED count: businesses AND events together (NO is_temporary filter).
  select count(*) into v_count
  from public.businesses
  where owner_id = new.owner_id;

  if v_count >= v_limit then
    raise exception
      'PLAN_LIMIT_COMBINED: plan % allows % business(es)+event(s) total, already have %',
      coalesce(v_plan,'regular'), v_limit, v_count
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_business_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_business_radius_cap"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  cap       integer;
  has_grant boolean;
begin
  select coalesce(business_radius_max_m, 50)
    into cap
    from public.platform_config
   where id = true;

  cap := coalesce(cap, 50);

  if new.geofence_radius_m is null or new.geofence_radius_m <= cap then
    return new;
  end if;

  if public.is_platform_admin() then
    return new;
  end if;

  select exists (
    select 1
      from public.radius_increase_requests r
     where r.business_id = new.id
       and r.status = 'approved'
       and r.requested_radius_m >= new.geofence_radius_m
  ) into has_grant;

  if has_grant then
    return new;
  end if;

  raise exception
    'geofence_radius_m % exceeds the % m cap without an approved radius increase request',
    new.geofence_radius_m, cap
    using errcode = 'check_violation';
end;
$$;


ALTER FUNCTION "public"."enforce_business_radius_cap"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_employee_plan_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_owner_plan   text;
  v_limit        int;
  v_current      int;
begin
  if is_platform_admin() then
    return new;
  end if;

  select u.plan
    into v_owner_plan
    from businesses b
    join users u on u.id = b.owner_id
   where b.id = new.business_id;

  v_limit := case v_owner_plan
               when 'pro'      then 50
               when 'business' then 10
               else 0
             end;

  select count(*) into v_current
    from employees
   where business_id = new.business_id;

  if v_current >= v_limit then
    raise exception
      'Employee limit reached for this plan (% of % used). Upgrade the plan to add more employees.',
      v_current, v_limit
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_employee_plan_limit"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."enforce_employee_plan_limit"() IS 'D-42: server-side enforcement of the per-plan employee limit (business=10, pro=50). Fires on every INSERT path, service_role included; platform admins exempt.';


CREATE OR REPLACE FUNCTION "public"."enforce_service_call_cooldown"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.type = 'order' then return new; end if;
  if exists (select 1 from public.service_calls sc where sc.user_id = new.user_id and sc.room_id = new.room_id and sc.type <> 'order'
             and sc.created_at > now() - interval '5 minutes') then
    raise exception 'service_call_cooldown' using hint = 'Ya llamaste hace poco, espera unos minutos antes de volver a llamar.';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_service_call_cooldown"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_service_call_golden_rule"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.type = 'order' then
    if coalesce(current_setting('app.order_notify', true), '') <> 'on' then
      raise exception 'order_notice_via_rpc_only' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.user_id is not null and not public.venue_presence_ok(new.business_id, new.user_id) and not public.is_venue_staff(new.business_id, new.user_id) then
    raise exception 'outside_venue' using errcode = '42501';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_service_call_golden_rule"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gen_short_code"("p_len" integer DEFAULT 4) RETURNS "text"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$
  select string_agg(substr('23456789abcdefghjkmnpqrstuvwxyz', 1 + floor(random()*31)::int, 1), '') from generate_series(1, p_len);
$$;


ALTER FUNCTION "public"."gen_short_code"("p_len" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_room_qr_token"("_business_id" "uuid", "_is_sub_room" boolean) RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  _raw_slug  text;
  _slug      text;
  _room_type text;
  _token     text;
begin
  select lower(regexp_replace(b.name, '[^a-zA-Z0-9]+', '-', 'g'))
  into _raw_slug
  from public.businesses b where b.id = _business_id;

  _slug      := coalesce(
                  nullif(trim(both '-' from left(coalesce(_raw_slug, ''), 16)), ''),
                  'room'
                );
  _room_type := case when _is_sub_room then 'sub' else 'main' end;

  loop
    _token := _slug || '-' || _room_type || '-'
              || left(replace(gen_random_uuid()::text, '-', ''), 8);
    exit when not exists (
      select 1 from public.rooms where qr_token = _token
    );
  end loop;

  return _token;
end;
$$;


ALTER FUNCTION "public"."generate_room_qr_token"("_business_id" "uuid", "_is_sub_room" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_tab_pay_token"("_business_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  _raw_slug text;
  _slug     text;
  _token    text;
begin
  select lower(regexp_replace(b.name, '[^a-zA-Z0-9]+', '-', 'g'))
  into _raw_slug from public.businesses b where b.id = _business_id;
  _slug := coalesce(nullif(trim(both '-' from left(coalesce(_raw_slug, ''), 16)), ''), 'tab');
  loop
    _token := _slug || '-pay-' || left(replace(gen_random_uuid()::text, '-', ''), 20);
    exit when not exists (select 1 from public.tab_payments where pay_token = _token);
  end loop;
  return _token;
end $$;


ALTER FUNCTION "public"."generate_tab_pay_token"("_business_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_table_access_code"("_business_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_code text; v_tries int := 0;
begin
  loop
    v_code := lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
    exit when not exists (select 1 from public.tables t where t.business_id = _business_id and t.access_code = v_code);
    v_tries := v_tries + 1;
    if v_tries > 50 then raise exception 'ACCESS_CODE_EXHAUSTED'; end if;
  end loop;
  return v_code;
end; $$;


ALTER FUNCTION "public"."generate_table_access_code"("_business_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_table_qr_token"("_business_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  _raw_slug text;
  _slug     text;
  _token    text;
begin
  select lower(regexp_replace(b.name, '[^a-zA-Z0-9]+', '-', 'g'))
  into _raw_slug from public.businesses b where b.id = _business_id;
  _slug := coalesce(nullif(trim(both '-' from left(coalesce(_raw_slug, ''), 16)), ''), 'table');
  loop
    _token := _slug || '-table-' || left(replace(gen_random_uuid()::text, '-', ''), 8);
    exit when not exists (select 1 from public.tables where qr_token = _token);
  end loop;
  return _token;
end $$;


ALTER FUNCTION "public"."generate_table_qr_token"("_business_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."geo_distance_m"("lat1" double precision, "lng1" double precision, "lat2" double precision, "lng2" double precision) RETURNS double precision
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  select 6371000 * 2 * atan2(
    sqrt(power(sin(radians(lat2 - lat1) / 2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)),
    sqrt(1 - (power(sin(radians(lat2 - lat1) / 2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
  );
$$;


ALTER FUNCTION "public"."geo_distance_m"("lat1" double precision, "lng1" double precision, "lat2" double precision, "lng2" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_receipt"("p_code" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_pay         record;
  v_biz         record;
  v_items       jsonb;
  v_table_label text;
  v_subtotal    bigint;
  v_tax         bigint;
  v_server_name text;
begin
  select id, business_id, table_id, amount_cents, tip_cents, kind, seat,
         order_item_ids, status, created_at, card_brand, card_last4, paid_by,
         payment_method
    into v_pay
  from pos_payments
  where receipt_code = p_code and status = 'succeeded'
  limit 1;

  if v_pay.id is null then
    return null;
  end if;

  select name, logo_url, address, city, state, phone, slug,
         receipt_brand_color, receipt_template_id
    into v_biz
  from businesses where id = v_pay.business_id;

  select table_label into v_table_label
  from orders
  where table_id = v_pay.table_id and business_id = v_pay.business_id
  order by paid_at desc nulls last, created_at desc
  limit 1;

  if v_pay.order_item_ids is not null and array_length(v_pay.order_item_ids, 1) > 0 then
    select jsonb_agg(jsonb_build_object(
             'name', mi.name, 'qty', oi.qty, 'price_cents', oi.price_cents,
             'options', oi.options, 'special_instructions', oi.special_instructions
           ) order by oi.created_at)
      into v_items
    from order_items oi
    join menu_items mi on mi.id = oi.menu_item_id
    where oi.id = any(v_pay.order_item_ids);
  elsif v_pay.kind = 'full' then
    select jsonb_agg(jsonb_build_object(
             'name', mi.name, 'qty', oi.qty, 'price_cents', oi.price_cents,
             'options', oi.options, 'special_instructions', oi.special_instructions
           ) order by oi.created_at)
      into v_items
    from order_items oi
    join menu_items mi on mi.id = oi.menu_item_id
    join orders o on o.id = oi.order_id
    where o.table_id = v_pay.table_id
      and o.business_id = v_pay.business_id
      and o.canceled_at is null and o.paid_at is not null
      and o.paid_at between v_pay.created_at - interval '120 seconds'
                        and v_pay.created_at + interval '120 seconds';
  else
    v_items := '[]'::jsonb;
  end if;

  if v_pay.order_item_ids is not null and array_length(v_pay.order_item_ids, 1) > 0 then
    select coalesce(sum(oi.price_cents * oi.qty), 0)
      into v_subtotal
    from order_items oi
    where oi.id = any(v_pay.order_item_ids);

    select coalesce(sum(
      o.tax_cents::numeric * per_order.item_total / nullif(o.subtotal_cents, 0)
    ), 0)::bigint
      into v_tax
    from (
      select oi.order_id, sum(oi.price_cents * oi.qty) as item_total
      from order_items oi
      where oi.id = any(v_pay.order_item_ids)
      group by oi.order_id
    ) per_order
    join orders o on o.id = per_order.order_id;
  else
    select coalesce(sum(o.subtotal_cents), 0), coalesce(sum(o.tax_cents), 0)
      into v_subtotal, v_tax
    from orders o
    where o.table_id = v_pay.table_id and o.business_id = v_pay.business_id
      and o.canceled_at is null and o.paid_at is not null
      and o.paid_at between v_pay.created_at - interval '120 seconds'
                        and v_pay.created_at + interval '120 seconds';
  end if;

  if v_pay.paid_by is not null then
    select coalesce(e.receipt_display_name, u.display_name)
      into v_server_name
    from employees e
    join users u on u.id = e.user_id
    where e.user_id = v_pay.paid_by
      and e.business_id = v_pay.business_id
    limit 1;
  end if;

  return jsonb_build_object(
    'business', jsonb_build_object(
      'name', v_biz.name, 'logo_url', v_biz.logo_url,
      'address', v_biz.address, 'city', v_biz.city, 'state', v_biz.state,
      'phone', v_biz.phone, 'slug', v_biz.slug,
      'receipt_brand_color', v_biz.receipt_brand_color,
      'receipt_template_id', v_biz.receipt_template_id
    ),
    'payment', jsonb_build_object(
      'amount_cents', v_pay.amount_cents, 'tip_cents', v_pay.tip_cents,
      'kind', v_pay.kind, 'seat', v_pay.seat, 'status', v_pay.status,
      'created_at', v_pay.created_at,
      'card_brand', v_pay.card_brand, 'card_last4', v_pay.card_last4,
      'subtotal_cents', v_subtotal, 'tax_cents', v_tax,
      'payment_method', v_pay.payment_method
    ),
    'table_label', v_table_label,
    'items', coalesce(v_items, '[]'::jsonb),
    'server_name', v_server_name
  );
end;
$$;


ALTER FUNCTION "public"."get_public_receipt"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_room_qr_token"("p_room_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_token text;
begin
  if not exists (
    select 1 from rooms r
    join businesses b on b.id = r.business_id
    where r.id = p_room_id
      and (b.owner_id = auth.uid() or is_platform_admin())
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select qr_token into v_token from rooms where id = p_room_id;
  return v_token;
end;
$$;


ALTER FUNCTION "public"."get_room_qr_token"("p_room_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_table_order_status"("p_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_table_id uuid; v_biz uuid; v_enabled boolean; v_items jsonb;
begin
  select t.id, t.business_id into v_table_id, v_biz from public.tables t where t.qr_token = p_token and t.is_active = true;
  if v_table_id is null then return jsonb_build_object('enabled', false, 'items', '[]'::jsonb); end if;
  select coalesce((b.kds_settings->>'customer_status_enabled')::boolean, false) into v_enabled from public.businesses b where b.id = v_biz;
  if not coalesce(v_enabled, false) then return jsonb_build_object('enabled', false, 'items', '[]'::jsonb); end if;
  select coalesce(jsonb_agg(jsonb_build_object('name', mi.name, 'qty', oi.qty, 'status', oi.item_status, 'station', mi.station) order by o.created_at, oi.id), '[]'::jsonb) into v_items
  from public.orders o join public.order_items oi on oi.order_id = o.id join public.menu_items mi on mi.id = oi.menu_item_id
  where o.table_id = v_table_id and o.paid_at is null and o.canceled_at is null and coalesce(o.approval_status,'approved') = 'approved';
  return jsonb_build_object('enabled', true, 'items', v_items);
end; $$;


ALTER FUNCTION "public"."get_table_order_status"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gift_available"("p_business_id" "uuid", "p_other_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select auth.uid() is not null and auth.uid() <> p_other_user_id
     and public.venue_presence_ok(p_business_id, auth.uid())
     and public.venue_presence_ok(p_business_id, p_other_user_id)
     and not exists (select 1 from public.blocks b where (b.blocker_id = auth.uid() and b.blocked_id = p_other_user_id) or (b.blocker_id = p_other_user_id and b.blocked_id = auth.uid()));
$$;


ALTER FUNCTION "public"."gift_available"("p_business_id" "uuid", "p_other_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gift_offer_cancel"("p_offer_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare g public.gift_offers%rowtype;
begin
  select * into g from public.gift_offers where id = p_offer_id for update;
  if g.id is null or g.from_user_id <> auth.uid() then raise exception 'not_your_gift' using errcode = '42501'; end if;
  if g.status not in ('draft','awaiting_payment') then return jsonb_build_object('status', g.status, 'cancelled', false); end if;
  update public.gift_offers set status = 'cancelled' where id = g.id;
  return jsonb_build_object('status', 'cancelled', 'cancelled', true);
end;
$$;


ALTER FUNCTION "public"."gift_offer_cancel"("p_offer_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gift_offer_create"("p_business_id" "uuid", "p_to_user_id" "uuid", "p_items" "jsonb", "p_note" "text" DEFAULT NULL::"text", "p_conversation_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid := auth.uid(); v_items jsonb; v_sub int; v_id uuid; v_n int;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.gift_available(p_business_id, p_to_user_id) then raise exception 'gift_unavailable' using errcode = '42501'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 10 then
    raise exception 'invalid_items' using errcode = '22023';
  end if;
  -- máx. 3 regalos por hora, contando SOLO los que llegaron a retener la tarjeta (held_at), y uno pendiente a la vez hacia la
  -- misma persona (held o accepted: ya está en manos del destinatario). Un regalo sin pagar o cancelado no cuenta ni bloquea.
  if (select count(*) from public.gift_offers g where g.from_user_id = v_uid and g.held_at > now() - interval '1 hour') >= 3 then
    raise exception 'gift_rate_limit' using errcode = '42501';
  end if;
  -- Máx. 5 rechazos de pago por hora entre TODAS las ofertas del usuario (creadas en la última hora), tengan o no tarjeta retenida: sin
  -- esto, abrir ofertas nuevas sin pagar (que el límite de arriba no cuenta) sirve para probar tarjetas, 3 intentos por oferta.
  if (select coalesce(sum(g.payment_failures), 0) from public.gift_offers g where g.from_user_id = v_uid and g.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'gift_rate_limit' using errcode = '42501';
  end if;
  if exists (select 1 from public.gift_offers g where g.from_user_id = v_uid and g.to_user_id = p_to_user_id and g.status in ('held','accepted')) then
    raise exception 'gift_pending' using errcode = '42501';
  end if;
  select jsonb_agg(jsonb_build_object('menu_item_id', m.id, 'name', m.name, 'description', m.description, 'qty', q.qty,
                                      'price_cents', m.price_cents, 'id_required', coalesce(m.id_required,false))), count(*)
  into v_items, v_n
  from (select (i->>'menu_item_id')::uuid as mid, greatest(least(coalesce((i->>'qty')::int,1), 10), 1) as qty from jsonb_array_elements(p_items) i) q
  join public.menu_items m on m.id = q.mid and m.business_id = p_business_id and coalesce(m.is_available, true);
  if v_n is null or v_n <> jsonb_array_length(p_items) then raise exception 'invalid_items' using errcode = '22023'; end if;
  select sum((i->>'price_cents')::int * (i->>'qty')::int) into v_sub from jsonb_array_elements(v_items) i;
  -- Una sola oferta abierta por persona: las propias que sigan sin pagar (hoja cerrada sin "Volver", pestaña perdida...) se cancelan
  -- ahora; si ya tenían PaymentIntent, el trigger gift_offer_dispatch avisa a gift-worker para cancelarlo.
  update public.gift_offers set status = 'cancelled' where from_user_id = v_uid and status in ('draft', 'awaiting_payment');
  insert into public.gift_offers (business_id, from_user_id, to_user_id, conversation_id, items, note, subtotal_cents, status, expires_at)
  values (p_business_id, v_uid, p_to_user_id, p_conversation_id, v_items, nullif(left(trim(coalesce(p_note,'')),200),''), v_sub, 'draft', now() + interval '15 minutes')
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'subtotal_cents', v_sub, 'items', v_items);
end;
$$;


ALTER FUNCTION "public"."gift_offer_create"("p_business_id" "uuid", "p_to_user_id" "uuid", "p_items" "jsonb", "p_note" "text", "p_conversation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gift_offer_dispatch"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare v_secret text;
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status not in ('accepted','declined','expired','cancelled') or new.stripe_pi_id is null then return new; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret' limit 1;
  if v_secret is null then return new; end if;
  perform net.http_post(
    url := 'https://klfsgcfoahdtkojyqspd.supabase.co/functions/v1/gift-worker',
    body := jsonb_build_object('gift_offer_id', new.id, 'status', new.status, 'stripe_pi_id', new.stripe_pi_id),
    headers := jsonb_build_object('Content-Type','application/json','x-push-secret', v_secret),
    timeout_milliseconds := 20000);
  return new;
exception when others then
  raise warning 'gift_offer_dispatch failed: %', sqlerrm; return new;
end;
$$;


ALTER FUNCTION "public"."gift_offer_dispatch"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gift_offer_mark_failed"("p_stripe_pi_id" "text") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  update public.gift_offers set status = 'failed' where stripe_pi_id = p_stripe_pi_id and status in ('awaiting_payment','accepted');
$$;


ALTER FUNCTION "public"."gift_offer_mark_failed"("p_stripe_pi_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gift_offer_mark_held"("p_stripe_pi_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare g public.gift_offers%rowtype; v_conv uuid; v_name text;
begin
  select * into g from public.gift_offers where stripe_pi_id = p_stripe_pi_id for update;
  if g.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if g.status <> 'awaiting_payment' then return jsonb_build_object('ok', true, 'status', g.status); end if;
  update public.gift_offers set status = 'held', held_at = now(), expires_at = now() + interval '15 minutes' where id = g.id;
  -- conversación 1:1 (reutiliza la existente entre los dos; si no hay, se crea efímera del local)
  v_conv := g.conversation_id;
  if v_conv is null then
    select id into v_conv from public.dm_conversations c where (c.user_a = g.from_user_id and c.user_b = g.to_user_id) or (c.user_a = g.to_user_id and c.user_b = g.from_user_id) limit 1;
    if v_conv is null then
      insert into public.dm_conversations (user_a, user_b, ephemeral_business_id) values (least(g.from_user_id, g.to_user_id), greatest(g.from_user_id, g.to_user_id), g.business_id) returning id into v_conv;
    end if;
    update public.gift_offers set conversation_id = v_conv where id = g.id;
  end if;
  insert into public.dm_messages (conversation_id, sender_id, body, gift_offer_id) values (v_conv, g.from_user_id, '🎁', g.id);
  update public.dm_conversations set last_message_at = now() where id = v_conv;
  select coalesce(display_name, '@' || username) into v_name from public.users where id = g.from_user_id;
  insert into public.notifications (user_id, type, payload) values (g.to_user_id, 'gift_offer',
    jsonb_build_object('gift_offer_id', g.id, 'business_id', g.business_id, 'from_user_id', g.from_user_id, 'conversation_id', v_conv, 'item_count', jsonb_array_length(g.items)));
  return jsonb_build_object('ok', true, 'status', 'held', 'conversation_id', v_conv);
end;
$$;


ALTER FUNCTION "public"."gift_offer_mark_held"("p_stripe_pi_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gift_offer_mark_paid"("p_stripe_pi_id" "text", "p_order_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  update public.gift_offers set status = 'paid', order_id = p_order_id where stripe_pi_id = p_stripe_pi_id and status = 'accepted';
$$;


ALTER FUNCTION "public"."gift_offer_mark_paid"("p_stripe_pi_id" "text", "p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gift_offer_notify_response"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status in ('accepted','declined','expired') then
    insert into public.notifications (user_id, type, payload) values (new.from_user_id, 'gift_response',
      jsonb_build_object('gift_offer_id', new.id, 'business_id', new.business_id, 'to_user_id', new.to_user_id, 'conversation_id', new.conversation_id, 'result', new.status));
  elsif new.status = 'paid' then
    insert into public.notifications (user_id, type, payload) values (new.to_user_id, 'gift_response',
      jsonb_build_object('gift_offer_id', new.id, 'business_id', new.business_id, 'from_user_id', new.from_user_id, 'conversation_id', new.conversation_id, 'result', 'paid', 'order_id', new.order_id));
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."gift_offer_notify_response"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gift_offer_register_payment_failure"("p_stripe_pi_id" "text", "p_error" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  g          public.gift_offers%rowtype;
  v_failures int;
  v_error    text := nullif(left(trim(coalesce(p_error, '')), 200), '');
begin
  select * into g from public.gift_offers where stripe_pi_id = p_stripe_pi_id for update;
  if g.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  if g.status = 'accepted' then
    update public.gift_offers set status = 'failed', last_payment_error = v_error where id = g.id;
    return jsonb_build_object('ok', true, 'status', 'failed', 'failures', g.payment_failures);
  end if;

  if g.status <> 'awaiting_payment' then
    return jsonb_build_object('ok', true, 'status', g.status, 'failures', g.payment_failures);
  end if;

  v_failures := g.payment_failures + 1;
  if v_failures >= 3 then
    update public.gift_offers set payment_failures = v_failures, last_payment_error = v_error, status = 'cancelled' where id = g.id;
    return jsonb_build_object('ok', true, 'status', 'cancelled', 'failures', v_failures);
  end if;

  update public.gift_offers set payment_failures = v_failures, last_payment_error = v_error where id = g.id;
  return jsonb_build_object('ok', true, 'status', 'awaiting_payment', 'failures', v_failures);
end;
$$;


ALTER FUNCTION "public"."gift_offer_register_payment_failure"("p_stripe_pi_id" "text", "p_error" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."gift_offer_register_payment_failure"("p_stripe_pi_id" "text", "p_error" "text") IS 'Webhook payment_failed de un regalo: registra el rechazo y deja la oferta en awaiting_payment para reintentar en el mismo PaymentIntent; al tercero la cancela (gift-worker cancela el PaymentIntent). accepted → failed como siempre.';


CREATE OR REPLACE FUNCTION "public"."gift_offer_respond"("p_offer_id" "uuid", "p_accept" boolean, "p_table_label" "text" DEFAULT NULL::"text", "p_table_details" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare g public.gift_offers%rowtype;
begin
  select * into g from public.gift_offers where id = p_offer_id for update;
  if g.id is null or g.to_user_id <> auth.uid() then raise exception 'not_your_gift' using errcode = '42501'; end if;
  if g.status <> 'held' then raise exception 'gift_not_open' using errcode = '22023'; end if;
  if g.expires_at < now() then update public.gift_offers set status = 'expired' where id = g.id; raise exception 'gift_expired' using errcode = '22023'; end if;
  if p_accept then
    if not public.venue_presence_ok(g.business_id, auth.uid()) then raise exception 'not_in_venue' using errcode = '42501'; end if;
    if nullif(trim(coalesce(p_table_label,'')), '') is null then raise exception 'table_required' using errcode = '22023'; end if;
    update public.gift_offers set status = 'accepted', table_label = left(trim(p_table_label), 40), table_details = nullif(left(trim(coalesce(p_table_details,'')),200),''), responded_at = now() where id = g.id;
  else
    update public.gift_offers set status = 'declined', responded_at = now() where id = g.id;
  end if;
  return jsonb_build_object('status', case when p_accept then 'accepted' else 'declined' end);
end;
$$;


ALTER FUNCTION "public"."gift_offer_respond"("p_offer_id" "uuid", "p_accept" boolean, "p_table_label" "text", "p_table_details" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gift_offer_set_hold"("p_offer_id" "uuid", "p_stripe_pi_id" "text", "p_subtotal" integer, "p_tax" integer, "p_total" integer) RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  update public.gift_offers set stripe_pi_id = p_stripe_pi_id, subtotal_cents = p_subtotal, tax_cents = p_tax, total_cents = p_total, status = 'awaiting_payment'
  where id = p_offer_id and status in ('draft','awaiting_payment');
$$;


ALTER FUNCTION "public"."gift_offer_set_hold"("p_offer_id" "uuid", "p_stripe_pi_id" "text", "p_subtotal" integer, "p_tax" integer, "p_total" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gift_offer_view"("p_offer_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare g public.gift_offers%rowtype; v_from jsonb; v_to jsonb; v_is_sender boolean;
begin
  select * into g from public.gift_offers where id = p_offer_id;
  if g.id is null or (g.from_user_id <> auth.uid() and g.to_user_id <> auth.uid()) then raise exception 'not_found' using errcode = '42501'; end if;
  v_is_sender := g.from_user_id = auth.uid();
  select jsonb_build_object('id', u.id, 'name', coalesce(u.display_name, '@'||u.username), 'avatar_url', u.avatar_url) into v_from from public.users u where u.id = g.from_user_id;
  select jsonb_build_object('id', u.id, 'name', coalesce(u.display_name, '@'||u.username), 'avatar_url', u.avatar_url) into v_to from public.users u where u.id = g.to_user_id;
  return jsonb_build_object('id', g.id, 'business_id', g.business_id, 'status', g.status, 'is_sender', v_is_sender, 'from', v_from, 'to', v_to,
    'items', (select jsonb_agg(i - 'price_cents') from jsonb_array_elements(g.items) i), 'item_count', (select sum((i->>'qty')::int) from jsonb_array_elements(g.items) i),
    'note', g.note, 'expires_at', g.expires_at, 'table_label', case when v_is_sender then null else g.table_label end,
    'total_cents', case when v_is_sender then g.total_cents else null end, 'order_id', g.order_id);
end;
$$;


ALTER FUNCTION "public"."gift_offer_view"("p_offer_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gift_offers_expire"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare n int;
begin
  with u as (update public.gift_offers set status = 'expired' where status = 'held' and expires_at < now() returning 1)
  select count(*) into n from u;
  -- borradores/ofertas sin pagar: 'cancelled' (NO 'expired': el destinatario nunca la vio). El trigger avisa a gift-worker, que
  -- cancela su PaymentIntent si existe.
  update public.gift_offers set status = 'cancelled'
  where status in ('draft', 'awaiting_payment') and coalesce(expires_at, created_at + interval '15 minutes') < now();
  return n;
end;
$$;


ALTER FUNCTION "public"."gift_offers_expire"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gift_offers_reconcile"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare r record; n int := 0; v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret' limit 1;
  if v_secret is null then return 0; end if;
  for r in
    select id, status, stripe_pi_id from public.gift_offers
    where stripe_pi_id is not null and (
      (status = 'accepted' and updated_at < now() - interval '2 minutes' and updated_at > now() - interval '24 hours')
      or (status in ('declined','expired','cancelled') and updated_at > now() - interval '2 hours' and updated_at < now() - interval '2 minutes'))
    limit 50
  loop
    perform net.http_post(
      url := 'https://klfsgcfoahdtkojyqspd.supabase.co/functions/v1/gift-worker',
      body := jsonb_build_object('gift_offer_id', r.id, 'status', r.status, 'stripe_pi_id', r.stripe_pi_id),
      headers := jsonb_build_object('Content-Type','application/json','x-push-secret', v_secret),
      timeout_milliseconds := 20000);
    n := n + 1;
  end loop;
  return n;
end;
$$;


ALTER FUNCTION "public"."gift_offers_reconcile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gift_offers_touch"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin new.updated_at := now(); return new; end; $$;


ALTER FUNCTION "public"."gift_offers_touch"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guest_order_notify_staff"("p_code" "text", "p_kind" "text", "p_note" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_o record; v_room uuid; v_id uuid; v_note text;
begin
  if p_code is null or length(p_code) < 20 then raise exception 'not_your_order' using errcode = '42501'; end if;
  if p_kind not in ('on_my_way','arrived','question') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  select o.id, o.business_id, o.room_id, o.status, o.order_type, o.table_label, o.order_number, o.created_at, o.guest_device_id
    into v_o from public.orders o where o.guest_tracking_code = p_code;
  if v_o.id is null then raise exception 'not_your_order' using errcode = '42501'; end if;
  if v_o.status in ('cancelled') or v_o.created_at < now() - interval '12 hours' then
    raise exception 'order_closed' using errcode = '22023';
  end if;
  if exists (select 1 from public.service_calls sc where sc.order_id = v_o.id and sc.created_at > now() - interval '2 minutes') then
    raise exception 'notice_cooldown' using errcode = '42501';
  end if;
  if (select count(*) from public.service_calls sc where sc.order_id = v_o.id) >= 6 then
    raise exception 'notice_limit' using errcode = '42501';
  end if;
  v_room := coalesce(v_o.room_id, (select r.id from public.rooms r where r.business_id = v_o.business_id and r.parent_room_id is null and r.is_active order by r.created_at limit 1));
  if v_room is null then raise exception 'no_room' using errcode = '22023'; end if;
  v_note := nullif(left(trim(coalesce(p_note,'')), 200), '');
  if p_kind = 'question' and v_note is null then raise exception 'note_required' using errcode = '22023'; end if;
  perform set_config('app.order_notify', 'on', true);
  insert into public.service_calls (room_id, business_id, user_id, status, type, notes, table_label, order_id, guest_device_id)
  values (v_room, v_o.business_id, null, 'pending', 'order',
          '#' || v_o.order_number || ' · ' || p_kind || coalesce(' · ' || v_note, ''), v_o.table_label, v_o.id, v_o.guest_device_id)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'order_number', v_o.order_number, 'kind', p_kind);
end;
$$;


ALTER FUNCTION "public"."guest_order_notify_staff"("p_code" "text", "p_kind" "text", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guest_order_view"("p_code" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_o record;
begin
  if p_code is null or length(p_code) < 20 then return null; end if;
  select o.id, o.order_number, o.status, o.order_type, o.table_label, o.created_at, o.status_updated_at, o.business_id
    into v_o from public.orders o
   where o.guest_tracking_code = p_code and o.created_at > now() - interval '12 hours';
  if v_o.id is null then return null; end if;
  return jsonb_build_object(
    'order_number', v_o.order_number,
    'status', v_o.status,
    'order_type', v_o.order_type,
    'table_label', v_o.table_label,
    'created_at', v_o.created_at,
    'status_updated_at', v_o.status_updated_at,
    'business', (select jsonb_build_object('name', b.name, 'slug', b.slug) from public.businesses b where b.id = v_o.business_id),
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', mi.name, 'qty', oi.qty, 'item_status', oi.item_status) order by oi.created_at, oi.id)
                         from public.order_items oi join public.menu_items mi on mi.id = oi.menu_item_id
                        where oi.order_id = v_o.id), '[]'::jsonb)
  );
end;
$$;


ALTER FUNCTION "public"."guest_order_view"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guest_request_service"("p_table_token" "text", "p_lat" double precision, "p_lng" double precision, "p_device_id" "text", "p_notes" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_t record; v_room uuid; v_id uuid; v_owner uuid; v_rejected int;
begin
  if p_device_id is null or length(p_device_id) < 8 then return jsonb_build_object('ok', false, 'error', 'device_required'); end if;
  select t.id, t.business_id, t.label, t.room_id into v_t from public.tables t where t.qr_token = p_table_token and t.is_active;
  if v_t.id is null then return jsonb_build_object('ok', false, 'error', 'invalid_qr'); end if;
  if exists (select 1 from public.guest_device_blocks b where b.business_id = v_t.business_id and b.device_id = p_device_id and b.blocked_until > now() and b.unblocked_at is null) then
    return jsonb_build_object('ok', false, 'error', 'blocked_24h');
  end if;
  if not public.venue_inside(v_t.business_id, p_lat, p_lng) then
    insert into public.guest_service_attempts (business_id, device_id, reason) values (v_t.business_id, p_device_id, 'outside_venue');
    if (select count(*) from public.guest_service_attempts a where a.business_id = v_t.business_id and a.device_id = p_device_id and a.created_at > now() - interval '10 minutes') >= 3 then
      insert into public.guest_device_blocks (business_id, device_id, reason, blocked_until) values (v_t.business_id, p_device_id, 'service_outside_venue', now() + interval '24 hours');
    end if;
    select count(*) into v_rejected from public.guest_service_attempts a where a.business_id = v_t.business_id and a.created_at > now() - interval '15 minutes';
    select owner_id into v_owner from public.businesses where id = v_t.business_id;
    if v_rejected >= 10 and v_owner is not null and not exists (
      select 1 from public.notifications n where n.user_id = v_owner and n.type = 'work_alert' and n.payload->>'kind' = 'service_abuse'
        and n.payload->>'business_id' = v_t.business_id::text and n.created_at > now() - interval '1 hour') then
      insert into public.notifications (user_id, type, payload) values (v_owner, 'work_alert',
        jsonb_build_object('kind','service_abuse','business_id', v_t.business_id, 'rejected_15m', v_rejected));
    end if;
    return jsonb_build_object('ok', false, 'error', 'outside_venue');
  end if;
  if exists (select 1 from public.service_calls sc where sc.business_id = v_t.business_id and sc.table_label = v_t.label and sc.status not in ('resolved','cancelled')) then
    return jsonb_build_object('ok', false, 'error', 'call_already_open');
  end if;
  v_room := coalesce(v_t.room_id, (select r.id from public.rooms r where r.business_id = v_t.business_id and r.parent_room_id is null and r.is_active limit 1));
  insert into public.service_calls (room_id, business_id, user_id, status, type, notes, table_label, guest_device_id)
  values (v_room, v_t.business_id, null, 'pending', 'waiter', left(p_notes, 200), v_t.label, p_device_id) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'table_label', v_t.label);
end;
$$;


ALTER FUNCTION "public"."guest_request_service"("p_table_token" "text", "p_lat" double precision, "p_lng" double precision, "p_device_id" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guest_request_service_by_label"("p_business_id" "uuid", "p_label" "text", "p_lat" double precision, "p_lng" double precision, "p_device_id" "text", "p_notes" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_label   text;
  v_token   text;
  v_invalid int;
begin
  -- Lo que teclea el invitado: minúsculas, sin espacios en los bordes y sin el prefijo mesa / table / t.
  v_label := lower(btrim(coalesce(p_label, '')));
  v_label := regexp_replace(v_label, '^(mesa|table|t)\s*', '');

  if p_device_id is null or length(p_device_id) < 8 then
    return jsonb_build_object('ok', false, 'error', 'device_required');
  end if;

  if p_business_id is null or v_label = '' or length(v_label) > 20
     or not exists (select 1 from public.businesses b where b.id = p_business_id and b.is_active) then
    return jsonb_build_object('ok', false, 'error', 'invalid_table');
  end if;

  if exists (select 1 from public.guest_device_blocks g
             where g.business_id = p_business_id and g.device_id = p_device_id
               and g.blocked_until > now() and g.unblocked_at is null) then
    return jsonb_build_object('ok', false, 'error', 'blocked_24h');
  end if;

  select t.qr_token into v_token
  from public.tables t
  where t.business_id = p_business_id
    and t.is_active
    and regexp_replace(lower(btrim(t.label)), '^(mesa|table|t)\s*', '') = v_label
  order by (lower(btrim(t.label)) = v_label) desc, t.label
  limit 1;

  if v_token is null then
    if not public.venue_inside(p_business_id, p_lat, p_lng) then
      return jsonb_build_object('ok', false, 'error', 'outside_venue');
    end if;
    insert into public.guest_service_attempts (business_id, device_id, reason)
    values (p_business_id, p_device_id, 'invalid_table');
    select count(*) into v_invalid
    from public.guest_service_attempts a
    where a.business_id = p_business_id and a.device_id = p_device_id and a.reason = 'invalid_table'
      and a.created_at > now() - interval '10 minutes';
    if v_invalid >= 6 then
      insert into public.guest_device_blocks (business_id, device_id, reason, blocked_until)
      values (p_business_id, p_device_id, 'service_invalid_table', now() + interval '24 hours')
      on conflict (business_id, device_id) where unblocked_at is null
      do update set blocked_until = excluded.blocked_until, reason = excluded.reason;
    end if;
    return jsonb_build_object('ok', false, 'error', 'invalid_table');
  end if;

  return public.guest_request_service(v_token, p_lat, p_lng, p_device_id, p_notes);
end;
$$;


ALTER FUNCTION "public"."guest_request_service_by_label"("p_business_id" "uuid", "p_label" "text", "p_lat" double precision, "p_lng" double precision, "p_device_id" "text", "p_notes" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."guest_request_service_by_label"("p_business_id" "uuid", "p_label" "text", "p_lat" double precision, "p_lng" double precision, "p_device_id" "text", "p_notes" "text") IS 'Llamar al servicio sin cuenta con el QR general: busca la mesa activa del negocio por su número y delega en guest_request_service. Solo service_role (la Edge Function guest-tab, con hCaptcha); el token de la mesa no sale del servidor.';


CREATE OR REPLACE FUNCTION "public"."guest_tab_session_validate"("p_token_hash" "text") RETURNS TABLE("session_id" "uuid", "business_id" "uuid", "table_id" "uuid", "table_label" "text", "device_id" "text", "session_opened_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  return query
  with s as (
    select g.* from public.guest_tab_sessions g
     where g.token_hash = p_token_hash and g.revoked_at is null and g.expires_at > now()
  )
  select s.id, s.business_id, s.table_id, t.label, s.device_id, t.session_opened_at
    from s join public.tables t on t.id = s.table_id
   where t.is_active = true and t.access_code is not null and t.session_opened_at = s.table_session_opened_at;
  if found then
    update public.guest_tab_sessions set last_seen_at = now() where token_hash = p_token_hash;
  end if;
end;
$$;


ALTER FUNCTION "public"."guest_tab_session_validate"("p_token_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_auth_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  base_username text;
  final_username text;
  suffix int := 0;
  candidate text;
begin
  base_username := public.derive_username(new.email, new.raw_user_meta_data);

  -- dedupe case-insensitive contra public.users.username
  candidate := base_username;
  loop
    exit when not exists (
      select 1 from public.users where lower(username) = lower(candidate)
    );
    suffix := suffix + 1;
    -- asegurar que base+suffix no exceda 30
    candidate := left(base_username, 30 - length(suffix::text)) || suffix::text;
  end loop;
  final_username := candidate;

  insert into public.users (id, username, display_name, language, profile_theme_id)
  values (
    new.id,
    final_username,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    'en',
    1
  )
  on conflict (id) do nothing;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_auth_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."hide_dm_conversation"("p_conversation_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."hide_dm_conversation"("p_conversation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."inv_can_manage"("p_business_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = p_business_id AND b.owner_id = auth.uid())
$$;


ALTER FUNCTION "public"."inv_can_manage"("p_business_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."inventory_archive_location"("p_business_id" "uuid", "p_location_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_qty integer;
BEGIN
  IF NOT public.inv_can_manage(p_business_id) THEN RAISE EXCEPTION 'forbidden' USING errcode='42501'; END IF;
  SELECT COALESCE(SUM(qty),0) INTO v_qty FROM public.stock_by_location
    WHERE location_id = p_location_id AND business_id = p_business_id;
  IF v_qty > 0 THEN RAISE EXCEPTION 'location has stock; move it first'; END IF;
  UPDATE public.inventory_locations SET is_active = false, is_sales_location = false, updated_at = now()
   WHERE id = p_location_id AND business_id = p_business_id;
  UPDATE public.businesses SET sales_location_id = NULL
   WHERE id = p_business_id AND sales_location_id = p_location_id;
END;
$$;


ALTER FUNCTION "public"."inventory_archive_location"("p_business_id" "uuid", "p_location_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."inventory_create_location"("p_business_id" "uuid", "p_name" "text", "p_is_sales" boolean DEFAULT false) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.inv_can_manage(p_business_id) THEN RAISE EXCEPTION 'forbidden' USING errcode='42501'; END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN RAISE EXCEPTION 'name required'; END IF;

  INSERT INTO public.inventory_locations (business_id, name, is_sales_location)
  VALUES (p_business_id, btrim(p_name), COALESCE(p_is_sales, false))
  RETURNING id INTO v_id;

  -- Si se marca como ubicación de venta, desmarcar las demás y fijarla en businesses
  IF COALESCE(p_is_sales, false) THEN
    UPDATE public.inventory_locations SET is_sales_location = false
     WHERE business_id = p_business_id AND id <> v_id;
    UPDATE public.inventory_locations SET is_sales_location = true WHERE id = v_id;
    UPDATE public.businesses SET sales_location_id = v_id WHERE id = p_business_id;
  END IF;
  RETURN v_id;
END;
$$;


ALTER FUNCTION "public"."inventory_create_location"("p_business_id" "uuid", "p_name" "text", "p_is_sales" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."inventory_kpis"("p_business_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) RETURNS TABLE("total_revenue_cents" bigint, "costed_revenue_cents" bigint, "cogs_cents" bigint, "pour_cost_pct" numeric, "coverage_pct" numeric, "inventory_value_cents" bigint, "turnover" numeric, "days_on_hand" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_has_perm boolean;
  v_total bigint; v_costed bigint; v_cogs bigint; v_inv bigint;
  v_days numeric;
begin
  if v_uid is null then raise exception 'forbidden' using errcode='42501'; end if;

  select exists (
    select 1 from employees e
    join custom_roles cr on cr.id = e.custom_role_id
    where e.business_id = p_business_id and e.user_id = v_uid and e.status = 'accepted'
      and coalesce((cr.permissions->>'inventory_manage')::boolean, false)
  ) or exists (
    select 1 from businesses b where b.id = p_business_id and b.owner_id = v_uid
  ) into v_has_perm;
  if not v_has_perm then raise exception 'forbidden' using errcode='42501'; end if;

  -- Ventas del período: solo órdenes NO anuladas. Revenue = qty*price_cents.
  -- COGS y revenue "con costo" solo cuentan ítems que tienen costo cargado.
  select
    coalesce(sum(oi.qty * oi.price_cents), 0),
    coalesce(sum(case when mic.cost_cents is not null then oi.qty * oi.price_cents end), 0),
    coalesce(sum(case when mic.cost_cents is not null then oi.qty * mic.cost_cents end), 0)
  into v_total, v_costed, v_cogs
  from order_items oi
  join orders o on o.id = oi.order_id
  left join menu_item_costs mic on mic.menu_item_id = oi.menu_item_id
  where o.business_id = p_business_id
    and o.canceled_at is null
    and o.created_at >= p_from
    and o.created_at <  p_to;

  -- Valor de inventario actual: productos rastreados con costo.
  select coalesce(sum(mi.stock_count * mic.cost_cents), 0)
  into v_inv
  from menu_items mi
  join menu_item_costs mic on mic.menu_item_id = mi.id
  where mi.business_id = p_business_id
    and mi.stock_count is not null
    and mic.cost_cents is not null;

  v_days := greatest(extract(epoch from (p_to - p_from)) / 86400.0, 0);

  return query select
    v_total,
    v_costed,
    v_cogs,
    case when v_costed > 0 then round(100.0 * v_cogs / v_costed, 1) else null end,
    case when v_total  > 0 then round(100.0 * v_costed / v_total, 1) else null end,
    v_inv,
    case when v_inv  > 0 then round(v_cogs::numeric / v_inv, 2) else null end,
    case when v_cogs > 0 and v_days > 0 then round(v_inv * v_days / v_cogs, 1) else null end;
end
$$;


ALTER FUNCTION "public"."inventory_kpis"("p_business_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."inventory_rename_location"("p_business_id" "uuid", "p_location_id" "uuid", "p_name" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.inv_can_manage(p_business_id) THEN RAISE EXCEPTION 'forbidden' USING errcode='42501'; END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN RAISE EXCEPTION 'name required'; END IF;
  UPDATE public.inventory_locations SET name = btrim(p_name), updated_at = now()
   WHERE id = p_location_id AND business_id = p_business_id;
END;
$$;


ALTER FUNCTION "public"."inventory_rename_location"("p_business_id" "uuid", "p_location_id" "uuid", "p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."inventory_report"("p_business_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) RETURNS TABLE("menu_item_id" "uuid", "item_name" "text", "sold" integer, "received" integer, "waste" integer, "count_adj" integer, "voided" integer, "stock_now" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_has_perm boolean;
begin
  if v_uid is null then raise exception 'forbidden' using errcode='42501'; end if;

  select exists (
    select 1 from employees e
    join custom_roles cr on cr.id = e.custom_role_id
    where e.business_id = p_business_id and e.user_id = v_uid and e.status = 'accepted'
      and coalesce((cr.permissions->>'inventory_manage')::boolean, false)
  ) or exists (
    select 1 from businesses b where b.id = p_business_id and b.owner_id = v_uid
  ) into v_has_perm;
  if not v_has_perm then raise exception 'forbidden' using errcode='42501'; end if;

  return query
  select
    mi.id,
    mi.name,
    coalesce(sum(case when sm.reason like 'sale%'     then abs(sm.delta) end), 0)::int,
    coalesce(sum(case when sm.reason like 'received%' then sm.delta      end), 0)::int,
    coalesce(sum(case when sm.reason like 'waste%'    then abs(sm.delta) end), 0)::int,
    coalesce(sum(case when sm.reason like 'count%'    then sm.delta      end), 0)::int,
    coalesce(sum(case when sm.reason like 'void%'     then sm.delta      end), 0)::int,
    mi.stock_count
  from menu_items mi
  left join stock_movements sm
    on sm.menu_item_id = mi.id
   and sm.business_id  = p_business_id
   and sm.created_at  >= p_from
   and sm.created_at  <  p_to
  where mi.business_id = p_business_id
    and mi.stock_count is not null
  group by mi.id, mi.name, mi.stock_count
  order by
    coalesce(sum(case when sm.reason like 'waste%' then abs(sm.delta) end), 0) desc,
    coalesce(sum(case when sm.reason like 'count%' then sm.delta end), 0) asc,
    mi.name asc;
end
$$;


ALTER FUNCTION "public"."inventory_report"("p_business_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."inventory_set_location_qty"("p_business_id" "uuid", "p_menu_item_id" "uuid", "p_location_id" "uuid", "p_qty" integer, "p_reason" "text" DEFAULT 'count'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_old integer; v_delta integer;
BEGIN
  IF NOT public.inv_can_manage(p_business_id) THEN RAISE EXCEPTION 'forbidden' USING errcode='42501'; END IF;
  IF p_qty < 0 THEN RAISE EXCEPTION 'qty must be >= 0'; END IF;

  SELECT qty INTO v_old FROM public.stock_by_location
   WHERE menu_item_id = p_menu_item_id AND location_id = p_location_id;

  IF v_old IS NULL THEN
    INSERT INTO public.stock_by_location (business_id, menu_item_id, location_id, qty)
    VALUES (p_business_id, p_menu_item_id, p_location_id, p_qty);
    v_delta := p_qty;
  ELSE
    UPDATE public.stock_by_location SET qty = p_qty, updated_at = now()
     WHERE menu_item_id = p_menu_item_id AND location_id = p_location_id;
    v_delta := p_qty - v_old;
  END IF;

  IF v_delta <> 0 THEN
    INSERT INTO public.stock_movements (menu_item_id, business_id, delta, reason, created_by)
    VALUES (p_menu_item_id, p_business_id, v_delta, 'count_adj:'||COALESCE(p_reason,'count'), auth.uid());
  END IF;
END;
$$;


ALTER FUNCTION "public"."inventory_set_location_qty"("p_business_id" "uuid", "p_menu_item_id" "uuid", "p_location_id" "uuid", "p_qty" integer, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."inventory_set_sales_location"("p_business_id" "uuid", "p_location_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.inv_can_manage(p_business_id) THEN RAISE EXCEPTION 'forbidden' USING errcode='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inventory_locations WHERE id = p_location_id AND business_id = p_business_id) THEN
    RAISE EXCEPTION 'location not in this business';
  END IF;
  UPDATE public.inventory_locations SET is_sales_location = (id = p_location_id), updated_at = now()
   WHERE business_id = p_business_id;
  UPDATE public.businesses SET sales_location_id = p_location_id WHERE id = p_business_id;
END;
$$;


ALTER FUNCTION "public"."inventory_set_sales_location"("p_business_id" "uuid", "p_location_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."inventory_transfer"("p_business_id" "uuid", "p_menu_item_id" "uuid", "p_from_location" "uuid", "p_to_location" "uuid", "p_qty" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_from integer;
BEGIN
  IF NOT public.inv_can_manage(p_business_id) THEN RAISE EXCEPTION 'forbidden' USING errcode='42501'; END IF;
  IF p_qty <= 0 THEN RAISE EXCEPTION 'qty must be > 0'; END IF;
  IF p_from_location = p_to_location THEN RAISE EXCEPTION 'from and to must differ'; END IF;

  SELECT qty INTO v_from FROM public.stock_by_location
   WHERE menu_item_id = p_menu_item_id AND location_id = p_from_location;
  IF v_from IS NULL OR v_from < p_qty THEN RAISE EXCEPTION 'insufficient stock at source'; END IF;

  -- Restar del origen
  UPDATE public.stock_by_location SET qty = qty - p_qty, updated_at = now()
   WHERE menu_item_id = p_menu_item_id AND location_id = p_from_location;

  -- Sumar al destino (upsert)
  INSERT INTO public.stock_by_location (business_id, menu_item_id, location_id, qty)
  VALUES (p_business_id, p_menu_item_id, p_to_location, p_qty)
  ON CONFLICT (menu_item_id, location_id)
  DO UPDATE SET qty = public.stock_by_location.qty + EXCLUDED.qty, updated_at = now();

  -- Registrar los dos movimientos (el total no cambia; el trigger recalcula igual)
  INSERT INTO public.stock_movements (menu_item_id, business_id, delta, reason, created_by)
  VALUES (p_menu_item_id, p_business_id, -p_qty, 'transfer_out', auth.uid()),
         (p_menu_item_id, p_business_id,  p_qty, 'transfer_in',  auth.uid());
END;
$$;


ALTER FUNCTION "public"."inventory_transfer"("p_business_id" "uuid", "p_menu_item_id" "uuid", "p_from_location" "uuid", "p_to_location" "uuid", "p_qty" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_banned_from_room"("p_room" "uuid", "p_user" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.bans x
    where x.user_id = p_user
      and (x.room_id = p_room
           or (x.room_id is null and x.business_id = (select r.business_id from public.rooms r where r.id = p_room)))
  );
$$;


ALTER FUNCTION "public"."is_banned_from_room"("p_room" "uuid", "p_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_blocked"("a" "uuid", "b" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;


ALTER FUNCTION "public"."is_blocked"("a" "uuid", "b" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_employee_of_business"("p_business_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1 from public.employees e
    where e.business_id = p_business_id
      and e.user_id = auth.uid()
      and e.status = 'accepted'
  );
$$;


ALTER FUNCTION "public"."is_employee_of_business"("p_business_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_muted_in_room"("p_room" "uuid", "p_user" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.room_mutes m
    where m.room_id = p_room and m.user_id = p_user
      and (m.expires_at is null or m.expires_at > now())
  );
$$;


ALTER FUNCTION "public"."is_muted_in_room"("p_room" "uuid", "p_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_platform_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    exists (select 1 from public.admin_roles ar where ar.user_id = auth.uid())
    or exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role = 'super_admin'
    );
$$;


ALTER FUNCTION "public"."is_platform_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_private_account"("p_user" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce((select u.is_private from public.users u where u.id = p_user), false);
$$;


ALTER FUNCTION "public"."is_private_account"("p_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_venue_staff"("p_business_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = p_user_id)
      or exists (select 1 from public.employees e where e.business_id = p_business_id and e.user_id = p_user_id
                 and coalesce(e.status,'active') in ('active','accepted'));
$$;


ALTER FUNCTION "public"."is_venue_staff"("p_business_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_waiter_of_table"("p_table_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1 from public.table_waiters tw
    join public.employees e on e.id = tw.employee_id
    where tw.table_id = p_table_id and e.user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_waiter_of_table"("p_table_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."join_room_via_qr"("token" "text") RETURNS TABLE("room_id" "uuid", "parent_room_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  _room_id        uuid;
  _parent_room_id uuid;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  select r.id, r.parent_room_id
  into   _room_id, _parent_room_id
  from   public.rooms r
  where  r.qr_token = token
    and  r.is_active = true;

  if _room_id is null then
    raise exception 'invalid_qr';
  end if;

  insert into public.room_members (room_id, user_id, expires_at)
    values (_room_id, auth.uid(), now() + interval '24 hours')
  on conflict on constraint room_members_pkey
    do update set expires_at = now() + interval '24 hours';

  if _parent_room_id is not null then
    insert into public.room_members (room_id, user_id, expires_at)
      values (_parent_room_id, auth.uid(), now() + interval '24 hours')
    on conflict on constraint room_members_pkey
      do update set expires_at = now() + interval '24 hours';
  end if;

  return query select _room_id, _parent_room_id;
end;
$$;


ALTER FUNCTION "public"."join_room_via_qr"("token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."join_room_via_qr"("token" "text", "p_lat" double precision, "p_lng" double precision) RETURNS TABLE("room_id" "uuid", "parent_room_id" "uuid", "access_granted" boolean, "is_owner" boolean, "distance_m" double precision, "reason" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_room uuid; v_parent uuid; v_res record; v_business uuid; v_expires timestamptz;
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;
  select r.id, r.parent_room_id, r.business_id into v_room, v_parent, v_business from public.rooms r where r.qr_token = token and r.is_active = true;
  if v_room is null then raise exception 'invalid_qr'; end if;
  select * into v_res from public.check_geofence_and_join_room(v_room, p_lat, p_lng);
  if not v_res.access_granted then
    return query select v_room, v_parent, false, false, v_res.distance_m, v_res.reason;
    return;
  end if;
  v_expires := public.venue_session_expires_at(v_business);
  insert into public.room_members (room_id, user_id, expires_at) values (v_room, auth.uid(), v_expires)
  on conflict on constraint room_members_pkey do update set expires_at = v_expires;
  if v_parent is not null then
    insert into public.room_members (room_id, user_id, expires_at) values (v_parent, auth.uid(), v_expires)
    on conflict on constraint room_members_pkey do update set expires_at = v_expires;
  end if;
  return query select v_room, v_parent, true, v_res.is_owner, v_res.distance_m, v_res.reason;
end;
$$;


ALTER FUNCTION "public"."join_room_via_qr"("token" "text", "p_lat" double precision, "p_lng" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_card"("p_viewer" "uuid", "p_user" "uuid", "p_business_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select jsonb_build_object(
    'id', u.id, 'username', u.username, 'display_name', u.display_name, 'avatar_url', u.avatar_url, 'bio', u.bio, 'is_verified', u.is_verified,
    'photos', coalesce((select jsonb_agg(p.path order by p.sort, p.created_at) from public.match_photos p where p.user_id = u.id and p.status = 'approved'), '[]'::jsonb),
    'interests', coalesce((select jsonb_agg(ui.interest_key order by ui.interest_key) from public.user_interests ui where ui.user_id = u.id), '[]'::jsonb),
    'common_interests', (select count(*) from public.user_interests a join public.user_interests b on b.interest_key = a.interest_key and b.user_id = p_user where a.user_id = p_viewer),
    'super_liked_me', exists (select 1 from public.match_swipes s where s.business_id = p_business_id and s.swiper_id = p_user and s.target_id = p_viewer and s.action = 'super' and s.undone_at is null)
  )
  from public.users u where u.id = p_user;
$$;


ALTER FUNCTION "public"."match_card"("p_viewer" "uuid", "p_user" "uuid", "p_business_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_check_in"("p_business_id" "uuid", "p_lat" double precision DEFAULT NULL::double precision, "p_lng" double precision DEFAULT NULL::double precision, "p_qr_token" "text" DEFAULT NULL::"text", "p_mocked" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid := auth.uid(); v_user record; v_qr_ok boolean := false; v_other record; v_biz record; v_row public.match_presence%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select u.age_confirmed_at, coalesce((u.settings->>'gamesEnabled')::boolean, true) as games_enabled into v_user from public.users u where u.id = v_uid;
  if v_user.age_confirmed_at is null then return jsonb_build_object('status','denied','reason','age_not_confirmed'); end if;
  if not v_user.games_enabled then return jsonb_build_object('status','denied','reason','games_disabled'); end if;
  if not public.match_enabled_for_business(p_business_id) then return jsonb_build_object('status','denied','reason','match_disabled'); end if;
  if exists (select 1 from public.match_kicks k where k.business_id = p_business_id and k.user_id = v_uid) then return jsonb_build_object('status','denied','reason','unavailable'); end if;

  -- Regla de oro: sin entrada al chat con ubicación, no hay Match
  if not public.venue_presence_ok(p_business_id, v_uid) then return jsonb_build_object('status','denied','reason','not_in_venue'); end if;

  if p_qr_token is not null then
    v_qr_ok := exists (select 1 from public.rooms r where r.business_id = p_business_id and r.is_active and r.qr_token = p_qr_token);
    if not v_qr_ok then return jsonb_build_object('status','denied','reason','invalid_qr'); end if;
  end if;

  -- Viaje imposible
  select b.lat, b.lng into v_biz from public.businesses b where b.id = p_business_id;
  select mp.business_id, b.lat, b.lng into v_other from public.match_presence mp join public.businesses b on b.id = mp.business_id
  where mp.user_id = v_uid and mp.business_id <> p_business_id and mp.last_seen_at > now() - interval '5 minutes' limit 1;
  if v_other.business_id is not null and v_biz.lat is not null and v_other.lat is not null
     and public.geo_distance_m(v_biz.lat, v_biz.lng, v_other.lat, v_other.lng) > 2000 then
    return jsonb_build_object('status','denied','reason','impossible_travel');
  end if;

  insert into public.game_optins (user_id, business_id, game_key) values (v_uid, p_business_id, 'match') on conflict do nothing;

  insert into public.match_presence (user_id, business_id, entered_at, last_seen_at, expires_at, active_since, method, readings, mocked)
  values (v_uid, p_business_id, now(), now(), now() + interval '15 minutes',
          case when v_qr_ok or not coalesce(p_mocked,false) then now() else null end,
          case when v_qr_ok then 'qr' else 'geo' end, 1, coalesce(p_mocked,false) and not v_qr_ok)
  on conflict (user_id, business_id) do update set
    last_seen_at = now(), expires_at = now() + interval '15 minutes', readings = match_presence.readings + 1,
    method = case when v_qr_ok then 'qr' else match_presence.method end,
    mocked = case when v_qr_ok or match_presence.method = 'qr' then false else match_presence.mocked or coalesce(p_mocked,false) end,
    active_since = case when v_qr_ok or match_presence.method = 'qr' then coalesce(match_presence.active_since, now())
                        when coalesce(p_mocked,false) then null else coalesce(match_presence.active_since, now()) end
  returning * into v_row;

  return jsonb_build_object('status', case when v_row.active_since is not null then 'active' else 'pending' end,
    'reason', case when v_row.active_since is null then 'mocked_location' else null end,
    'active_since', v_row.active_since, 'expires_at', v_row.expires_at, 'readings', v_row.readings, 'method', v_row.method);
end;
$$;


ALTER FUNCTION "public"."match_check_in"("p_business_id" "uuid", "p_lat" double precision, "p_lng" double precision, "p_qr_token" "text", "p_mocked" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_clear_likes"("p_business_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid := auth.uid(); r record;
begin
  for r in select id from public.match_swipes s where s.business_id = p_business_id and s.swiper_id = v_uid and s.undone_at is null and s.action in ('like','super') loop
    perform public.match_delete_like(r.id);
  end loop;
end;
$$;


ALTER FUNCTION "public"."match_clear_likes"("p_business_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_common_business"("p_viewer" "uuid", "p_target" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select v.business_id
  from public.match_presence v
  join public.match_presence t on t.business_id = v.business_id and t.user_id = p_target
  where v.user_id = p_viewer and p_viewer <> p_target
    and v.active_since is not null and v.expires_at > now()
    and t.active_since is not null and t.expires_at > now()
    and exists (select 1 from public.game_optins o where o.user_id = p_viewer and o.business_id = v.business_id and o.game_key = 'match')
    and exists (select 1 from public.game_optins o where o.user_id = p_target and o.business_id = v.business_id and o.game_key = 'match')
    and public.match_enabled_for_business(v.business_id)
    and not exists (select 1 from public.match_kicks k where k.business_id = v.business_id and k.user_id in (p_viewer, p_target))
    and not public.is_blocked(p_viewer, p_target)
    and coalesce((select (u.settings->>'gamesEnabled')::boolean from public.users u where u.id = p_target), true)
  limit 1;
$$;


ALTER FUNCTION "public"."match_common_business"("p_viewer" "uuid", "p_target" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_delete_like"("p_swipe_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid := auth.uid(); v_s public.match_swipes%rowtype;
begin
  select * into v_s from public.match_swipes s where s.id = p_swipe_id and s.swiper_id = v_uid and s.undone_at is null and s.action in ('like','super');
  if v_s.id is null then return; end if;
  update public.match_swipes set undone_at = now() where id = v_s.id;
  delete from public.notifications n where n.type in ('match_like','match_super') and (n.payload->>'swipe_id')::uuid = v_s.id;
  perform public.match_remove_pair(v_s.business_id, v_uid, v_s.target_id);
end;
$$;


ALTER FUNCTION "public"."match_delete_like"("p_swipe_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_delete_match"("p_match_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid := auth.uid(); v_m public.matches%rowtype;
begin
  select * into v_m from public.matches m where m.id = p_match_id and v_uid in (m.user_a, m.user_b);
  if v_m.id is null then return; end if;
  perform public.match_remove_pair(v_m.business_id, v_m.user_a, v_m.user_b);
end;
$$;


ALTER FUNCTION "public"."match_delete_match"("p_match_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_detect"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_a uuid; v_b uuid; v_super boolean; v_conv uuid; v_reverse public.match_swipes%rowtype;
begin
  if new.undone_at is not null or new.action = 'pass' then return new; end if;
  select * into v_reverse from public.match_swipes s
   where s.business_id = new.business_id and s.swiper_id = new.target_id and s.target_id = new.swiper_id
     and s.action in ('like','super') and s.undone_at is null;
  if v_reverse.id is null then return new; end if;
  if public.is_blocked(new.swiper_id, new.target_id) then return new; end if;

  v_a := least(new.swiper_id, new.target_id); v_b := greatest(new.swiper_id, new.target_id);
  v_super := (new.action = 'super' or v_reverse.action = 'super');

  select c.id into v_conv from public.dm_conversations c where c.user_a = v_a and c.user_b = v_b;
  if v_conv is null then
    insert into public.dm_conversations (user_a, user_b, ephemeral_business_id) values (v_a, v_b, new.business_id) returning id into v_conv;
  end if;

  insert into public.matches (business_id, user_a, user_b, is_super, conversation_id)
  values (new.business_id, v_a, v_b, v_super, v_conv)
  on conflict (business_id, user_a, user_b) do nothing;
  return new;
end;
$$;


ALTER FUNCTION "public"."match_detect"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_enabled_for_business"("p_business_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce((select bg.enabled from public.business_games bg where bg.business_id = p_business_id and bg.game_key = 'match'), false)
     and exists (select 1 from public.games g where g.key = 'match' and g.is_active);
$$;


ALTER FUNCTION "public"."match_enabled_for_business"("p_business_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_follow_survival"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if exists (select 1 from public.follows f where f.follower_id = new.following_id and f.following_id = new.follower_id) then
    update public.dm_conversations set ephemeral_business_id = null, awaiting_reply = false
    where user_a = least(new.follower_id, new.following_id) and user_b = greatest(new.follower_id, new.following_id)
      and ephemeral_business_id is not null;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."match_follow_survival"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_get_activity"("p_business_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select jsonb_build_object(
    'likes_given', coalesce((select jsonb_agg(jsonb_build_object('swipe_id', s.id, 'action', s.action, 'created_at', s.created_at, 'user', public.match_card(auth.uid(), s.target_id, p_business_id)) order by s.created_at desc)
                              from public.match_swipes s where s.business_id = p_business_id and s.swiper_id = auth.uid() and s.action in ('like','super') and s.undone_at is null), '[]'::jsonb),
    'liked_me', coalesce((select jsonb_agg(jsonb_build_object('action', s.action, 'created_at', s.created_at, 'user', public.match_card(auth.uid(), s.swiper_id, p_business_id)) order by (s.action='super') desc, s.created_at desc)
                           from public.match_swipes s where s.business_id = p_business_id and s.target_id = auth.uid() and s.action in ('like','super') and s.undone_at is null), '[]'::jsonb),
    'matches', coalesce((select jsonb_agg(jsonb_build_object('match_id', m.id, 'is_super', m.is_super, 'conversation_id', m.conversation_id, 'created_at', m.created_at,
                                            'user', public.match_card(auth.uid(), case when m.user_a = auth.uid() then m.user_b else m.user_a end, p_business_id)) order by m.created_at desc)
                          from public.matches m where m.business_id = p_business_id and auth.uid() in (m.user_a, m.user_b)), '[]'::jsonb),
    'super_left', 5 - coalesce((select used from public.match_super_quota q where q.user_id = auth.uid() and q.day = public.match_today()), 0)
  );
$$;


ALTER FUNCTION "public"."match_get_activity"("p_business_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_get_deck"("p_business_id" "uuid", "p_limit" integer DEFAULT 20) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid := auth.uid(); v_min int; v_max int; v_year int := extract(year from now())::int;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.match_presence p where p.user_id = v_uid and p.business_id = p_business_id and p.active_since is not null and p.expires_at > now()) then
    raise exception 'not_present' using errcode = '42501';
  end if;
  select (u.settings->>'matchAgeMin')::int, (u.settings->>'matchAgeMax')::int into v_min, v_max from public.users u where u.id = v_uid;

  return coalesce((
    select jsonb_agg(public.match_card(v_uid, c.user_id, p_business_id) order by c.super_me desc, c.common desc, c.entered_at desc)
    from (
      select t.user_id, t.entered_at,
        exists (select 1 from public.match_swipes s where s.business_id = p_business_id and s.swiper_id = t.user_id and s.target_id = v_uid and s.action = 'super' and s.undone_at is null) as super_me,
        (select count(*) from public.user_interests a join public.user_interests b on b.interest_key = a.interest_key and b.user_id = t.user_id where a.user_id = v_uid) as common
      from public.match_presence t
      join public.users u on u.id = t.user_id
      where t.business_id = p_business_id and t.user_id <> v_uid
        and public.match_common_business(v_uid, t.user_id) = p_business_id
        and exists (select 1 from public.match_photos p where p.user_id = t.user_id and p.status = 'approved')
        and not exists (select 1 from public.match_swipes s where s.business_id = p_business_id and s.swiper_id = v_uid and s.target_id = t.user_id and s.undone_at is null)
        and (v_min is null or u.birth_year is null or (v_year - u.birth_year) >= v_min - 1)
        and (v_max is null or u.birth_year is null or (v_year - u.birth_year) <= v_max + 1)
      limit greatest(1, least(coalesce(p_limit, 20), 50))
    ) c
  ), '[]'::jsonb);
end;
$$;


ALTER FUNCTION "public"."match_get_deck"("p_business_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_get_passed"("p_business_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return coalesce((
    select jsonb_agg(c order by s.created_at desc) from public.match_swipes s
    cross join lateral (select public.match_card(v_uid, s.target_id, p_business_id) as c) x
    where s.business_id = p_business_id and s.swiper_id = v_uid and s.action = 'pass' and s.undone_at is null
      and public.match_common_business(v_uid, s.target_id) = p_business_id
      and x.c is not null
  ), '[]'::jsonb);
end;
$$;


ALTER FUNCTION "public"."match_get_passed"("p_business_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_get_profile"("p_business_id" "uuid", "p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select case when public.match_common_business(auth.uid(), p_user_id) = p_business_id
              or exists (select 1 from public.matches m where m.business_id = p_business_id and auth.uid() in (m.user_a, m.user_b) and p_user_id in (m.user_a, m.user_b))
         then public.match_card(auth.uid(), p_user_id, p_business_id) else null end;
$$;


ALTER FUNCTION "public"."match_get_profile"("p_business_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_kick"("p_business_id" "uuid", "p_user_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = v_uid) then raise exception 'not_owner' using errcode = '42501'; end if;
  insert into public.match_kicks (business_id, user_id, kicked_by, reason) values (p_business_id, p_user_id, v_uid, p_reason)
  on conflict (business_id, user_id) do update set kicked_by = excluded.kicked_by, reason = excluded.reason, created_at = now();
  update public.reports set status = 'resolved'
  where business_id = p_business_id and reported_user_id = p_user_id and content_type = 'match' and status in ('pending','reviewing');
  perform public.match_wipe_user_venue(p_user_id, p_business_id);
end;
$$;


ALTER FUNCTION "public"."match_kick"("p_business_id" "uuid", "p_user_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_leave_venue"("p_business_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  perform public.match_wipe_user_venue(auth.uid(), p_business_id);
end;
$$;


ALTER FUNCTION "public"."match_leave_venue"("p_business_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_notify_new_people"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.active_since is null or (old.active_since is not null) then return new; end if;
  insert into public.notifications (user_id, type, payload)
  select p.user_id, 'match_new_people', jsonb_build_object('business_id', new.business_id)
  from public.match_presence p join public.users u on u.id = p.user_id
  where p.business_id = new.business_id and p.user_id <> new.user_id and p.active_since is not null and p.expires_at > now()
    and coalesce((u.settings->>'matchNotifyNewPeople')::boolean, false)
    and not exists (select 1 from public.notifications n where n.user_id = p.user_id and n.type = 'match_new_people'
                    and (n.payload->>'business_id')::uuid = new.business_id and n.created_at > now() - interval '10 minutes');
  return new;
end;
$$;


ALTER FUNCTION "public"."match_notify_new_people"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_photo_dispatch_moderation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret' limit 1;
  if v_secret is null then return new; end if;
  perform net.http_post(
    url := 'https://klfsgcfoahdtkojyqspd.supabase.co/functions/v1/moderate-match-photo',
    body := jsonb_build_object('photo_id', new.id, 'path', new.path, 'user_id', new.user_id),
    headers := jsonb_build_object('Content-Type','application/json','x-push-secret', v_secret),
    timeout_milliseconds := 20000
  );
  return new;
exception when others then
  raise warning 'match_photo_dispatch_moderation failed: %', sqlerrm;  -- la foto queda pendiente; el reintento lo hace el cron
  return new;
end;
$$;


ALTER FUNCTION "public"."match_photo_dispatch_moderation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_photo_retry_moderation"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare r record; n int := 0; v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret' limit 1;
  if v_secret is null then return 0; end if;
  for r in select id, path, user_id from public.match_photos
           where status = 'pending' and moderated_at is null and not needs_review
             and created_at < now() - interval '5 minutes' and created_at > now() - interval '2 days'
           limit 50 loop
    perform net.http_post(
      url := 'https://klfsgcfoahdtkojyqspd.supabase.co/functions/v1/moderate-match-photo',
      body := jsonb_build_object('photo_id', r.id, 'path', r.path, 'user_id', r.user_id),
      headers := jsonb_build_object('Content-Type','application/json','x-push-secret', v_secret),
      timeout_milliseconds := 20000);
    n := n + 1;
  end loop;
  return n;
end;
$$;


ALTER FUNCTION "public"."match_photo_retry_moderation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_photos_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is not null and not coalesce(current_setting('app.match_admin_review', true), '') = 'on'
     and (new.status is distinct from old.status or new.reviewed_at is distinct from old.reviewed_at
          or new.rejection_reason is distinct from old.rejection_reason or new.user_id <> old.user_id or new.path <> old.path
          or new.needs_review is distinct from old.needs_review or new.moderation is distinct from old.moderation
          or new.moderated_at is distinct from old.moderated_at) then
    raise exception 'match_photo_fields_readonly' using errcode = '42501';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."match_photos_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_photos_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if (select count(*) from public.match_photos p where p.user_id = new.user_id) >= 6 then
    raise exception 'match_photos_limit_reached' using errcode = '22023';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."match_photos_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_relike"("p_business_id" "uuid", "p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid := auth.uid(); v_res jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.match_swipes s where s.business_id = p_business_id and s.swiper_id = v_uid and s.target_id = p_user_id and s.action = 'pass' and s.undone_at is null) then
    raise exception 'not_passed' using errcode = '22023';
  end if;
  -- Límites por visita (12 h): 20 repasos y 30 s entre repasos
  if (select count(*) from public.match_relikes r where r.user_id = v_uid and r.business_id = p_business_id and r.created_at > now() - interval '12 hours') >= 20 then
    raise exception 'relike_limit' using errcode = '42501';
  end if;
  if exists (select 1 from public.match_relikes r where r.user_id = v_uid and r.business_id = p_business_id and r.created_at > now() - interval '30 seconds') then
    raise exception 'relike_cooldown' using errcode = '42501';
  end if;
  -- Se deshace el pass y se da like por el camino normal (detección de match y avisos incluidos). Nunca super.
  update public.match_swipes set undone_at = now() where business_id = p_business_id and swiper_id = v_uid and target_id = p_user_id;
  v_res := public.match_swipe(p_business_id, p_user_id, 'like');
  insert into public.match_relikes (business_id, user_id, target_id) values (p_business_id, v_uid, p_user_id);
  return v_res;
end;
$$;


ALTER FUNCTION "public"."match_relike"("p_business_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_relikes_wipe_on_leave"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  delete from public.match_relikes where user_id = old.user_id and business_id = old.business_id;
  return old;
end;
$$;


ALTER FUNCTION "public"."match_relikes_wipe_on_leave"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_remove_pair"("p_business_id" "uuid", "p_u1" "uuid", "p_u2" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_conv uuid;
begin
  delete from public.matches m where m.business_id = p_business_id and m.user_a = least(p_u1,p_u2) and m.user_b = greatest(p_u1,p_u2)
  returning m.conversation_id into v_conv;
  if v_conv is not null then
    delete from public.dm_conversations c where c.id = v_conv and c.ephemeral_business_id = p_business_id;  -- las permanentes no se tocan
  end if;
  delete from public.notifications n where n.type = 'match_match' and n.user_id in (p_u1, p_u2)
    and (n.payload->>'business_id')::uuid = p_business_id and (n.payload->>'other_user_id')::uuid in (p_u1, p_u2);
end;
$$;


ALTER FUNCTION "public"."match_remove_pair"("p_business_id" "uuid", "p_u1" "uuid", "p_u2" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_report"("p_business_id" "uuid", "p_reported_user_id" "uuid", "p_reason" "text", "p_details" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid := auth.uid(); v_id uuid; v_owner uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_reason not in ('harassment','explicit','minor','scam','other') then raise exception 'invalid_reason' using errcode = '22023'; end if;
  if p_reported_user_id = v_uid then raise exception 'invalid_target' using errcode = '22023'; end if;
  insert into public.reports (reporter_id, reported_user_id, content_type, content_id, reason, status, business_id)
  values (v_uid, p_reported_user_id, 'match', null, p_reason || coalesce(': ' || left(p_details, 500), ''), 'pending', p_business_id)
  returning id into v_id;
  -- doble destino: cola del superadmin (ya lee reports) + aviso al dueño del local
  select owner_id into v_owner from public.businesses where id = p_business_id;
  if v_owner is not null and v_owner <> v_uid then
    insert into public.notifications (user_id, type, payload)
    values (v_owner, 'work_alert', jsonb_build_object('kind','match_report','business_id', p_business_id, 'report_id', v_id, 'reason', p_reason, 'reported_user_id', p_reported_user_id));
  end if;
  return v_id;
end;
$$;


ALTER FUNCTION "public"."match_report"("p_business_id" "uuid", "p_reported_user_id" "uuid", "p_reason" "text", "p_details" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_request_help"("p_business_id" "uuid", "p_room_id" "uuid" DEFAULT NULL::"uuid", "p_table_label" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid := auth.uid(); v_id uuid; v_room uuid; r record;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  v_room := coalesce(p_room_id, (select r2.id from public.rooms r2 where r2.business_id = p_business_id and r2.is_active order by r2.is_main desc nulls last, r2.sort limit 1));
  insert into public.service_calls (room_id, business_id, user_id, status, type, notes, table_label)
  values (v_room, p_business_id, v_uid, 'pending', 'help', 'Un cliente pide ayuda discreta', left(p_table_label, 40))
  returning id into v_id;
  for r in
    select b.owner_id as user_id from public.businesses b where b.id = p_business_id
    union
    select e.user_id from public.employees e where e.business_id = p_business_id and e.status = 'active' and e.last_active_at > now() - interval '2 hours'
  loop
    if r.user_id is not null and r.user_id <> v_uid then
      insert into public.notifications (user_id, type, payload)
      values (r.user_id, 'work_alert', jsonb_build_object('kind','help','business_id', p_business_id, 'service_call_id', v_id, 'room_id', v_room, 'table_label', left(p_table_label, 40)));
    end if;
  end loop;
  return v_id;
end;
$$;


ALTER FUNCTION "public"."match_request_help"("p_business_id" "uuid", "p_room_id" "uuid", "p_table_label" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_resolve_report"("p_report_id" "uuid", "p_status" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_status not in ('resolved','dismissed') then raise exception 'invalid_status' using errcode = '22023'; end if;
  update public.reports r set status = p_status
  where r.id = p_report_id and r.content_type = 'match'
    and exists (select 1 from public.businesses b where b.id = r.business_id and b.owner_id = v_uid);
  if not found then raise exception 'not_owner_or_not_found' using errcode = '42501'; end if;
end;
$$;


ALTER FUNCTION "public"."match_resolve_report"("p_report_id" "uuid", "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_swipe"("p_business_id" "uuid", "p_target_id" "uuid", "p_action" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid(); v_used int; v_swipe public.match_swipes%rowtype; v_match public.matches%rowtype; v_existing public.match_swipes%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_action not in ('like','pass','super') then raise exception 'invalid_action' using errcode = '22023'; end if;
  if public.match_common_business(v_uid, p_target_id) is distinct from p_business_id then
    raise exception 'not_in_same_venue' using errcode = '42501';
  end if;

  select * into v_existing from public.match_swipes s where s.business_id = p_business_id and s.swiper_id = v_uid and s.target_id = p_target_id;
  if v_existing.id is not null and v_existing.undone_at is null then
    return jsonb_build_object('swiped', false, 'reason', 'already_swiped');
  end if;

  if p_action = 'super' then
    insert into public.match_super_quota (user_id, day, used) values (v_uid, public.match_today(), 0) on conflict do nothing;
    select used into v_used from public.match_super_quota q where q.user_id = v_uid and q.day = public.match_today() for update;
    if v_used >= 5 then raise exception 'super_like_quota' using errcode = '22023'; end if;
    update public.match_super_quota set used = used + 1 where user_id = v_uid and day = public.match_today();
  end if;

  if v_existing.id is not null then
    update public.match_swipes set action = p_action, undone_at = null, created_at = now() where id = v_existing.id returning * into v_swipe;
  else
    insert into public.match_swipes (business_id, swiper_id, target_id, action) values (p_business_id, v_uid, p_target_id, p_action) returning * into v_swipe;
  end if;

  select * into v_match from public.matches m where m.business_id = p_business_id and m.user_a = least(v_uid, p_target_id) and m.user_b = greatest(v_uid, p_target_id);

  if v_match.id is not null and v_match.created_at >= v_swipe.created_at - interval '2 seconds' then
    -- match recién creado: avisar a los dos
    insert into public.notifications (user_id, type, payload) values
      (p_target_id, 'match_match', jsonb_build_object('business_id', p_business_id, 'other_user_id', v_uid, 'match_id', v_match.id, 'conversation_id', v_match.conversation_id)),
      (v_uid,       'match_match', jsonb_build_object('business_id', p_business_id, 'other_user_id', p_target_id, 'match_id', v_match.id, 'conversation_id', v_match.conversation_id));
  elsif p_action in ('like','super') then
    insert into public.notifications (user_id, type, payload)
    values (p_target_id, case when p_action = 'super' then 'match_super' else 'match_like' end,
            jsonb_build_object('business_id', p_business_id, 'from_user_id', v_uid, 'swipe_id', v_swipe.id));
  end if;

  return jsonb_build_object('swiped', true, 'is_match', v_match.id is not null, 'match_id', v_match.id, 'conversation_id', v_match.conversation_id,
                            'super_left', case when p_action = 'super' then 5 - (v_used + 1) else null end);
end;
$$;


ALTER FUNCTION "public"."match_swipe"("p_business_id" "uuid", "p_target_id" "uuid", "p_action" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_today"() RETURNS "date"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$ select (now() at time zone 'America/New_York')::date $$;


ALTER FUNCTION "public"."match_today"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_undo_last"("p_business_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid := auth.uid(); v_s public.match_swipes%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_s from public.match_swipes s where s.business_id = p_business_id and s.swiper_id = v_uid and s.undone_at is null
  order by s.created_at desc limit 1;
  if v_s.id is null then return jsonb_build_object('undone', false); end if;
  update public.match_swipes set undone_at = now() where id = v_s.id;
  if v_s.action = 'super' then update public.match_super_quota set used = greatest(used - 1, 0) where user_id = v_uid and day = public.match_today(); end if;
  delete from public.notifications n where n.type in ('match_like','match_super') and (n.payload->>'swipe_id')::uuid = v_s.id;
  perform public.match_remove_pair(p_business_id, v_uid, v_s.target_id);
  return jsonb_build_object('undone', true, 'target_id', v_s.target_id, 'action', v_s.action);
end;
$$;


ALTER FUNCTION "public"."match_undo_last"("p_business_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_unkick"("p_business_id" "uuid", "p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = auth.uid()) then raise exception 'not_owner' using errcode = '42501'; end if;
  delete from public.match_kicks where business_id = p_business_id and user_id = p_user_id;
end;
$$;


ALTER FUNCTION "public"."match_unkick"("p_business_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_wipe_expired"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare r record; n int := 0;
begin
  for r in select p.user_id, p.business_id from public.match_presence p where p.expires_at < now() - interval '15 minutes' loop
    perform public.match_wipe_user_venue(r.user_id, r.business_id);
    n := n + 1;
  end loop;
  return n;
end;
$$;


ALTER FUNCTION "public"."match_wipe_expired"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_wipe_user_venue"("p_user_id" "uuid", "p_business_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare r record;
begin
  -- matches y sus chats efímeros (sobreviven si hay solicitud de follow pendiente entre los dos)
  for r in select m.* from public.matches m where m.business_id = p_business_id and p_user_id in (m.user_a, m.user_b) loop
    if exists (select 1 from public.follow_requests fr where fr.status = 'pending'
               and ((fr.requester_id = r.user_a and fr.target_id = r.user_b) or (fr.requester_id = r.user_b and fr.target_id = r.user_a))) then
      continue;  -- la conversación espera la decisión del follow
    end if;
    perform public.match_remove_pair(p_business_id, r.user_a, r.user_b);
  end loop;
  -- conversaciones efímeras del local sin match (p. ej. match ya borrado) donde participa
  delete from public.dm_conversations c where c.ephemeral_business_id = p_business_id and p_user_id in (c.user_a, c.user_b)
    and not exists (select 1 from public.follow_requests fr where fr.status = 'pending'
                    and ((fr.requester_id = c.user_a and fr.target_id = c.user_b) or (fr.requester_id = c.user_b and fr.target_id = c.user_a)));
  -- swipes dados y recibidos, notificaciones de Match (propias y sobre él), opt-in y presencia
  delete from public.notifications n where n.type in ('match_like','match_super','match_match','match_new_people')
    and (n.payload->>'business_id')::uuid = p_business_id
    and (n.user_id = p_user_id or (n.payload->>'from_user_id')::uuid = p_user_id or (n.payload->>'other_user_id')::uuid = p_user_id);
  delete from public.match_swipes s where s.business_id = p_business_id and p_user_id in (s.swiper_id, s.target_id);
  delete from public.game_optins o where o.user_id = p_user_id and o.business_id = p_business_id;
  delete from public.match_presence p where p.user_id = p_user_id and p.business_id = p_business_id;
end;
$$;


ALTER FUNCTION "public"."match_wipe_user_venue"("p_user_id" "uuid", "p_business_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_wipe_user_venue_keep_dms"("p_user_id" "uuid", "p_business_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare r record;
begin
  for r in select m.* from public.matches m where m.business_id = p_business_id and p_user_id in (m.user_a, m.user_b) loop
    if exists (select 1 from public.follow_requests fr where fr.status = 'pending'
               and ((fr.requester_id = r.user_a and fr.target_id = r.user_b) or (fr.requester_id = r.user_b and fr.target_id = r.user_a))) then
      continue;
    end if;
    delete from public.matches m where m.id = r.id;
  end loop;
  delete from public.notifications n where n.type in ('match_like','match_super','match_match','match_new_people')
    and (n.payload->>'business_id')::uuid = p_business_id
    and (n.user_id = p_user_id or (n.payload->>'from_user_id')::uuid = p_user_id or (n.payload->>'other_user_id')::uuid = p_user_id);
  delete from public.match_swipes s where s.business_id = p_business_id and p_user_id in (s.swiper_id, s.target_id);
  delete from public.game_optins o where o.user_id = p_user_id and o.business_id = p_business_id;
  delete from public.match_presence p where p.user_id = p_user_id and p.business_id = p_business_id;
end;
$$;


ALTER FUNCTION "public"."match_wipe_user_venue_keep_dms"("p_user_id" "uuid", "p_business_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."megaphone_feed"("p_lat" double precision DEFAULT NULL::double precision, "p_lng" double precision DEFAULT NULL::double precision, "p_radius_miles" integer DEFAULT 50, "p_before" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_limit" integer DEFAULT 20) RETURNS TABLE("kind" "text", "id" "uuid", "business_id" "uuid", "business_name" "text", "business_slug" "text", "icon_emoji" "text", "logo_url" "text", "room_id" "uuid", "title" "text", "body" "text", "discount" "text", "code" "text", "expires_at" timestamp with time zone, "media_urls" "text"[], "created_at" timestamp with time zone, "distance_miles" double precision, "like_count" bigint, "comment_count" bigint, "liked_by_me" boolean)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  with biz as (
    select
      b.id, b.name, b.slug, b.icon_emoji, b.logo_url,
      case
        when p_lat is null or p_lng is null or b.lat is null or b.lng is null then null
        else 3958.8 * 2 * asin(sqrt(
          power(sin(radians(b.lat - p_lat) / 2), 2)
          + cos(radians(p_lat)) * cos(radians(b.lat)) * power(sin(radians(b.lng - p_lng) / 2), 2)
        ))
      end as dist,
      (select r.id from public.rooms r
        where r.business_id = b.id
        order by r.is_main desc nulls last, r.sort asc nulls last
        limit 1) as main_room
    from public.businesses b
    where b.status = 'verified'
  ),
  eligible as (
    select * from biz
    where p_lat is null or p_lng is null
       or (dist is not null and dist <= least(greatest(coalesce(p_radius_miles, 50), 1), 500))
  ),
  items as (
    select
      'offer'::text as kind, o.id, e.id as business_id, e.name as business_name, e.slug as business_slug,
      e.icon_emoji, e.logo_url, coalesce(o.room_id, e.main_room) as room_id,
      o.title, o.description as body, o.discount, o.code, o.expires_at,
      '{}'::text[] as media_urls, o.created_at, e.dist as distance_miles,
      null::bigint as like_count, null::bigint as comment_count, null::boolean as liked_by_me
    from public.offers o
    join eligible e on e.id = o.business_id
    where o.is_active
      and (o.start_at is null or o.start_at <= now())
      and (o.expires_at is null or o.expires_at > now())
    union all
    select
      'post'::text, p.id, e.id, e.name, e.slug,
      e.icon_emoji, e.logo_url, e.main_room,
      null::text, p.caption, null::text, null::text, null::timestamptz,
      p.media_urls, p.created_at, e.dist,
      (select count(*) from public.post_likes l where l.post_id = p.id),
      (select count(*) from public.comments c where c.post_id = p.id),
      exists (select 1 from public.post_likes l where l.post_id = p.id and l.user_id = (select auth.uid()))
    from public.posts p
    join eligible e on e.id = p.business_id
  )
  select * from items
  where p_before is null or items.created_at < p_before
  order by items.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;


ALTER FUNCTION "public"."megaphone_feed"("p_lat" double precision, "p_lng" double precision, "p_radius_miles" integer, "p_before" timestamp with time zone, "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."message_filter_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_table_name = 'messages' then
    if coalesce(new.is_system, false) or coalesce(new.type, 'text') <> 'text' then
      return new;
    end if;
  end if;
  if public.message_is_objectionable(new.body) then
    raise exception 'message_not_allowed' using errcode = '22023';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."message_filter_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."message_is_objectionable"("p_text" "text") RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $_$
declare
  t text;
  m text[];
  words constant text :=
    'nigger|niggers|faggot|faggots|kike|kikes|spic|spics|chink|chinks|gook|gooks|wetback|wetbacks|tranny|trannies|'
    'retard|retards|retarded|cunt|cunts|motherfucker|motherfuckers|cocksucker|cocksuckers|whore|whores|slut|sluts|kys|'
    'hdp|hijueputa|hijoeputa|hijodeputa|maricon|maricones|mongolico|mongolica|subnormal|subnormales|sudaca|sudacas|matate|suicidate';
  phrases constant text :=
    'kill yourself|kill urself|go kill yourself|i will kill you|i am going to kill you|i will rape you|i hope you die|'
    'hijo de puta|hijos de puta|hija de puta|la puta que te pario|retrasado mental|te voy a matar|te voy a violar|'
    'ojala te mueras|negro de mierda|moro de mierda|maldito negro';
begin
  if p_text is null or p_text = '' then return false; end if;
  t := lower(p_text);
  t := translate(t, 'áàäâéèëêíìïîóòöôúùüûñ', 'aaaaeeeeiiiioooouuuun');
  t := translate(t, '013457@$', 'oieastas');
  t := regexp_replace(t, '(.)\1{2,}', '\1', 'g');
  t := trim(regexp_replace(t, '[^a-z]+', ' ', 'g'));
  for m in select regexp_matches(t, '(?:^| )((?:[a-z] ){2,}[a-z])(?= |$)', 'g') loop
    t := t || ' ' || replace(m[1], ' ', '');
  end loop;
  t := ' ' || t || ' ';
  return t ~ (' (' || words || ') ') or t ~ (' (' || phrases || ') ');
end;
$_$;


ALTER FUNCTION "public"."message_is_objectionable"("p_text" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."message_under_retention_hold"("p_message_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.reports r
    where r.content_type = 'message'
      and r.content_id = p_message_id
      and (
        r.status = 'pending'
        or (
          (lower(split_part(coalesce(r.reason, ''), ':', 1)) in ('child_safety', 'minor', 'sexual_content')
            or r.resolution = 'escalated_ncmec')
          and r.created_at > now() - interval '365 days'
        )
      )
  );
$$;


ALTER FUNCTION "public"."message_under_retention_hold"("p_message_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."messages_type_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null or coalesce(current_setting('jchat.trusted_message', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if coalesce(new.is_system, false) or new.type = 'system' or new.type like 'tod\_%' then
      raise exception 'message_type_not_allowed' using errcode = '42501';
    end if;
  else
    if new.type is distinct from old.type or new.is_system is distinct from old.is_system then
      raise exception 'message_type_readonly' using errcode = '42501';
    end if;
    if old.type like 'tod\_%' and (new.body is distinct from old.body or new.metadata is distinct from old.metadata
        or new.room_id is distinct from old.room_id or new.user_id is distinct from old.user_id
        or new.is_deleted is distinct from old.is_deleted) then
      raise exception 'message_type_readonly' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."messages_type_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_active_orders"() RETURNS TABLE("id" "uuid", "order_number" bigint, "business_id" "uuid", "business_name" "text", "status" "text", "order_type" "text", "table_label" "text", "status_updated_at" timestamp with time zone, "created_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select o.id, o.order_number, o.business_id, b.name, o.status, o.order_type, o.table_label, o.status_updated_at, o.created_at
  from public.orders o join public.businesses b on b.id = o.business_id
  where o.user_id = auth.uid()
    and o.status in ('pending','confirmed','preparing','ready')
    and o.created_at > now() - interval '12 hours'
    and (o.status <> 'ready' or coalesce(o.status_updated_at, o.created_at) > now() - interval '3 hours')
  order by o.created_at desc;
$$;


ALTER FUNCTION "public"."my_active_orders"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_block_relations"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select blocked_id from public.blocks where blocker_id = (select auth.uid())
  union
  select blocker_id from public.blocks where blocked_id = (select auth.uid());
$$;


ALTER FUNCTION "public"."my_block_relations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_item_status"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if new.item_status = 'cooking' then
    new.item_status := 'pending';
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."normalize_item_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_low_stock"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_owner uuid;
  v_biz_name text;
begin
  -- Solo productos rastreados con umbral positivo.
  if NEW.stock_count is null then return NEW; end if;
  if coalesce(NEW.low_stock_threshold, 0) <= 0 then return NEW; end if;

  -- Solo en el CRUCE descendente: antes >= umbral (o nulo), ahora < umbral.
  if NEW.stock_count < NEW.low_stock_threshold
     and (OLD.stock_count is null or OLD.stock_count >= NEW.low_stock_threshold) then

    select b.owner_id, b.name into v_owner, v_biz_name
    from businesses b where b.id = NEW.business_id;

    if v_owner is not null then
      insert into notifications (user_id, type, payload)
      values (
        v_owner, 'low_stock',
        jsonb_build_object(
          'menu_item_id', NEW.id,
          'item_name',    NEW.name,
          'stock',        NEW.stock_count,
          'threshold',    NEW.low_stock_threshold,
          'business_id',  NEW.business_id,
          'business_name', v_biz_name
        )
      );
    end if;
  end if;

  return NEW;
end
$$;


ALTER FUNCTION "public"."notify_low_stock"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_comment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from public.posts where id = new.post_id;
  if v_owner is null or v_owner = new.user_id then return new; end if;
  if public.is_blocked(new.user_id, v_owner) then return new; end if;

  insert into public.notifications (user_id, type, payload)
  values (
    v_owner,
    'comment',
    jsonb_build_object(
      'post_id', new.post_id,
      'comment_id', new.id,
      'from_user_id', new.user_id,
      'actor_name', public.social_actor_name(new.user_id),
      'preview', left(coalesce(new.body, ''), 80)
    )
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."notify_on_comment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_follow"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.follower_id = new.following_id then return new; end if;
  if public.is_blocked(new.follower_id, new.following_id) then return new; end if;

  insert into public.notifications (user_id, type, payload)
  values (
    new.following_id,
    'follower',
    jsonb_build_object(
      'from_user_id', new.follower_id,
      'actor_name', public.social_actor_name(new.follower_id)
    )
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."notify_on_follow"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_follow_request"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.requester_id = new.target_id then return new; end if;
  if public.is_blocked(new.requester_id, new.target_id) then return new; end if;

  insert into public.notifications (user_id, type, payload)
  values (
    new.target_id,
    'follower',
    jsonb_build_object(
      'from_user_id', new.requester_id,
      'actor_name', public.social_actor_name(new.requester_id),
      'request', true
    )
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."notify_on_follow_request"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_post_like"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from public.posts where id = new.post_id;
  if v_owner is null or v_owner = new.user_id then return new; end if;
  if public.is_blocked(new.user_id, v_owner) then return new; end if;

  -- evitar duplicados si quita y vuelve a poner el like
  if exists (
    select 1 from public.notifications
    where user_id = v_owner and type = 'like'
      and payload->>'post_id' = new.post_id::text
      and payload->>'from_user_id' = new.user_id::text
      and created_at > now() - interval '1 day'
  ) then return new; end if;

  insert into public.notifications (user_id, type, payload)
  values (
    v_owner,
    'like',
    jsonb_build_object(
      'post_id', new.post_id,
      'from_user_id', new.user_id,
      'actor_name', public.social_actor_name(new.user_id)
    )
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."notify_on_post_like"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_order_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_biz text;
begin
  if new.user_id is null or new.status is not distinct from old.status then return new; end if;
  if new.status not in ('preparing','ready','delivered','cancelled') then return new; end if;
  select name into v_biz from public.businesses where id = new.business_id;
  insert into public.notifications (user_id, type, payload)
  values (new.user_id, 'order_status', jsonb_build_object(
    'order_id', new.id, 'order_number', new.order_number, 'business_id', new.business_id, 'business_name', v_biz,
    'status', new.status, 'order_type', new.order_type, 'table_label', new.table_label));
  return new;
end;
$$;


ALTER FUNCTION "public"."notify_order_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."open_tab_on_table"("p_table_id" "uuid", "p_name" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_biz uuid;
  v_emp uuid;
  v_waiters int;
  v_tab_id uuid;
  v_claimed boolean := false;
  v_name text;
  v_live int;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  v_name := nullif(btrim(coalesce(p_name, '')), '');
  if v_name is not null and char_length(v_name) > 40 then
    raise exception 'NAME_TOO_LONG';
  end if;

  select t.business_id into v_biz
  from public.tables t
  where t.id = p_table_id and t.is_active = true;
  if v_biz is null then raise exception 'TABLE_NOT_FOUND'; end if;

  select e.id into v_emp
  from public.employees e
  where e.business_id = v_biz and e.user_id = v_uid and e.status = 'accepted';
  if v_emp is null then raise exception 'NOT_EMPLOYEE'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_table_id::text, 0));

  select count(*) into v_waiters
  from public.table_waiters w
  where w.table_id = p_table_id;

  if v_waiters = 0 then
    insert into public.table_waiters (table_id, employee_id)
    values (p_table_id, v_emp);
    v_claimed := true;
  elsif not public.is_waiter_of_table(p_table_id) then
    raise exception 'NOT_ASSIGNED';
  end if;

  if v_name is null then
    select count(*) into v_live
    from public.table_tabs t
    where t.table_id = p_table_id and t.status <> 'closed';

    select 'Cuenta ' || n into v_name
    from generate_series(1, v_live + 1) as n
    where not exists (
      select 1 from public.table_tabs t
      where t.table_id = p_table_id
        and t.status <> 'closed'
        and t.name = 'Cuenta ' || n
    )
    order by n
    limit 1;
  end if;

  insert into public.table_tabs (table_id, name, created_by, kind, status)
  values (p_table_id, v_name, v_uid, 'waiter', 'open')
  returning id into v_tab_id;

  return jsonb_build_object(
    'tab_id', v_tab_id,
    'tab_name', v_name,
    'claimed_table', v_claimed
  );
end $$;


ALTER FUNCTION "public"."open_tab_on_table"("p_table_id" "uuid", "p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."order_auto_delivered"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.item_status = 'done' and old.item_status is distinct from 'done' then
    if not exists (select 1 from public.order_items i where i.order_id = new.order_id and i.item_status <> 'done') then
      update public.orders set status = 'delivered' where id = new.order_id and status in ('pending','confirmed','preparing','ready');
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."order_auto_delivered"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."order_notify_staff"("p_order_id" "uuid", "p_kind" "text", "p_note" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid := auth.uid(); v_o record; v_room uuid; v_id uuid; v_note text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_kind not in ('on_my_way','arrived','question') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  select o.id, o.business_id, o.user_id, o.room_id, o.status, o.order_type, o.table_label, o.order_number, o.created_at
    into v_o from public.orders o where o.id = p_order_id;
  if v_o.id is null or v_o.user_id is distinct from v_uid then raise exception 'not_your_order' using errcode = '42501'; end if;
  if v_o.status in ('cancelled') or v_o.created_at < now() - interval '12 hours' then
    raise exception 'order_closed' using errcode = '22023';
  end if;
  -- Límites: 1 aviso cada 2 min por pedido y máx. 6 por pedido
  if exists (select 1 from public.service_calls sc where sc.order_id = p_order_id and sc.created_at > now() - interval '2 minutes') then
    raise exception 'notice_cooldown' using errcode = '42501';
  end if;
  if (select count(*) from public.service_calls sc where sc.order_id = p_order_id) >= 6 then
    raise exception 'notice_limit' using errcode = '42501';
  end if;
  v_room := coalesce(v_o.room_id, (select r.id from public.rooms r where r.business_id = v_o.business_id and r.parent_room_id is null and r.is_active order by r.created_at limit 1));
  if v_room is null then raise exception 'no_room' using errcode = '22023'; end if;
  v_note := case p_kind when 'question' then nullif(left(trim(coalesce(p_note,'')), 200), '') else nullif(left(trim(coalesce(p_note,'')), 200), '') end;
  if p_kind = 'question' and v_note is null then raise exception 'note_required' using errcode = '22023'; end if;
  perform set_config('app.order_notify', 'on', true);
  insert into public.service_calls (room_id, business_id, user_id, status, type, notes, table_label, order_id)
  values (v_room, v_o.business_id, v_uid, 'pending', 'order',
          '#' || v_o.order_number || ' · ' || p_kind || coalesce(' · ' || v_note, ''), v_o.table_label, p_order_id)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'order_number', v_o.order_number, 'kind', p_kind);
end;
$$;


ALTER FUNCTION "public"."order_notify_staff"("p_order_id" "uuid", "p_kind" "text", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."orders_status_changed"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin if new.status is distinct from old.status then new.status_updated_at = now(); end if; return new; end; $$;


ALTER FUNCTION "public"."orders_status_changed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owns_business"("p_business" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (select 1 from public.businesses b where b.id = p_business and b.owner_id = (select auth.uid()));
$$;


ALTER FUNCTION "public"."owns_business"("p_business" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owns_business_of_table"("p_table_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1 from public.tables t
    join public.businesses b on b.id = t.business_id
    where t.id = p_table_id and b.owner_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."owns_business_of_table"("p_table_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owns_room_business"("p_room" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.rooms r join public.businesses b on b.id = r.business_id
    where r.id = p_room and b.owner_id = (select auth.uid())
  );
$$;


ALTER FUNCTION "public"."owns_room_business"("p_room" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_apply_external_payment"("p_business_id" "uuid", "p_table_id" "uuid", "p_method" "text", "p_tip_cents" integer DEFAULT 0, "p_payment_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_uid uuid := auth.uid(); v_mode text; v_open timestamptz; v_bal jsonb; v_due bigint;
  v_pid uuid; v_amount integer; v_row record; v_closed boolean; v_code text;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.pos_can_access(p_business_id) then raise exception 'NOT_ALLOWED'; end if;
  if p_method not in ('cash', 'card_external') then raise exception 'BAD_METHOD'; end if;
  select b.pos_payment_mode into v_mode from public.businesses b where b.id = p_business_id;
  if v_mode is distinct from 'external' then raise exception 'MODE_NOT_ALLOWED'; end if;
  if not (public.is_waiter_of_table(p_table_id) or public.owns_business_of_table(p_table_id)
          or not exists (select 1 from public.table_waiters tw where tw.table_id = p_table_id)) then
    raise exception 'NOT_ASSIGNED';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_table_id::text, 0));
  select t.session_opened_at into v_open from public.tables t where t.id = p_table_id and t.business_id = p_business_id;
  v_bal := public.pos_table_balance(p_business_id, p_table_id);
  v_due := (v_bal->>'due_cents')::bigint;
  if p_payment_id is not null then
    select * into v_row from public.pos_payments pp
     where pp.id = p_payment_id and pp.business_id = p_business_id and pp.table_id = p_table_id
       and pp.source = 'pos' and pp.status = 'pending' for update;
    if v_row.id is null then raise exception 'PAYMENT_NOT_PENDING'; end if;
    v_pid := v_row.id;
    update public.pos_payments set payment_method = p_method, paid_by = v_uid,
      session_opened_at = coalesce(session_opened_at, v_open), updated_at = now() where id = v_pid;
  else
    if v_due <= 0 then raise exception 'NOTHING_DUE'; end if;
    v_amount := v_due::integer;
    insert into public.pos_payments
      (business_id, table_id, amount_cents, kind, status, paid_by, session_opened_at, source, payment_method)
    values (p_business_id, p_table_id, v_amount, 'full', 'pending', v_uid, v_open, 'pos', p_method)
    returning id into v_pid;
  end if;
  v_closed := public.pos_apply_payment(v_pid, greatest(0, coalesce(p_tip_cents, 0)));
  v_code := translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/=', '-_');
  update public.pos_payments set receipt_code = coalesce(receipt_code, left(v_code, 22)) where id = v_pid;
  select receipt_code into v_code from public.pos_payments where id = v_pid;
  return jsonb_build_object('payment_id', v_pid, 'receipt_code', v_code, 'tab_closed', v_closed,
    'remaining_due_cents', (public.pos_table_balance(p_business_id, p_table_id)->>'due_cents')::bigint);
end $$;


ALTER FUNCTION "public"."pos_apply_external_payment"("p_business_id" "uuid", "p_table_id" "uuid", "p_method" "text", "p_tip_cents" integer, "p_payment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_apply_payment"("p_payment_id" "uuid", "p_tip_cents" integer) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_biz uuid; v_table uuid; v_ids uuid[]; v_status text; v_open timestamptz; v_bal jsonb;
begin
  select business_id, table_id, order_item_ids, status, session_opened_at into v_biz, v_table, v_ids, v_status, v_open
  from public.pos_payments where id = p_payment_id for update;
  if v_biz is null then raise exception 'payment not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_table::text, 0));
  if v_status <> 'succeeded' then
    update public.pos_payments set status = 'succeeded', tip_cents = greatest(0, coalesce(p_tip_cents, 0)), updated_at = now(),
      session_opened_at = coalesce(session_opened_at, (select t.session_opened_at from public.tables t where t.id = v_table))
     where id = p_payment_id;
    if v_ids is not null and array_length(v_ids, 1) is not null then
      update public.order_items set paid_at = now() where id = any(v_ids) and paid_at is null;
    else
      v_bal := public.pos_table_balance(v_biz, v_table);
      if (v_bal->>'due_cents')::bigint <= 0 then
        update public.order_items oi set paid_at = now() from public.orders o
         where oi.order_id = o.id and o.table_id = v_table and o.canceled_at is null and o.paid_at is null and oi.paid_at is null
           and coalesce(o.approval_status, 'approved') <> 'awaiting';
      end if;
    end if;
    update public.orders o set paid_at = now()
     where o.table_id = v_table and o.paid_at is null and o.canceled_at is null
       and coalesce(o.approval_status, 'approved') <> 'awaiting'
       and not exists (select 1 from public.order_items oi where oi.order_id = o.id and oi.paid_at is null);
  end if;
  return not exists (select 1 from public.orders o join public.order_items oi on oi.order_id = o.id
    where o.table_id = v_table and o.canceled_at is null and o.paid_at is null and oi.paid_at is null
      and coalesce(o.approval_status, 'approved') <> 'awaiting');
end $$;


ALTER FUNCTION "public"."pos_apply_payment"("p_payment_id" "uuid", "p_tip_cents" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_apply_stock_movement"("p_business_id" "uuid", "p_menu_item_id" "uuid", "p_mode" "text", "p_quantity" integer, "p_note" "text" DEFAULT NULL::"text") RETURNS TABLE("new_stock" integer, "movement_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_has_perm boolean;
  v_current integer;
  v_delta integer;
  v_reason text;
begin
  if v_uid is null then raise exception 'forbidden' using errcode='42501'; end if;
  if p_quantity is null or p_quantity < 0 or p_quantity > 1000000 then
    raise exception 'bad_quantity';
  end if;

  -- permiso: empleado aceptado con inventory_manage en ESE negocio, o dueño
  select exists (
    select 1 from employees e
    join custom_roles cr on cr.id = e.custom_role_id
    where e.business_id = p_business_id and e.user_id = v_uid
      and e.status = 'accepted'
      and coalesce((cr.permissions->>'inventory_manage')::boolean, false)
  ) or exists (
    select 1 from businesses b where b.id = p_business_id and b.owner_id = v_uid
  ) into v_has_perm;
  if not v_has_perm then raise exception 'forbidden' using errcode='42501'; end if;

  -- item del negocio, con lock (atómico)
  select stock_count into v_current from menu_items
    where id = p_menu_item_id and business_id = p_business_id for update;
  if not found then raise exception 'item_not_found'; end if;

  if p_mode = 'count' then      v_delta := p_quantity - coalesce(v_current,0); v_reason := 'count';
  elsif p_mode = 'receive' then v_delta := p_quantity;                          v_reason := 'received';
  elsif p_mode = 'waste' then   v_delta := -p_quantity;                         v_reason := 'waste';
  else raise exception 'bad_mode'; end if;

  update menu_items set stock_count = greatest(0, coalesce(stock_count,0) + v_delta)
    where id = p_menu_item_id returning stock_count into v_current;

  insert into stock_movements (menu_item_id, business_id, delta, reason, created_by)
    values (p_menu_item_id, p_business_id, v_delta,
            case when p_note is not null and length(trim(p_note)) > 0
                 then v_reason || ': ' || left(trim(p_note), 200)
                 else v_reason end,
            v_uid)
    returning id into movement_id;

  new_stock := v_current;
  return next;
end $$;


ALTER FUNCTION "public"."pos_apply_stock_movement"("p_business_id" "uuid", "p_menu_item_id" "uuid", "p_mode" "text", "p_quantity" integer, "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_approve_order"("p_business_id" "uuid", "p_order_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_uid uuid := auth.uid(); v_table uuid; v_status text; v_label text;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not (public.pos_can_access(p_business_id) or exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = v_uid)) then
    raise exception 'NOT_ALLOWED';
  end if;
  select o.table_id, o.approval_status, o.table_label into v_table, v_status, v_label
    from public.orders o where o.id = p_order_id and o.business_id = p_business_id for update;
  if v_status is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_status <> 'awaiting' then raise exception 'NOT_AWAITING'; end if;
  if v_table is not null and exists (select 1 from public.table_waiters tw where tw.table_id = v_table)
     and not (public.is_waiter_of_table(v_table) or public.owns_business_of_table(v_table)) then
    raise exception 'NOT_ASSIGNED';
  end if;
  if v_table is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_table::text, 0));
    update public.tables t set
      access_code = coalesce(t.access_code, public.generate_table_access_code(p_business_id)),
      session_opened_at = coalesce(t.session_opened_at, now()),
      session_opened_by = coalesce(t.session_opened_by, v_uid)
    where t.id = v_table;
  end if;
  update public.orders set approval_status = 'approved', approved_by = v_uid, approved_at = now(),
    taken_by = coalesce(public.resolve_table_waiter_for_attribution(v_table), v_uid), status_updated_at = now()
  where id = p_order_id;
  return jsonb_build_object('approved', true, 'order_id', p_order_id, 'table_id', v_table, 'table_label', v_label);
end; $$;


ALTER FUNCTION "public"."pos_approve_order"("p_business_id" "uuid", "p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_awaiting_orders"("p_business_id" "uuid") RETURNS TABLE("order_id" "uuid", "table_id" "uuid", "table_label" "text", "created_at" timestamp with time zone, "contact_name" "text", "notes" "text", "subtotal_cents" integer, "guest_device_id" "text", "device_strikes" integer, "items" "jsonb")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select o.id, o.table_id, o.table_label, o.created_at, o.contact_name, o.notes, o.subtotal_cents, o.guest_device_id,
         (select count(*)::int from public.guest_device_strikes s where s.business_id = o.business_id and s.device_id = o.guest_device_id and s.created_at > now() - interval '30 days') as device_strikes,
         (select coalesce(jsonb_agg(jsonb_build_object('order_item_id', oi.id, 'menu_item_id', oi.menu_item_id, 'name', mi.name,
            'qty', oi.qty, 'price_cents', oi.price_cents, 'options', oi.options, 'special_instructions', oi.special_instructions, 'seat', oi.seat, 'station', mi.station) order by oi.id), '[]'::jsonb)
           from public.order_items oi join public.menu_items mi on mi.id = oi.menu_item_id where oi.order_id = o.id) as items
  from public.orders o
  where o.business_id = p_business_id
    and (public.pos_can_access(p_business_id) or exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = auth.uid()))
    and o.approval_status = 'awaiting' and o.canceled_at is null
  order by o.created_at asc;
$$;


ALTER FUNCTION "public"."pos_awaiting_orders"("p_business_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_business_settings"("p_business_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select case
    when public.pos_can_access(p_business_id)
      or exists (
        select 1 from public.businesses o
        where o.id = p_business_id and o.owner_id = auth.uid()
      )
    then (
      select jsonb_build_object(
        'pos_payment_mode', b.pos_payment_mode,
        'kds_settings',     coalesce(b.kds_settings, '{}'::jsonb)
      )
      from public.businesses b
      where b.id = p_business_id
    )
    else null
  end;
$$;


ALTER FUNCTION "public"."pos_business_settings"("p_business_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."pos_business_settings"("p_business_id" "uuid") IS 'Ajustes del negocio para el handheld: {pos_payment_mode, kds_settings}. Solo staff con pos_access o el dueño; null si no hay acceso. F1.';


CREATE OR REPLACE FUNCTION "public"."pos_can_access"("p_business_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.employees e
    join public.custom_roles cr on cr.id = e.custom_role_id
    where e.user_id = auth.uid() and e.business_id = p_business_id
      and e.status = 'accepted'
      and coalesce((cr.permissions->>'pos_access')::boolean, false) = true
  );
$$;


ALTER FUNCTION "public"."pos_can_access"("p_business_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_claim_comanda_print"("p_business_id" "uuid", "p_order_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_uid uuid := auth.uid(); v_won int;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not (public.pos_can_access(p_business_id) or exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = v_uid)) then
    raise exception 'NOT_ALLOWED';
  end if;
  update public.orders o
     set comanda_claimed_at = now(), comanda_claimed_by = v_uid
   where o.id = p_order_id and o.business_id = p_business_id
     and o.comanda_printed_at is null and o.canceled_at is null
     and coalesce(o.approval_status, 'approved') <> 'awaiting'
     and (o.comanda_claimed_at is null or o.comanda_claimed_at < now() - interval '2 minutes');
  get diagnostics v_won = row_count;
  return v_won = 1;
end;
$$;


ALTER FUNCTION "public"."pos_claim_comanda_print"("p_business_id" "uuid", "p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_close_table_session"("p_business_id" "uuid", "p_table_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not (public.pos_can_access(p_business_id) or exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = v_uid)) then
    raise exception 'NOT_ALLOWED';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_table_id::text, 0));
  if exists (select 1 from public.orders o where o.table_id = p_table_id and o.business_id = p_business_id and o.paid_at is null and o.canceled_at is null) then
    raise exception 'TABLE_HAS_OPEN_ORDERS';
  end if;
  update public.tables set access_code = null, session_opened_at = null, session_opened_by = null where id = p_table_id and business_id = p_business_id;
  update public.guest_tab_sessions set revoked_at = now() where table_id = p_table_id and revoked_at is null;
  return jsonb_build_object('closed', true);
end;
$$;


ALTER FUNCTION "public"."pos_close_table_session"("p_business_id" "uuid", "p_table_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."pos_close_table_session"("p_business_id" "uuid", "p_table_id" "uuid") IS 'Cierre manual de sesión de mesa sin órdenes abiertas. F2 + F3 (revoca guest_tab_sessions).';


CREATE OR REPLACE FUNCTION "public"."pos_combine_tables"("p_business_id" "uuid", "p_primary_table_id" "uuid", "p_secondary_table_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_pri_biz uuid; v_pri_combined uuid;
  v_sec_biz uuid; v_sec_combined uuid; v_sec_party integer;
  v_sec_open integer; v_sec_is_primary integer;
begin
  if not public.pos_can_access(p_business_id) then raise exception 'no pos access'; end if;
  if p_primary_table_id = p_secondary_table_id then raise exception 'same table'; end if;
  select t.business_id, t.combined_into into v_pri_biz, v_pri_combined from public.tables t where t.id = p_primary_table_id and t.is_active;
  if v_pri_biz is null then raise exception 'primary not found'; end if;
  if v_pri_biz <> p_business_id then raise exception 'primary not in this business'; end if;
  if v_pri_combined is not null then raise exception 'primary is itself annexed'; end if;
  select t.business_id, t.combined_into, t.party_size into v_sec_biz, v_sec_combined, v_sec_party from public.tables t where t.id = p_secondary_table_id and t.is_active;
  if v_sec_biz is null then raise exception 'secondary not found'; end if;
  if v_sec_biz <> p_business_id then raise exception 'secondary not in this business'; end if;
  if v_sec_combined is not null then raise exception 'secondary already combined'; end if;
  if coalesce(v_sec_party, 0) > 0 then raise exception 'secondary in use'; end if;
  select count(*) into v_sec_open from public.orders o where o.table_id = p_secondary_table_id and o.paid_at is null and o.canceled_at is null;
  if v_sec_open > 0 then raise exception 'secondary has open orders'; end if;
  select count(*) into v_sec_is_primary from public.tables t where t.combined_into = p_secondary_table_id;
  if v_sec_is_primary > 0 then raise exception 'secondary is a primary'; end if;
  update public.tables set access_code = null, session_opened_at = null, session_opened_by = null where id = p_secondary_table_id;
  update public.tables set combined_into = p_primary_table_id where id = p_secondary_table_id;
end; $$;


ALTER FUNCTION "public"."pos_combine_tables"("p_business_id" "uuid", "p_primary_table_id" "uuid", "p_secondary_table_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_create_check"("p_business_id" "uuid", "p_table_id" "uuid", "p_order_item_ids" "uuid"[]) RETURNS TABLE("payment_id" "uuid", "amount_cents" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_amount bigint; v_seat integer; v_kind text; v_pid uuid;
begin
  if not public.pos_can_access(p_business_id) then raise exception 'no pos access'; end if;
  if p_order_item_ids is null or array_length(p_order_item_ids, 1) is null then raise exception 'no items'; end if;
  if public.pos_session_split_method(p_business_id, p_table_id) = 'amount' then raise exception 'METHOD_LOCKED_AMOUNT'; end if;
  if exists (select 1 from unnest(p_order_item_ids) x where not exists (
      select 1 from public.orders o join public.order_items oi on oi.order_id = o.id
      where oi.id = x and o.business_id = p_business_id and o.table_id = p_table_id
        and o.canceled_at is null and o.paid_at is null and oi.paid_at is null)) then
    raise exception 'invalid or already-paid item';
  end if;
  select coalesce(sum(oi.price_cents * oi.qty), 0) into v_amount from public.order_items oi where oi.id = any(p_order_item_ids);
  if v_amount <= 0 then raise exception 'zero amount'; end if;
  select case when count(distinct oi.seat) = 1 and count(*) = count(oi.seat) then min(oi.seat) else null end into v_seat
  from public.order_items oi where oi.id = any(p_order_item_ids);
  v_kind := case when v_seat is not null then 'seat' else 'custom' end;
  insert into public.pos_payments (business_id, table_id, amount_cents, kind, seat, order_item_ids, status, paid_by, session_opened_at, source)
  values (p_business_id, p_table_id, v_amount::integer, v_kind, v_seat, p_order_item_ids, 'pending', auth.uid(),
    (select t.session_opened_at from public.tables t where t.id = p_table_id), 'pos')
  returning id into v_pid;
  return query select v_pid, v_amount::integer;
end $$;


ALTER FUNCTION "public"."pos_create_check"("p_business_id" "uuid", "p_table_id" "uuid", "p_order_item_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_create_order"("p_business_id" "uuid", "p_table_id" "uuid", "p_items" "jsonb", "p_notes" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_uid uuid := auth.uid(); v_emp public.employees; v_has_pos boolean; v_order_id uuid;
  v_subtotal bigint := 0; v_item jsonb; v_mi_id uuid; v_qty integer; v_base integer; v_unit integer;
  v_upcharge integer; v_options jsonb; v_mod jsonb; v_group_id uuid; v_grp record; v_label text;
  v_choice jsonb; v_found boolean; v_cnt integer; v_table_label text; v_sales_loc uuid; v_sbl_upd integer;
begin
  select e.* into v_emp from public.employees e where e.user_id = v_uid and e.business_id = p_business_id and e.status = 'accepted' limit 1;
  if not found then raise exception 'not an active employee of this business'; end if;
  select coalesce((cr.permissions->>'pos_access')::boolean, false) into v_has_pos from public.custom_roles cr where cr.id = v_emp.custom_role_id;
  if not coalesce(v_has_pos, false) then raise exception 'no pos access'; end if;
  if p_table_id is not null then
    select t.label into v_table_label from public.tables t where t.id = p_table_id and t.business_id = p_business_id;
    if not found then raise exception 'table not in this business'; end if;
  end if;
  -- F2: apertura automática de sesión de mesa en la primera orden
  if p_table_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_table_id::text, 0));
    update public.tables t set
      access_code = coalesce(t.access_code, public.generate_table_access_code(p_business_id)),
      session_opened_at = coalesce(t.session_opened_at, now()),
      session_opened_by = coalesce(t.session_opened_by, v_uid)
    where t.id = p_table_id;
  end if;
  select b.sales_location_id into v_sales_loc from public.businesses b where b.id = p_business_id;
  insert into public.orders (business_id, table_id, table_label, order_type, status, taken_by, notes)
  values (p_business_id, p_table_id, v_table_label, 'table', 'preparing', v_uid, p_notes) returning id into v_order_id;
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_mi_id := (v_item->>'menu_item_id')::uuid;
    v_qty := greatest(coalesce((v_item->>'qty')::integer, 1), 1);
    select mi.price_cents into v_base from public.menu_items mi where mi.id = v_mi_id and mi.business_id = p_business_id and mi.is_available = true;
    if not found then raise exception 'menu item % not available', v_mi_id; end if;
    v_upcharge := 0; v_options := coalesce(v_item->'options', '{}'::jsonb);
    if v_options ? 'modifiers' then
      for v_mod in select * from jsonb_array_elements(v_options->'modifiers')
      loop
        v_group_id := (v_mod->>'group_id')::uuid;
        if not exists (select 1 from public.menu_item_modifier_groups l where l.menu_item_id = v_mi_id and l.modifier_group_id = v_group_id) then
          raise exception 'modifier group % not linked to item', v_group_id;
        end if;
        select mg.type, mg.min_select, mg.max_select, mg.choices into v_grp from public.modifier_groups mg where mg.id = v_group_id and mg.business_id = p_business_id;
        if not found then raise exception 'modifier group % not found', v_group_id; end if;
        v_cnt := coalesce(jsonb_array_length(v_mod->'choice_labels'), 0);
        if v_cnt < v_grp.min_select or v_cnt > v_grp.max_select then raise exception 'invalid selection count for group %', v_group_id; end if;
        for v_label in select jsonb_array_elements_text(v_mod->'choice_labels')
        loop
          v_found := false;
          for v_choice in select * from jsonb_array_elements(v_grp.choices)
          loop
            if (v_choice->>'label') = v_label then
              v_upcharge := v_upcharge + coalesce((v_choice->>'price_cents')::integer, 0); v_found := true; exit;
            end if;
          end loop;
          if not v_found then raise exception 'invalid choice % for group %', v_label, v_group_id; end if;
        end loop;
      end loop;
    end if;
    v_unit := v_base + v_upcharge;
    insert into public.order_items (order_id, menu_item_id, qty, price_cents, options, special_instructions, seat)
    values (v_order_id, v_mi_id, v_qty, v_unit, v_options, nullif(v_item->>'special_instructions',''), (v_item->>'seat')::integer);
    v_sbl_upd := 0;
    if v_sales_loc is not null then
      update public.stock_by_location set qty = greatest(0, qty - v_qty), updated_at = now()
       where menu_item_id = v_mi_id and location_id = v_sales_loc and business_id = p_business_id;
      get diagnostics v_sbl_upd = row_count;
      if v_sbl_upd > 0 then
        insert into public.stock_movements (menu_item_id, business_id, delta, reason, created_by) values (v_mi_id, p_business_id, -v_qty, 'sale', v_uid);
      end if;
    end if;
    if v_sbl_upd = 0 then
      update public.menu_items set stock_count = greatest(0, stock_count - v_qty) where id = v_mi_id and business_id = p_business_id and stock_count is not null;
      if found then
        insert into public.stock_movements (menu_item_id, business_id, delta, reason, created_by) values (v_mi_id, p_business_id, -v_qty, 'sale', v_uid);
      end if;
    end if;
    v_subtotal := v_subtotal + (v_unit::bigint * v_qty);
  end loop;
  if v_subtotal = 0 then raise exception 'order has no valid items'; end if;
  update public.orders set subtotal_cents = v_subtotal, total_cents = v_subtotal where id = v_order_id;
  insert into public.notifications (user_id, type, payload)
  select distinct e2.user_id, 'pos_order_assist',
    jsonb_build_object('order_id', v_order_id, 'table_id', p_table_id, 'table_label', v_table_label, 'helper_user_id', v_uid, 'business_id', p_business_id)
  from public.table_waiters tw join public.employees e2 on e2.id = tw.employee_id
  where tw.table_id = p_table_id and tw.business_id = p_business_id and e2.user_id <> v_uid;
  return v_order_id;
end; $$;


ALTER FUNCTION "public"."pos_create_order"("p_business_id" "uuid", "p_table_id" "uuid", "p_items" "jsonb", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_create_split"("p_business_id" "uuid", "p_table_id" "uuid", "p_method" "text", "p_ways" integer, "p_checks" "jsonb") RETURNS TABLE("payment_id" "uuid", "kind" "text", "seat" integer, "amount_cents" integer, "order_item_ids" "uuid"[])
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_session_opened_at timestamptz; v_bal jsonb; v_tab_total bigint; v_base bigint; v_rem bigint; v_i int;
  v_check jsonb; v_items uuid[]; v_amount bigint; v_vseat integer; v_pid uuid; v_method text;
begin
  if not public.pos_can_access(p_business_id) then raise exception 'no pos access'; end if;
  v_bal := public.pos_table_balance(p_business_id, p_table_id);
  v_tab_total := (v_bal->>'due_cents')::bigint;
  if v_tab_total <= 0 then raise exception 'nothing to split'; end if;
  v_method := public.pos_session_split_method(p_business_id, p_table_id);
  if v_method = 'amount' and p_method = 'items' then raise exception 'METHOD_LOCKED_AMOUNT'; end if;
  if v_method = 'items' and p_method = 'even' then raise exception 'METHOD_LOCKED_ITEMS'; end if;
  select t.session_opened_at into v_session_opened_at from public.tables t where t.id = p_table_id;
  delete from public.pos_payments where table_id = p_table_id and status = 'pending' and source = 'pos';
  if p_method = 'even' then
    if p_ways is null or p_ways < 2 then raise exception 'invalid ways'; end if;
    v_base := v_tab_total / p_ways; v_rem := v_tab_total - v_base * p_ways;
    for v_i in 1..p_ways loop
      insert into public.pos_payments
        (business_id, table_id, amount_cents, kind, seat, order_item_ids, status, paid_by, session_opened_at, source)
      values (p_business_id, p_table_id, (v_base + case when v_i <= v_rem then 1 else 0 end)::integer,
         'even', null, null, 'pending', auth.uid(), v_session_opened_at, 'pos')
      returning id into v_pid;
      return query select v_pid, 'even'::text, null::integer,
        (v_base + case when v_i <= v_rem then 1 else 0 end)::integer, null::uuid[];
    end loop;
  elsif p_method = 'items' then
    if p_checks is null or jsonb_array_length(p_checks) = 0 then raise exception 'checks required for items split'; end if;
    for v_check in select * from jsonb_array_elements(p_checks) loop
      v_items := array(select (elem.value #>> '{}')::uuid from jsonb_array_elements(v_check->'order_item_ids') as elem);
      v_vseat := (v_check->>'seat')::integer;
      if v_items is null or array_length(v_items, 1) is null then continue; end if;
      if exists (select 1 from unnest(v_items) x where not exists (
          select 1 from public.orders o join public.order_items oi on oi.order_id = o.id
          where oi.id = x and o.business_id = p_business_id and o.table_id = p_table_id
            and o.canceled_at is null and o.paid_at is null and oi.paid_at is null)) then
        raise exception 'invalid or already-paid item';
      end if;
      select coalesce(sum(oi.price_cents * oi.qty), 0) into v_amount from public.order_items oi where oi.id = any(v_items);
      insert into public.pos_payments
        (business_id, table_id, amount_cents, kind, seat, order_item_ids, status, paid_by, session_opened_at, source)
      values (p_business_id, p_table_id, v_amount::integer, 'seat', v_vseat, v_items, 'pending', auth.uid(), v_session_opened_at, 'pos')
      returning id into v_pid;
      return query select v_pid, 'seat'::text, v_vseat, v_amount::integer, v_items;
    end loop;
  else raise exception 'unknown method: %', p_method; end if;
end $$;


ALTER FUNCTION "public"."pos_create_split"("p_business_id" "uuid", "p_table_id" "uuid", "p_method" "text", "p_ways" integer, "p_checks" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_daily_payment_summary"("p_business_id" "uuid", "p_day" "date" DEFAULT NULL::"date") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_tz    text    := 'America/New_York';
  v_is_owner boolean;
  v_day   date;
  v_start timestamptz;
  v_end   timestamptz;
  v_out   jsonb;
begin
  v_is_owner := exists (
    select 1 from public.businesses b
    where b.id = p_business_id and b.owner_id = auth.uid()
  );
  if not (v_is_owner or public.is_employee_of_business(p_business_id)) then
    raise exception 'NOT_ALLOWED';
  end if;

  v_day   := coalesce(p_day, (now() at time zone v_tz)::date);
  v_start := (v_day::text || ' 00:00:00')::timestamp at time zone v_tz;
  v_end   := ((v_day + 1)::text || ' 00:00:00')::timestamp at time zone v_tz;

  select jsonb_build_object(
    'day',      v_day,
    'timezone', v_tz,
    'by_method', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'payment_method', m.payment_method,
          'count',          m.cnt,
          'sales_cents',    m.sales,
          'tips_cents',     m.tips,
          'total_cents',    m.sales + m.tips
        ) order by m.payment_method
      )
      from (
        select
          coalesce(pp.payment_method, 'unknown') as payment_method,
          count(*)                               as cnt,
          sum(pp.amount_cents)                   as sales,
          sum(coalesce(pp.tip_cents, 0))         as tips
        from public.pos_payments pp
        where pp.business_id = p_business_id
          and pp.status      = 'succeeded'
          and pp.created_at >= v_start
          and pp.created_at  < v_end
        group by coalesce(pp.payment_method, 'unknown')
      ) m
    ), '[]'::jsonb),
    'totals', (
      select jsonb_build_object(
        'count',       coalesce(count(*), 0),
        'sales_cents', coalesce(sum(pp.amount_cents), 0),
        'tips_cents',  coalesce(sum(coalesce(pp.tip_cents, 0)), 0),
        'total_cents', coalesce(sum(pp.amount_cents + coalesce(pp.tip_cents, 0)), 0)
      )
      from public.pos_payments pp
      where pp.business_id = p_business_id
        and pp.status      = 'succeeded'
        and pp.created_at >= v_start
        and pp.created_at  < v_end
    )
  ) into v_out;

  return v_out;
end $$;


ALTER FUNCTION "public"."pos_daily_payment_summary"("p_business_id" "uuid", "p_day" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_guest_claim_share"("p_payment_id" "uuid", "p_guest_session_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_n int;
begin
  update public.pos_payments set status = 'processing', claimed_at = now(), guest_session_id = p_guest_session_id, updated_at = now()
   where id = p_payment_id and source = 'guest' and kind = 'guest_even'
     and (status = 'pending' or (status = 'processing' and claimed_at < now() - interval '10 minutes'));
  get diagnostics v_n = row_count;
  return v_n = 1;
end $$;


ALTER FUNCTION "public"."pos_guest_claim_share"("p_payment_id" "uuid", "p_guest_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_guest_even_plan"("p_business_id" "uuid", "p_table_id" "uuid", "p_ways" integer) RETURNS TABLE("payment_id" "uuid", "amount_cents" integer, "status" "text", "claimable" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_open timestamptz; v_due bigint; v_base bigint; v_rem bigint; v_i int; v_exists int;
begin
  select t.session_opened_at into v_open from public.tables t where t.id = p_table_id and t.business_id = p_business_id;
  if v_open is null then raise exception 'NO_SESSION'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_table_id::text, 0));
  select count(*) into v_exists from public.pos_payments pp
  where pp.table_id = p_table_id and pp.session_opened_at = v_open
    and pp.source = 'guest' and pp.kind = 'guest_even' and pp.status in ('pending', 'processing', 'succeeded');
  if v_exists = 0 then
    if p_ways is null or p_ways < 2 or p_ways > 20 then raise exception 'INVALID_WAYS'; end if;
    v_due := (public.pos_table_balance(p_business_id, p_table_id)->>'due_cents')::bigint;
    if v_due <= 0 then raise exception 'NOTHING_DUE'; end if;
    v_base := v_due / p_ways; v_rem := v_due - v_base * p_ways;
    for v_i in 1..p_ways loop
      insert into public.pos_payments
        (business_id, table_id, amount_cents, kind, order_item_ids, status, source, session_opened_at)
      values (p_business_id, p_table_id, (v_base + case when v_i <= v_rem then 1 else 0 end)::int,
        'guest_even', null, 'pending', 'guest', v_open);
    end loop;
  end if;
  return query select pp.id, pp.amount_cents, pp.status,
    (pp.status = 'pending' or (pp.status = 'processing' and pp.claimed_at < now() - interval '10 minutes')) as claimable
  from public.pos_payments pp
  where pp.table_id = p_table_id and pp.session_opened_at = v_open and pp.source = 'guest' and pp.kind = 'guest_even'
  order by pp.created_at, pp.id;
end $$;


ALTER FUNCTION "public"."pos_guest_even_plan"("p_business_id" "uuid", "p_table_id" "uuid", "p_ways" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_guest_table_summary"("p_business_id" "uuid", "p_table_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select jsonb_build_object(
    'balance', public.pos_table_balance(p_business_id, p_table_id),
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
        'order_item_id', oi.id, 'order_id', o.id, 'name', mi.name, 'qty', oi.qty,
        'line_cents', oi.price_cents * oi.qty, 'paid', (oi.paid_at is not null),
        'reserved', exists (select 1 from public.pos_payments pp where pp.status = 'processing' and pp.claimed_at > now() - interval '10 minutes' and oi.id = any(pp.order_item_ids)),
        'guest_session_id', o.guest_session_id) order by o.created_at, oi.id), '[]'::jsonb)
      from public.orders o join public.order_items oi on oi.order_id = o.id join public.menu_items mi on mi.id = oi.menu_item_id
      where o.business_id = p_business_id and o.table_id = p_table_id and o.canceled_at is null
        and coalesce(o.approval_status, 'approved') <> 'awaiting'
        and o.created_at >= coalesce((select t.session_opened_at from public.tables t where t.id = p_table_id), o.created_at)),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object('amount_cents', pp.amount_cents, 'tip_cents', pp.tip_cents, 'source', pp.source, 'kind', pp.kind, 'at', pp.updated_at) order by pp.updated_at), '[]'::jsonb)
      from public.pos_payments pp where pp.business_id = p_business_id and pp.table_id = p_table_id and pp.status = 'succeeded'
        and pp.session_opened_at = (select t.session_opened_at from public.tables t where t.id = p_table_id)));
$$;


ALTER FUNCTION "public"."pos_guest_table_summary"("p_business_id" "uuid", "p_table_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_kds_metrics"("p_business_id" "uuid", "p_from" timestamp with time zone DEFAULT ("now"() - '7 days'::interval), "p_to" timestamp with time zone DEFAULT "now"()) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_result jsonb;
begin
  if not public.pos_can_access(p_business_id) then raise exception 'no pos access'; end if;
  with m as (
    select mi.station, mi.name,
           extract(epoch from (oi.preparing_at - oi.created_at)) as queue_s,
           extract(epoch from (oi.ready_at - oi.preparing_at)) as prep_s,
           extract(epoch from (oi.done_at - oi.ready_at)) as pickup_s
    from public.orders o join public.order_items oi on oi.order_id = o.id join public.menu_items mi on mi.id = oi.menu_item_id
    where o.business_id = p_business_id and o.canceled_at is null
      and coalesce(o.approval_status,'approved') <> 'awaiting'
      and oi.created_at >= p_from and oi.created_at < p_to
  )
  select jsonb_build_object(
    'overall', (select jsonb_build_object('count', count(*),
        'queue_secs', round(avg(queue_s) filter (where queue_s is not null)),
        'prep_secs', round(avg(prep_s) filter (where prep_s is not null)),
        'pickup_secs', round(avg(pickup_s) filter (where pickup_s is not null))) from m),
    'by_station', (select coalesce(jsonb_agg(jsonb_build_object('station', station, 'count', cnt,
        'queue_secs', queue_secs, 'prep_secs', prep_secs, 'pickup_secs', pickup_secs) order by station), '[]'::jsonb)
      from (select station, count(*) cnt,
        round(avg(queue_s) filter (where queue_s is not null)) queue_secs,
        round(avg(prep_s) filter (where prep_s is not null)) prep_secs,
        round(avg(pickup_s) filter (where pickup_s is not null)) pickup_secs
        from m group by station) s),
    'slowest_prep', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'count', cnt, 'prep_secs', prep_secs) order by prep_secs desc nulls last), '[]'::jsonb)
      from (select name, count(*) cnt, round(avg(prep_s) filter (where prep_s is not null)) prep_secs
        from m group by name having count(*) filter (where prep_s is not null) > 0
        order by prep_secs desc nulls last limit 5) t)
  ) into v_result;
  return v_result;
end; $$;


ALTER FUNCTION "public"."pos_kds_metrics"("p_business_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_kds_metrics_v2"("p_business_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_station" "text" DEFAULT NULL::"text", "p_taken_by" "uuid" DEFAULT NULL::"uuid", "p_tz" "text" DEFAULT 'UTC'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_result jsonb; v_len interval := p_to - p_from;
begin
  if not (exists (select 1 from public.businesses bz where bz.id = p_business_id and bz.owner_id = auth.uid()) or public.pos_can_access(p_business_id)) then
    raise exception 'no pos access';
  end if;
  with base as (
    select mi.station, mi.name, o.taken_by, oi.created_at,
           extract(epoch from (oi.preparing_at - oi.created_at)) as queue_s,
           extract(epoch from (oi.ready_at - oi.preparing_at)) as prep_s,
           extract(epoch from (oi.done_at - oi.ready_at)) as pickup_s,
           extract(epoch from (oi.done_at - oi.created_at)) as wait_s,
           extract(hour from (oi.created_at at time zone p_tz))::int as hr,
           coalesce((mi.sla->>'pending_mins')::numeric, (b.kds_settings->'sla'->>'pending_mins')::numeric) * 60 as thr_queue_s,
           coalesce((mi.sla->>'preparing_mins')::numeric, (b.kds_settings->'sla'->>'preparing_mins')::numeric) * 60 as thr_prep_s,
           coalesce((mi.sla->>'ready_mins')::numeric, (b.kds_settings->'sla'->>'ready_mins')::numeric) * 60 as thr_pickup_s
    from public.orders o join public.order_items oi on oi.order_id = o.id join public.menu_items mi on mi.id = oi.menu_item_id join public.businesses b on b.id = o.business_id
    where o.business_id = p_business_id and o.canceled_at is null
      and coalesce(o.approval_status,'approved') <> 'awaiting'
      and oi.created_at >= (p_from - v_len) and oi.created_at < p_to
      and (p_station is null or mi.station = p_station) and (p_taken_by is null or o.taken_by = p_taken_by)
  ), scored as (
    select base.*, (created_at >= p_from) as in_cur,
      case when (thr_queue_s is not null and queue_s is not null) or (thr_prep_s is not null and prep_s is not null) or (thr_pickup_s is not null and pickup_s is not null)
        then case when (thr_queue_s is not null and queue_s is not null and queue_s > thr_queue_s)
          or (thr_prep_s is not null and prep_s is not null and prep_s > thr_prep_s)
          or (thr_pickup_s is not null and pickup_s is not null and pickup_s > thr_pickup_s)
          then 0 else 1 end else null end as sla_ok
    from base
  ), cur as (select * from scored where in_cur)
  select jsonb_build_object(
    'overall', (select jsonb_build_object('count', count(*),
        'queue_secs', round(avg(queue_s) filter (where queue_s is not null)),
        'prep_secs', round(avg(prep_s) filter (where prep_s is not null)),
        'pickup_secs', round(avg(pickup_s) filter (where pickup_s is not null)),
        'sla_pct', round(avg(sla_ok) filter (where sla_ok is not null) * 100)) from cur),
    'prev', (select jsonb_build_object('count', count(*),
        'queue_secs', round(avg(queue_s) filter (where queue_s is not null)),
        'prep_secs', round(avg(prep_s) filter (where prep_s is not null)),
        'pickup_secs', round(avg(pickup_s) filter (where pickup_s is not null)),
        'sla_pct', round(avg(sla_ok) filter (where sla_ok is not null) * 100)) from scored where not in_cur),
    'by_station', (select coalesce(jsonb_agg(jsonb_build_object('station', station, 'count', cnt,
        'queue_secs', q, 'prep_secs', p, 'pickup_secs', pk, 'sla_pct', sp) order by station), '[]'::jsonb)
      from (select station, count(*) cnt,
        round(avg(queue_s) filter (where queue_s is not null)) q,
        round(avg(prep_s) filter (where prep_s is not null)) p,
        round(avg(pickup_s) filter (where pickup_s is not null)) pk,
        round(avg(sla_ok) filter (where sla_ok is not null) * 100) sp
        from cur group by station) s),
    'by_waiter', (select coalesce(jsonb_agg(jsonb_build_object('taken_by', taken_by, 'count', cnt,
        'wait_secs', w, 'pickup_secs', pk, 'sla_pct', sp) order by cnt desc), '[]'::jsonb)
      from (select taken_by, count(*) cnt,
        round(avg(wait_s) filter (where wait_s is not null)) w,
        round(avg(pickup_s) filter (where pickup_s is not null)) pk,
        round(avg(sla_ok) filter (where sla_ok is not null) * 100) sp
        from cur group by taken_by) w),
    'by_hour', (select coalesce(jsonb_agg(jsonb_build_object('hour', hr, 'count', cnt) order by hr), '[]'::jsonb)
      from (select hr, count(*) cnt from cur group by hr) h),
    'slowest', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'count', cnt, 'prep_secs', p, 'sla_secs', ss, 'over_pct', op) order by op desc nulls last, p desc nulls last), '[]'::jsonb)
      from (select name, count(*) cnt,
        round(avg(prep_s) filter (where prep_s is not null)) p,
        round(avg(thr_prep_s)) ss,
        case when avg(thr_prep_s) > 0 and avg(prep_s) filter (where prep_s is not null) is not null
          then round((avg(prep_s) filter (where prep_s is not null) - avg(thr_prep_s)) / avg(thr_prep_s) * 100) else null end op
        from cur group by name having count(*) filter (where prep_s is not null) > 0
        order by op desc nulls last, p desc nulls last limit 5) t)
  ) into v_result;
  return v_result;
end; $$;


ALTER FUNCTION "public"."pos_kds_metrics_v2"("p_business_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_station" "text", "p_taken_by" "uuid", "p_tz" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_kds_settings"("p_business_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.pos_can_access(p_business_id) then raise exception 'no pos access'; end if;
  return coalesce((select kds_settings from public.businesses where id = p_business_id), '{}'::jsonb);
end;
$$;


ALTER FUNCTION "public"."pos_kds_settings"("p_business_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_link_barcode"("p_business_id" "uuid", "p_menu_item_id" "uuid", "p_barcode" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_uid uuid := auth.uid();
  v_has_perm boolean;
  v_code text := trim(p_barcode);
begin
  if v_uid is null then raise exception 'forbidden' using errcode='42501'; end if;
  if v_code is null or length(v_code) < 6 or length(v_code) > 20 or v_code !~ '^[0-9]+$' then
    raise exception 'bad_barcode';
  end if;
  select exists (
    select 1 from employees e
    join custom_roles cr on cr.id = e.custom_role_id
    where e.business_id = p_business_id and e.user_id = v_uid
      and e.status = 'accepted'
      and coalesce((cr.permissions->>'inventory_manage')::boolean, false)
  ) or exists (
    select 1 from businesses b where b.id = p_business_id and b.owner_id = v_uid
  ) into v_has_perm;
  if not v_has_perm then raise exception 'forbidden' using errcode='42501'; end if;

  update menu_items set barcode = v_code
    where id = p_menu_item_id and business_id = p_business_id;
  if not found then raise exception 'item_not_found'; end if;
  return true;
end $_$;


ALTER FUNCTION "public"."pos_link_barcode"("p_business_id" "uuid", "p_menu_item_id" "uuid", "p_barcode" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_list_blocked_devices"("p_business_id" "uuid") RETURNS TABLE("block_id" "uuid", "device_id" "text", "reason" "text", "blocked_until" timestamp with time zone, "created_at" timestamp with time zone, "strikes" integer, "unblocked_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select gb.id, gb.device_id, gb.reason, gb.blocked_until, gb.created_at,
         (select count(*)::int from public.guest_device_strikes s where s.business_id = gb.business_id and s.device_id = gb.device_id) as strikes,
         gb.unblocked_at
  from public.guest_device_blocks gb
  where gb.business_id = p_business_id
    and (public.pos_can_access(p_business_id) or exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = auth.uid()))
  order by (gb.unblocked_at is null and gb.blocked_until > now()) desc, gb.created_at desc;
$$;


ALTER FUNCTION "public"."pos_list_blocked_devices"("p_business_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_mark_comanda_printed"("p_business_id" "uuid", "p_order_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  update public.orders set comanda_printed_at = now()
   where id = p_order_id and business_id = p_business_id and comanda_claimed_by = auth.uid();
$$;


ALTER FUNCTION "public"."pos_mark_comanda_printed"("p_business_id" "uuid", "p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_my_businesses"() RETURNS TABLE("business_id" "uuid", "business_name" "text", "employee_id" "uuid", "role" "text", "has_pin" boolean, "plan" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return query
  select e.business_id, b.name, e.id, e.role,
    exists (select 1 from public.pos_pins pp where pp.user_id = e.user_id and pp.business_id = e.business_id),
    b.plan
  from public.employees e
  join public.businesses b on b.id = e.business_id
  join public.custom_roles cr on cr.id = e.custom_role_id
  where e.user_id = auth.uid()
    and e.status = 'accepted'
    and coalesce((cr.permissions->>'pos_access')::boolean, false) = true;
end;
$$;


ALTER FUNCTION "public"."pos_my_businesses"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_open_table_session"("p_business_id" "uuid", "p_table_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_uid uuid := auth.uid(); v_code text; v_opened timestamptz; v_biz uuid; v_created boolean := false;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not (public.pos_can_access(p_business_id) or exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = v_uid)) then
    raise exception 'NOT_ALLOWED';
  end if;
  select t.business_id into v_biz from public.tables t
  where t.id = p_table_id and t.business_id = p_business_id and t.is_active = true;
  if v_biz is null then raise exception 'TABLE_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_table_id::text, 0));
  select t.access_code, t.session_opened_at into v_code, v_opened from public.tables t where t.id = p_table_id;
  if v_code is null then
    v_code := public.generate_table_access_code(p_business_id);
    v_opened := now(); v_created := true;
    update public.tables set access_code = v_code, session_opened_at = v_opened, session_opened_by = v_uid where id = p_table_id;
  end if;
  return jsonb_build_object('table_id', p_table_id, 'access_code', v_code, 'session_opened_at', v_opened, 'created', v_created);
end; $$;


ALTER FUNCTION "public"."pos_open_table_session"("p_business_id" "uuid", "p_table_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."pos_open_table_session"("p_business_id" "uuid", "p_table_id" "uuid") IS 'Abre la sesión de ocupación de una mesa y genera su código de 6 dígitos. Idempotente. F2.';


CREATE OR REPLACE FUNCTION "public"."pos_payment_voucher"("p_payment_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_biz uuid; v_out jsonb;
begin
  select pp.business_id into v_biz from public.pos_payments pp where pp.id = p_payment_id;
  if v_biz is null then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if not (public.pos_can_access(v_biz)
          or exists (select 1 from public.businesses b where b.id = v_biz and b.owner_id = auth.uid())) then
    raise exception 'NOT_ALLOWED';
  end if;
  select jsonb_build_object(
    'payment_id',      pp.id,
    'business_name',   b.name,
    'table_label',     coalesce(t.label, pp.table_id::text),
    'payment_method',  pp.payment_method,
    'source',          pp.source,
    'kind',            pp.kind,
    'amount_cents',    pp.amount_cents,
    'tip_cents',       coalesce(pp.tip_cents, 0),
    'total_cents',     pp.amount_cents + coalesce(pp.tip_cents, 0),
    'status',          pp.status,
    'receipt_code',    pp.receipt_code,
    'paid_at',         pp.updated_at,
    'session_opened_at', pp.session_opened_at,
    'waiter_name',     coalesce(e.receipt_display_name, u.display_name, 'Staff'),
    'split_index',     (select count(*) from public.pos_payments q
                         where q.table_id = pp.table_id and q.session_opened_at = pp.session_opened_at
                           and q.source = 'pos' and q.kind = pp.kind and q.status = 'succeeded' and q.updated_at <= pp.updated_at),
    'split_total',     (select count(*) from public.pos_payments q
                         where q.table_id = pp.table_id and q.session_opened_at = pp.session_opened_at
                           and q.source = 'pos' and q.kind = pp.kind and q.status in ('pending','processing','succeeded')),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('name', mi.name, 'qty', oi.qty, 'line_cents', oi.price_cents * oi.qty) order by oi.id)
      from public.order_items oi join public.menu_items mi on mi.id = oi.menu_item_id
      where pp.order_item_ids is not null and oi.id = any(pp.order_item_ids)
    ), '[]'::jsonb)
  ) into v_out
  from public.pos_payments pp
  join public.businesses b on b.id = pp.business_id
  left join public.tables t on t.id = pp.table_id
  left join public.employees e on e.user_id = pp.paid_by and e.business_id = pp.business_id
  left join public.users u on u.id = pp.paid_by
  where pp.id = p_payment_id;
  return v_out;
end $$;


ALTER FUNCTION "public"."pos_payment_voucher"("p_payment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_pending_comandas"("p_business_id" "uuid") RETURNS TABLE("order_id" "uuid", "table_label" "text", "created_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select o.id, o.table_label, o.created_at
    from public.orders o
   where o.business_id = p_business_id
     and public.pos_can_access(p_business_id)
     and o.source in ('customer_stripe','customer_tab')
     and o.comanda_printed_at is null and o.canceled_at is null
     and coalesce(o.approval_status, 'approved') <> 'awaiting'
     and o.created_at > now() - interval '12 hours'
   order by o.created_at asc;
$$;


ALTER FUNCTION "public"."pos_pending_comandas"("p_business_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_pickup_board"("p_business_id" "uuid") RETURNS TABLE("order_item_id" "uuid", "order_id" "uuid", "table_id" "uuid", "table_label" "text", "seat" integer, "item_name" "text", "qty" integer, "item_status" "text", "station" "text", "created_at" timestamp with time zone, "preparing_at" timestamp with time zone, "ready_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not public.pos_can_access(p_business_id) then raise exception 'no pos access'; end if;
  return query
  select oi.id, oi.order_id, o.table_id, o.table_label, oi.seat, mi.name, oi.qty, oi.item_status, mi.station,
         oi.created_at, oi.preparing_at, oi.ready_at
  from public.orders o
  join public.order_items oi on oi.order_id = o.id
  join public.menu_items mi on mi.id = oi.menu_item_id
  where o.business_id = p_business_id
    and o.status in ('pending','confirmed','preparing','ready')
    and o.canceled_at is null
    and coalesce(o.approval_status,'approved') <> 'awaiting' and oi.item_status <> 'done'
  order by o.table_label, o.created_at, oi.seat nulls first, oi.id;
end; $$;


ALTER FUNCTION "public"."pos_pickup_board"("p_business_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_receipts_today"("p_business_id" "uuid") RETURNS TABLE("id" "uuid", "receipt_code" "text", "table_label" "text", "amount_cents" integer, "tip_cents" integer, "status" "text", "paid_by" "uuid", "source" "text", "payment_method" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_is_owner boolean; v_is_employee boolean;
begin
  v_is_owner := exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = auth.uid());
  v_is_employee := public.is_employee_of_business(p_business_id);
  if not v_is_owner and not v_is_employee then raise exception 'no access'; end if;
  return query
    select pp.id, pp.receipt_code, t.label as table_label, pp.amount_cents, coalesce(pp.tip_cents, 0) as tip_cents,
      pp.status, pp.paid_by, pp.source, pp.payment_method, pp.created_at
    from public.pos_payments pp left join public.tables t on t.id = pp.table_id
    where pp.business_id = p_business_id and pp.status = 'succeeded'
      and pp.created_at >= (date_trunc('day', now() at time zone 'America/New_York') at time zone 'America/New_York')
      and (v_is_owner or pp.paid_by = auth.uid() or (pp.source = 'guest' and public.is_waiter_of_table(pp.table_id)))
    order by pp.created_at desc;
end $$;


ALTER FUNCTION "public"."pos_receipts_today"("p_business_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_reject_order"("p_business_id" "uuid", "p_order_id" "uuid", "p_reason" "text" DEFAULT NULL::"text", "p_mode" "text" DEFAULT 'reject'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_uid uuid := auth.uid(); v_status text; v_device text; v_session uuid; v_strikes int := 0; v_blocked boolean := false; v_until timestamptz;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_mode not in ('reject', 'edit') then raise exception 'BAD_MODE'; end if;
  if not (public.pos_can_access(p_business_id) or exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = v_uid)) then
    raise exception 'NOT_ALLOWED';
  end if;
  select o.approval_status, o.guest_device_id, o.guest_session_id into v_status, v_device, v_session
    from public.orders o where o.id = p_order_id and o.business_id = p_business_id for update;
  if v_status is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_status <> 'awaiting' then raise exception 'NOT_AWAITING'; end if;
  update public.orders set approval_status = 'rejected',
    rejected_reason = left(coalesce(p_reason, case when p_mode = 'edit' then 'edited_by_waiter' else null end), 200),
    approved_by = v_uid, approved_at = now(), canceled_at = now(), status = 'cancelled', status_updated_at = now()
  where id = p_order_id;
  if p_mode = 'reject' and v_device is not null and v_session is null then
    insert into public.guest_device_strikes (business_id, device_id, order_id, created_by)
    values (p_business_id, v_device, p_order_id, v_uid);
    select count(*)::int into v_strikes from public.guest_device_strikes s
      where s.business_id = p_business_id and s.device_id = v_device and s.created_at > now() - interval '30 days';
    if v_strikes >= 2 and not exists (select 1 from public.guest_device_blocks gb
        where gb.business_id = p_business_id and gb.device_id = v_device and gb.unblocked_at is null and gb.blocked_until > now()) then
      v_until := now() + interval '30 days';
      insert into public.guest_device_blocks (business_id, device_id, reason, blocked_until, created_by)
      values (p_business_id, v_device, 'rejected_orders', v_until, v_uid) on conflict do nothing;
      v_blocked := true;
      update public.guest_tab_sessions set revoked_at = now() where business_id = p_business_id and device_id = v_device and revoked_at is null;
    end if;
  end if;
  return jsonb_build_object('rejected', true, 'mode', p_mode, 'strikes', v_strikes, 'blocked', v_blocked, 'blocked_until', v_until);
end; $$;


ALTER FUNCTION "public"."pos_reject_order"("p_business_id" "uuid", "p_order_id" "uuid", "p_reason" "text", "p_mode" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_release_comanda_print"("p_business_id" "uuid", "p_order_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  update public.orders set comanda_claimed_at = null, comanda_claimed_by = null
   where id = p_order_id and business_id = p_business_id and comanda_claimed_by = auth.uid() and comanda_printed_at is null;
$$;


ALTER FUNCTION "public"."pos_release_comanda_print"("p_business_id" "uuid", "p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_session_split_method"("p_business_id" "uuid", "p_table_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  with s as (
    select t.session_opened_at as o from public.tables t
     where t.id = p_table_id and t.business_id = p_business_id
  )
  select case
    when exists (
      select 1 from public.pos_payments pp, s
       where pp.table_id = p_table_id and pp.status = 'succeeded' and pp.session_opened_at = s.o
         and pp.order_item_ids is not null and cardinality(pp.order_item_ids) > 0
    ) then 'items'
    when exists (
      select 1 from public.pos_payments pp, s
       where pp.table_id = p_table_id and pp.status = 'succeeded' and pp.session_opened_at = s.o
         and (pp.order_item_ids is null or cardinality(pp.order_item_ids) = 0)
         and pp.kind in ('even','guest_even','guest_amount','custom')
    ) then 'amount'
    else null
  end;
$$;


ALTER FUNCTION "public"."pos_session_split_method"("p_business_id" "uuid", "p_table_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_set_party_size"("p_business_id" "uuid", "p_table_id" "uuid", "p_party_size" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.pos_can_access(p_business_id) then raise exception 'no pos access'; end if;
  if p_party_size < 0 or p_party_size > 100 then raise exception 'invalid party size'; end if;
  update public.tables
     set party_size = nullif(p_party_size, 0)
   where id = p_table_id and business_id = p_business_id;
  if not found then raise exception 'table not in this business'; end if;
end;
$$;


ALTER FUNCTION "public"."pos_set_party_size"("p_business_id" "uuid", "p_table_id" "uuid", "p_party_size" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_set_pin"("p_business_id" "uuid", "p_pin" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $_$
begin
  if not public.pos_can_access(p_business_id) then raise exception 'no pos access'; end if;
  if p_pin !~ '^[0-9]{4,6}$' then raise exception 'pin must be 4 to 6 digits'; end if;
  insert into public.pos_pins (user_id, business_id, pin_hash, failed_attempts, locked_until, updated_at)
  values (auth.uid(), p_business_id, crypt(p_pin, gen_salt('bf')), 0, null, now())
  on conflict (user_id, business_id) do update
    set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null, updated_at = now();
end;
$_$;


ALTER FUNCTION "public"."pos_set_pin"("p_business_id" "uuid", "p_pin" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_tab_total"("p_business_id" "uuid", "p_table_id" "uuid") RETURNS bigint
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select coalesce(sum(oi.price_cents * oi.qty), 0)::bigint
  from public.orders o join public.order_items oi on oi.order_id = o.id
  where o.business_id = p_business_id and o.table_id = p_table_id
    and o.paid_at is null and o.canceled_at is null
    and coalesce(o.approval_status,'approved') <> 'awaiting' and oi.paid_at is null;
$$;


ALTER FUNCTION "public"."pos_tab_total"("p_business_id" "uuid", "p_table_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_table_balance"("p_business_id" "uuid", "p_table_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_open          timestamptz;
  v_items         bigint;
  v_unalloc       bigint;
  v_pending_guest bigint;
begin
  select t.session_opened_at into v_open
  from public.tables t
  where t.id = p_table_id and t.business_id = p_business_id;

  v_items := public.pos_tab_total(p_business_id, p_table_id);

  select coalesce(sum(pp.amount_cents), 0) into v_unalloc
  from public.pos_payments pp
  where pp.business_id = p_business_id and pp.table_id = p_table_id
    and pp.status = 'succeeded'
    and (pp.order_item_ids is null or cardinality(pp.order_item_ids) = 0)
    and v_open is not null and pp.session_opened_at = v_open;

  select coalesce(sum(pp.amount_cents), 0) into v_pending_guest
  from public.pos_payments pp
  where pp.business_id = p_business_id and pp.table_id = p_table_id
    and pp.source = 'guest' and pp.status = 'processing'
    and v_open is not null and pp.session_opened_at = v_open
    and pp.claimed_at > now() - interval '10 minutes';

  return jsonb_build_object(
    'session_opened_at',      v_open,
    'items_unpaid_cents',     v_items,
    'paid_unallocated_cents', v_unalloc,
    'due_cents',              greatest(v_items - v_unalloc, 0),
    'guest_processing_cents', v_pending_guest
  );
end $$;


ALTER FUNCTION "public"."pos_table_balance"("p_business_id" "uuid", "p_table_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_table_items"("p_business_id" "uuid", "p_table_id" "uuid") RETURNS TABLE("order_item_id" "uuid", "order_id" "uuid", "order_status" "text", "seat" integer, "menu_item_id" "uuid", "item_name" "text", "qty" integer, "price_cents" integer, "options" "jsonb", "special_instructions" "text", "item_status" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not public.pos_can_access(p_business_id) then raise exception 'no pos access'; end if;
  return query
  select oi.id, oi.order_id, o.status, oi.seat, oi.menu_item_id, mi.name, oi.qty, oi.price_cents, oi.options, oi.special_instructions, oi.item_status
  from public.orders o
  join public.order_items oi on oi.order_id = o.id
  join public.menu_items mi on mi.id = oi.menu_item_id
  where o.business_id = p_business_id and o.table_id = p_table_id and o.paid_at is null and o.canceled_at is null
    and coalesce(o.approval_status,'approved') <> 'awaiting' and oi.paid_at is null
  order by o.created_at, oi.seat nulls first, oi.id;
end; $$;


ALTER FUNCTION "public"."pos_table_items"("p_business_id" "uuid", "p_table_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_table_session"("p_business_id" "uuid", "p_table_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select case
    when (public.pos_can_access(p_business_id) or exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = auth.uid()))
    and (public.is_waiter_of_table(p_table_id) or public.owns_business_of_table(p_table_id)
         or not exists (select 1 from public.table_waiters tw where tw.table_id = p_table_id and tw.business_id = p_business_id))
    then (
      select jsonb_build_object(
        'access_code', t.access_code,
        'session_opened_at', t.session_opened_at,
        'session_opened_by', t.session_opened_by,
        'open_total_cents', coalesce((select sum(oi.price_cents * oi.qty) from public.orders o join public.order_items oi on oi.order_id = o.id
          where o.table_id = p_table_id and o.business_id = p_business_id and o.paid_at is null and o.canceled_at is null and oi.paid_at is null), 0),
        'open_orders_count', coalesce((select count(*) from public.orders o
          where o.table_id = p_table_id and o.business_id = p_business_id and o.paid_at is null and o.canceled_at is null), 0)
      )
      from public.tables t where t.id = p_table_id and t.business_id = p_business_id
    )
    else null
  end;
$$;


ALTER FUNCTION "public"."pos_table_session"("p_business_id" "uuid", "p_table_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."pos_table_session"("p_business_id" "uuid", "p_table_id" "uuid") IS 'Detalle de sesión de mesa. ÚNICO punto que devuelve access_code. F2.';


CREATE OR REPLACE FUNCTION "public"."pos_tables_overview"("p_business_id" "uuid") RETURNS TABLE("table_id" "uuid", "label" "text", "floor" "text", "seats" integer, "party_size" integer, "state" "text", "assignment" "text", "open_total_cents" bigint, "open_since" timestamp with time zone, "combined_into" "uuid", "combined_seats" integer, "combinable" boolean, "has_access_code" boolean, "awaiting_count" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_emp_id uuid;
begin
  if not public.pos_can_access(p_business_id) then raise exception 'no pos access'; end if;
  select e.id into v_emp_id from public.employees e
    where e.user_id = auth.uid() and e.business_id = p_business_id and e.status = 'accepted' limit 1;
  return query
  select
    t.id, t.label, t.floor, t.seats, t.party_size,
    case when exists (select 1 from public.orders o where o.table_id = t.id and o.business_id = p_business_id
          and o.paid_at is null and o.canceled_at is null and coalesce(o.approval_status,'approved') <> 'awaiting')
      or t.combined_into is not null or t.session_opened_at is not null
    then 'ocupada' else 'libre' end as state,
    case
      when exists (select 1 from public.table_waiters tw where tw.table_id = t.id and tw.business_id = p_business_id and tw.employee_id = v_emp_id) then 'mine'
      when exists (select 1 from public.table_waiters tw where tw.table_id = t.id and tw.business_id = p_business_id) then 'other'
      else 'unassigned'
    end as assignment,
    coalesce((select sum(o.total_cents) from public.orders o where o.table_id = t.id and o.business_id = p_business_id
        and o.paid_at is null and o.canceled_at is null and coalesce(o.approval_status,'approved') <> 'awaiting'), 0) as open_total_cents,
    (select min(o.created_at) from public.orders o where o.table_id = t.id and o.business_id = p_business_id
        and o.paid_at is null and o.canceled_at is null and coalesce(o.approval_status,'approved') <> 'awaiting') as open_since,
    t.combined_into,
    (t.seats + coalesce((select sum(a.seats) from public.tables a where a.combined_into = t.id and a.is_active), 0))::integer as combined_seats,
    (not exists (select 1 from public.orders o where o.table_id = t.id and o.business_id = p_business_id
        and o.paid_at is null and o.canceled_at is null and coalesce(o.approval_status,'approved') <> 'awaiting')
      and coalesce(t.party_size, 0) = 0 and t.combined_into is null) as combinable,
    (t.access_code is not null) as has_access_code,
    (select count(*)::int from public.orders o where o.table_id = t.id and o.business_id = p_business_id
        and o.approval_status = 'awaiting' and o.canceled_at is null) as awaiting_count
  from public.tables t where t.business_id = p_business_id and t.is_active = true
  order by t.sort;
end; $$;


ALTER FUNCTION "public"."pos_tables_overview"("p_business_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_unblock_device"("p_business_id" "uuid", "p_block_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_uid uuid := auth.uid(); v_n int;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not (public.pos_can_access(p_business_id) or exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = v_uid)) then
    raise exception 'NOT_ALLOWED';
  end if;
  update public.guest_device_blocks set unblocked_at = now(), unblocked_by = v_uid
    where id = p_block_id and business_id = p_business_id and unblocked_at is null;
  get diagnostics v_n = row_count;
  return jsonb_build_object('unblocked', v_n = 1);
end; $$;


ALTER FUNCTION "public"."pos_unblock_device"("p_business_id" "uuid", "p_block_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_uncombine_table"("p_business_id" "uuid", "p_table_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_biz uuid; v_combined uuid;
begin
  if not public.pos_can_access(p_business_id) then raise exception 'no pos access'; end if;
  select t.business_id, t.combined_into into v_biz, v_combined
  from public.tables t where t.id = p_table_id;
  if v_biz is null then raise exception 'table not found'; end if;
  if v_biz <> p_business_id then raise exception 'table not in this business'; end if;
  update public.tables set combined_into = null where id = p_table_id;
end;
$$;


ALTER FUNCTION "public"."pos_uncombine_table"("p_business_id" "uuid", "p_table_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_verify_pin"("p_business_id" "uuid", "p_pin" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare v_row public.pos_pins; v_ok boolean;
begin
  if not public.pos_can_access(p_business_id) then raise exception 'no pos access'; end if;
  select * into v_row from public.pos_pins where user_id = auth.uid() and business_id = p_business_id;
  if not found then raise exception 'no pin set'; end if;
  if v_row.locked_until is not null and v_row.locked_until > now() then raise exception 'locked'; end if;

  v_ok := (v_row.pin_hash = crypt(p_pin, v_row.pin_hash));
  if v_ok then
    update public.pos_pins set failed_attempts = 0, locked_until = null
      where user_id = auth.uid() and business_id = p_business_id;
    return true;
  else
    update public.pos_pins
      set failed_attempts = v_row.failed_attempts + 1,
          locked_until = case when v_row.failed_attempts + 1 >= 5 then now() + interval '15 minutes' else null end
      where user_id = auth.uid() and business_id = p_business_id;
    return false;
  end if;
end;
$$;


ALTER FUNCTION "public"."pos_verify_pin"("p_business_id" "uuid", "p_pin" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_void_order"("p_business_id" "uuid", "p_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_biz uuid; v_table uuid; v_paid timestamptz; v_canceled timestamptz; v_status text;
  v_nonpending integer; v_pending_split integer;
  v_sales_loc uuid;
begin
  if not public.pos_can_access(p_business_id) then raise exception 'no pos access'; end if;

  select o.business_id, o.table_id, o.paid_at, o.canceled_at, o.status
    into v_biz, v_table, v_paid, v_canceled, v_status
  from public.orders o where o.id = p_order_id;

  if v_biz is null then raise exception 'order not found'; end if;
  if v_biz <> p_business_id then raise exception 'order not in this business'; end if;
  if v_paid is not null then raise exception 'order already paid'; end if;
  if v_canceled is not null then return; end if;

  if v_status in ('preparing', 'ready') then raise exception 'order in preparation'; end if;

  select count(*) into v_nonpending
  from public.order_items oi
  where oi.order_id = p_order_id and oi.item_status <> 'pending';
  if v_nonpending > 0 then raise exception 'order in preparation'; end if;

  select count(*) into v_pending_split
  from public.pos_payments pp
  where pp.table_id = v_table and pp.status = 'pending';
  if v_pending_split > 0 then raise exception 'split in progress'; end if;

  select b.sales_location_id into v_sales_loc from public.businesses b where b.id = p_business_id;

  if v_sales_loc is not null then
    update public.stock_by_location sbl
       set qty = sbl.qty + agg.qty, updated_at = now()
      from (
        select oi.menu_item_id, sum(oi.qty)::int as qty
        from public.order_items oi
        where oi.order_id = p_order_id
        group by oi.menu_item_id
      ) agg
     where sbl.menu_item_id = agg.menu_item_id
       and sbl.location_id = v_sales_loc
       and sbl.business_id = p_business_id;

    insert into public.stock_movements (menu_item_id, business_id, delta, reason, created_by)
    select oi.menu_item_id, p_business_id, sum(oi.qty)::int, 'void', auth.uid()
    from public.order_items oi
    join public.stock_by_location sbl
      on sbl.menu_item_id = oi.menu_item_id and sbl.location_id = v_sales_loc and sbl.business_id = p_business_id
    where oi.order_id = p_order_id
    group by oi.menu_item_id;
  end if;

  update public.menu_items mi
     set stock_count = coalesce(mi.stock_count, 0) + agg.qty
    from (
      select oi.menu_item_id, sum(oi.qty)::int as qty
      from public.order_items oi
      where oi.order_id = p_order_id
      group by oi.menu_item_id
    ) agg
   where mi.id = agg.menu_item_id
     and mi.business_id = p_business_id
     and mi.stock_count is not null
     and (
       v_sales_loc is null
       or not exists (
         select 1 from public.stock_by_location sbl
         where sbl.menu_item_id = mi.id and sbl.location_id = v_sales_loc and sbl.business_id = p_business_id
       )
     );

  insert into public.stock_movements (menu_item_id, business_id, delta, reason, created_by)
  select oi.menu_item_id, p_business_id, sum(oi.qty)::int, 'void', auth.uid()
  from public.order_items oi
  join public.menu_items mi on mi.id = oi.menu_item_id
  where oi.order_id = p_order_id
    and mi.business_id = p_business_id
    and mi.stock_count is not null
    and (
      v_sales_loc is null
      or not exists (
        select 1 from public.stock_by_location sbl
        where sbl.menu_item_id = mi.id and sbl.location_id = v_sales_loc and sbl.business_id = p_business_id
      )
    )
  group by oi.menu_item_id;

  update public.orders set canceled_at = now() where id = p_order_id;
end;
$$;


ALTER FUNCTION "public"."pos_void_order"("p_business_id" "uuid", "p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."profile_counts"("p_user" "uuid") RETURNS TABLE("followers" bigint, "following" bigint, "posts" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    case when public.is_blocked((select auth.uid()), p_user) then 0
         else (select count(*) from public.follows f where f.following_id = p_user) end,
    case when public.is_blocked((select auth.uid()), p_user) then 0
         else (select count(*) from public.follows f where f.follower_id = p_user) end,
    case when public.is_blocked((select auth.uid()), p_user) then 0
         else (select count(*) from public.posts p where p.user_id = p_user and p.business_id is null) end;
$$;


ALTER FUNCTION "public"."profile_counts"("p_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."purchase_suggestion"("p_business_id" "uuid") RETURNS TABLE("menu_item_id" "uuid", "item_name" "text", "stock_count" integer, "low_stock_threshold" integer, "par_level" integer, "suggested_qty" integer, "unit_cost_cents" integer, "suggested_cost_cents" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_has_perm boolean;
begin
  if v_uid is null then raise exception 'forbidden' using errcode='42501'; end if;

  select exists (
    select 1 from employees e
    join custom_roles cr on cr.id = e.custom_role_id
    where e.business_id = p_business_id and e.user_id = v_uid and e.status = 'accepted'
      and coalesce((cr.permissions->>'inventory_manage')::boolean, false)
  ) or exists (
    select 1 from businesses b where b.id = p_business_id and b.owner_id = v_uid
  ) into v_has_perm;
  if not v_has_perm then raise exception 'forbidden' using errcode='42501'; end if;

  return query
  select
    mi.id,
    mi.name,
    mi.stock_count,
    mi.low_stock_threshold,
    mi.par_level,
    (mi.par_level - mi.stock_count) as suggested_qty,
    mic.cost_cents,
    ((mi.par_level - mi.stock_count)::bigint * mic.cost_cents) as suggested_cost_cents
  from menu_items mi
  left join menu_item_costs mic on mic.menu_item_id = mi.id
  where mi.business_id = p_business_id
    and mi.stock_count is not null
    and mi.par_level is not null
    and mi.stock_count <= mi.low_stock_threshold
    and (mi.par_level - mi.stock_count) > 0
  order by (mi.par_level - mi.stock_count) desc, mi.name;
end
$$;


ALTER FUNCTION "public"."purchase_suggestion"("p_business_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."purge_expired_messages"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_media_count int := -1;  -- -1 = storage cleanup skipped
  v_msg_count   int;
begin
  -- 1. Best-effort photo cleanup (Option C — deferred). Supabase blocks direct
  --    DELETE FROM storage.objects (protect_delete trigger), so wrap it: if it
  --    raises, log and continue — the message purge below must always run.
  --    Orphaned post-media binaries (unreferenced) remain until a future
  --    Storage-API mechanism cleans them.
  --    Evidence hold: a message with a pending report, or a child-safety / sexual-content /
  --    NCMEC-escalated report younger than 365 days, keeps its file (message_under_retention_hold).
  begin
    delete from storage.objects
    where bucket_id = 'post-media'
      and name in (
        select substring(m.media_url from '/post-media/(.+)$')
        from public.messages m
        where m.created_at < now() - interval '24 hours'
          and m.media_url is not null
          and m.media_url like '%/post-media/%'
          and m.id not in (select pm.message_id from public.pinned_messages pm)
          and not public.message_under_retention_hold(m.id)
      );
    get diagnostics v_media_count = row_count;
  exception when others then
    raise log '[purge_expired_messages] storage cleanup skipped: %', sqlerrm;
    v_media_count := -1;
  end;

  -- 2. Purge expired message rows (except pinned and the ones under an evidence hold). reply_to → SET NULL.
  delete from public.messages
  where created_at < now() - interval '24 hours'
    and id not in (select message_id from public.pinned_messages)
    and not public.message_under_retention_hold(id);
  get diagnostics v_msg_count = row_count;

  raise log '[purge_expired_messages] deleted % messages, % media objects (-1 = storage skipped)',
    v_msg_count, v_media_count;
end;
$_$;


ALTER FUNCTION "public"."purge_expired_messages"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."purge_stale_pending_carts"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_deleted int;
begin
  delete from public.pending_order_carts
  where created_at < now() - interval '24 hours';
  get diagnostics v_deleted = row_count;
  raise log '[purge_stale_pending_carts] deleted % stale carts', v_deleted;
  return v_deleted;
end $$;


ALTER FUNCTION "public"."purge_stale_pending_carts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."push_dispatch"("p_kind" "text", "p_record" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
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


ALTER FUNCTION "public"."push_dispatch"("p_kind" "text", "p_record" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."push_on_dm_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."push_on_dm_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."push_on_notification_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."push_on_notification_insert"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."affiliate_payouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "affiliate_id" "uuid" NOT NULL,
    "amount_cents" integer NOT NULL,
    "currency" "text" DEFAULT 'usd'::"text" NOT NULL,
    "method" "text",
    "reference" "text",
    "note" "text",
    "paid_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "affiliate_payouts_amount_cents_check" CHECK (("amount_cents" >= 0))
);


ALTER TABLE "public"."affiliate_payouts" OWNER TO "postgres";


COMMENT ON TABLE "public"."affiliate_payouts" IS 'Registro de pagos manuales que hace el admin al afiliado. Las comisiones cubiertas enlazan via affiliate_commissions.payout_id.';


CREATE OR REPLACE FUNCTION "public"."record_affiliate_payout"("p_affiliate_id" "uuid", "p_commission_ids" "uuid"[] DEFAULT NULL::"uuid"[], "p_method" "text" DEFAULT NULL::"text", "p_reference" "text" DEFAULT NULL::"text", "p_note" "text" DEFAULT NULL::"text") RETURNS "public"."affiliate_payouts"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_global_ok boolean;
  v_clawback  integer;
  v_aff       public.affiliates;
  v_payout    public.affiliate_payouts;
  v_total     bigint;
  v_currency  text;
  v_ids       uuid[];
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  select affiliate_payouts_enabled, affiliate_clawback_days
    into v_global_ok, v_clawback
  from public.platform_config where id = true;
  if not coalesce(v_global_ok, true) then
    raise exception 'payouts globally paused';
  end if;

  select * into v_aff from public.affiliates where id = p_affiliate_id;
  if not found then raise exception 'affiliate not found'; end if;
  if v_aff.payouts_held then raise exception 'affiliate payouts held'; end if;
  if v_aff.status = 'terminated' then raise exception 'affiliate terminated'; end if;
  if not v_aff.tax_form_on_file then raise exception 'tax form not on file'; end if;

  select coalesce(array_agg(id), '{}'), coalesce(sum(commission_amount_cents),0), coalesce(min(currency),'usd')
    into v_ids, v_total, v_currency
  from public.affiliate_commissions
  where affiliate_id = p_affiliate_id
    and status = 'pending'
    and created_at <= now() - make_interval(days => v_clawback)
    and (p_commission_ids is null or id = any(p_commission_ids));

  if array_length(v_ids, 1) is null then
    raise exception 'no payable commissions';
  end if;

  insert into public.affiliate_payouts
    (affiliate_id, amount_cents, currency, method, reference, note, created_by, paid_at)
  values
    (p_affiliate_id, v_total, v_currency, p_method, p_reference, p_note, auth.uid(), now())
  returning * into v_payout;

  update public.affiliate_commissions
  set status = 'paid', payout_id = v_payout.id
  where id = any(v_ids);

  return v_payout;
end;
$$;


ALTER FUNCTION "public"."record_affiliate_payout"("p_affiliate_id" "uuid", "p_commission_ids" "uuid"[], "p_method" "text", "p_reference" "text", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."regenerate_room_qr_token"("_room_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  _business_id    uuid;
  _parent_room_id uuid;
  _owner_id       uuid;
  _new_token      text;
begin
  -- Require a live session
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  -- Resolve room → business + parent
  select r.business_id, r.parent_room_id
  into   _business_id, _parent_room_id
  from   public.rooms r
  where  r.id = _room_id;

  if _business_id is null then
    raise exception 'room_not_found';
  end if;

  -- Verify caller is the business owner
  select b.owner_id
  into   _owner_id
  from   public.businesses b
  where  b.id = _business_id;

  if _owner_id is distinct from auth.uid() then
    raise exception 'not_authorized';
  end if;

  -- Generate a fresh unique token (reuses 026 helper — same format + anti-collision)
  _new_token := public.generate_room_qr_token(
                  _business_id,
                  _parent_room_id is not null
                );

  -- Rotate: old token stops working the moment this UPDATE commits
  update public.rooms
  set    qr_token = _new_token
  where  id = _room_id;

  return _new_token;
end;
$$;


ALTER FUNCTION "public"."regenerate_room_qr_token"("_room_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."regenerate_table_code"("p_table_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_biz uuid; v text;
begin
  select business_id into v_biz from public.tables where id = p_table_id;
  if v_biz is null or not exists (select 1 from public.businesses b where b.id = v_biz and b.owner_id = auth.uid()) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  loop
    v := public.gen_short_code(4);
    exit when not exists (select 1 from public.tables t where t.business_id = v_biz and t.short_code = v);
  end loop;
  update public.tables set short_code = v where id = p_table_id;
  return v;
end;
$$;


ALTER FUNCTION "public"."regenerate_table_code"("p_table_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_follow_request"("p_requester" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  delete from public.follow_requests
  where target_id = (select auth.uid()) and requester_id = p_requester;
$$;


ALTER FUNCTION "public"."reject_follow_request"("p_requester" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_follower"("p_follower" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  delete from public.follows where follower_id = p_follower and following_id = v_me;
end; $$;


ALTER FUNCTION "public"."remove_follower"("p_follower" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."report_content"("p_content_type" "text", "p_content_id" "uuid", "p_reason" "text", "p_details" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_reported uuid;
  v_business uuid;
  v_snapshot jsonb;
  v_existing uuid;
  v_id uuid;
  v_details text := nullif(left(trim(coalesce(p_details, '')), 1000), '');
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_content_type not in ('user','post','comment','message','dm_message') then
    raise exception 'invalid_content_type' using errcode = '22023';
  end if;
  if p_reason not in ('spam','harassment','hate','threat_violence','sexual_content','child_safety','impersonation','copyright','other') then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;
  if p_reason = 'other' and v_details is null then raise exception 'details_required' using errcode = '22023'; end if;
  if p_content_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;

  if p_content_type = 'user' then
    select u.id, jsonb_build_object('display_name', u.display_name, 'username', u.username, 'avatar_url', u.avatar_url)
      into v_reported, v_snapshot from public.users u where u.id = p_content_id;
  elsif p_content_type = 'post' then
    select p.user_id, p.business_id, jsonb_build_object('caption', p.caption, 'media_urls', p.media_urls, 'created_at', p.created_at)
      into v_reported, v_business, v_snapshot from public.posts p where p.id = p_content_id;
  elsif p_content_type = 'comment' then
    select c.user_id, jsonb_build_object('body', c.body, 'post_id', c.post_id, 'created_at', c.created_at)
      into v_reported, v_snapshot from public.comments c where c.id = p_content_id;
  elsif p_content_type = 'message' then
    select m.user_id, r.business_id,
           jsonb_build_object('body', m.body, 'media_url', m.media_url, 'type', m.type, 'metadata', m.metadata, 'room_id', m.room_id, 'created_at', m.created_at,
                              'card_text', case when m.type = 'tod_draw' then
                                 (select jsonb_object_agg(c.locale, c.body) from public.tod_cards c where c.concept_id = m.metadata->>'concept_id') end)
      into v_reported, v_business, v_snapshot
      from public.messages m join public.rooms r on r.id = m.room_id
     where m.id = p_content_id and public.can_access_room(m.room_id);
  elsif p_content_type = 'dm_message' then
    select d.sender_id,
           jsonb_build_object('body', d.body, 'media_url', d.media_url, 'voice_url', d.voice_url, 'conversation_id', d.conversation_id, 'created_at', d.created_at)
      into v_reported, v_snapshot
      from public.dm_messages d join public.dm_conversations c on c.id = d.conversation_id
     where d.id = p_content_id and (c.user_a = v_uid or c.user_b = v_uid);
  end if;

  if v_snapshot is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_reported = v_uid then raise exception 'invalid_target' using errcode = '22023'; end if;

  select id into v_existing from public.reports
   where reporter_id = v_uid and content_type = p_content_type
     and coalesce(content_id, reported_user_id) = p_content_id
     and created_at > now() - interval '24 hours'
   order by created_at desc limit 1;
  if v_existing is not null then return v_existing; end if;

  if (select count(*) from public.reports where reporter_id = v_uid and created_at > now() - interval '24 hours') >= 20 then
    raise exception 'report_limit' using errcode = '42501';
  end if;

  insert into public.reports (reporter_id, reported_user_id, content_type, content_id, reason, details, snapshot, status, business_id)
  values (v_uid, v_reported, p_content_type, case when p_content_type = 'user' then null else p_content_id end,
          p_reason, v_details, v_snapshot, 'pending', v_business)
  returning id into v_id;
  return v_id;
end;
$$;


ALTER FUNCTION "public"."report_content"("p_content_type" "text", "p_content_id" "uuid", "p_reason" "text", "p_details" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reports_set_business_from_tod_message"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_biz uuid;
begin
  if new.business_id is null and new.content_type = 'message' and new.content_id is not null then
    select r.business_id into v_biz
      from public.messages m join public.rooms r on r.id = m.room_id
     where m.id = new.content_id and m.type in ('tod_round','tod_draw');
    if v_biz is not null then new.business_id := v_biz; end if;
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."reports_set_business_from_tod_message"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reports_set_priority"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare v_reason text := lower(split_part(coalesce(new.reason, ''), ':', 1));
begin
  if v_reason in ('child_safety', 'minor') then
    new.priority := 'urgent';
  elsif v_reason in ('threat_violence') and new.priority = 'normal' then
    new.priority := 'high';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."reports_set_priority"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reports_urgent_alert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret' limit 1;
  if v_secret is null then return new; end if;
  perform net.http_post(
    url := 'https://klfsgcfoahdtkojyqspd.supabase.co/functions/v1/safety-alert',
    body := jsonb_build_object('report_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 10000);
  return new;
exception when others then
  return new;  -- el reporte nunca falla por el aviso
end;
$$;


ALTER FUNCTION "public"."reports_urgent_alert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_or_follow"("p_target" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_me uuid := auth.uid(); v_private boolean;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if v_me = p_target then raise exception 'cannot follow yourself'; end if;
  if public.is_blocked(v_me, p_target) then raise exception 'blocked'; end if;
  select is_private into v_private from public.users where id = p_target;
  if not found then raise exception 'target not found'; end if;

  -- Ya lo sigo: no hacer nada más
  if exists (select 1 from public.follows where follower_id = v_me and following_id = p_target) then
    return 'following';
  end if;

  if v_private then
    insert into public.follow_requests (requester_id, target_id)
      values (v_me, p_target) on conflict (requester_id, target_id) do nothing;
    return 'requested';
  else
    insert into public.follows (follower_id, following_id)
      values (v_me, p_target) on conflict (follower_id, following_id) do nothing;
    return 'following';
  end if;
end; $$;


ALTER FUNCTION "public"."request_or_follow"("p_target" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reservation_slot_load"("p_business_id" "uuid", "p_reserved_at" timestamp with time zone) RETURNS TABLE("reserved" integer, "capacity" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select (count(*) filter (where r.status in ('pending', 'confirmed', 'arrived') and not r.is_waitlist))::int,
         (select b.reservation_capacity from public.businesses b where b.id = p_business_id)
  from public.reservations r
  where r.business_id = p_business_id
    and (r.reserved_at at time zone 'America/New_York')::date = (p_reserved_at at time zone 'America/New_York')::date
$$;


ALTER FUNCTION "public"."reservation_slot_load"("p_business_id" "uuid", "p_reserved_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reservations_customer_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() = old.user_id
     and not exists (select 1 from public.businesses b where b.id = old.business_id and b.owner_id = auth.uid()) then
    if new.status is distinct from old.status and new.status <> 'cancelled' then
      raise exception 'customer_cannot_change_status';
    end if;
    if new.business_id is distinct from old.business_id or new.user_id is distinct from old.user_id
       or new.reserved_at is distinct from old.reserved_at or new.party_size is distinct from old.party_size
       or new.is_waitlist is distinct from old.is_waitlist then
      raise exception 'customer_can_only_cancel_or_edit_requests';
    end if;
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."reservations_customer_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_room_qr"("token" "text") RETURNS TABLE("room_id" "uuid", "parent_room_id" "uuid", "business_id" "uuid", "business_name" "text", "room_name" "text", "is_sub_room" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    r.id                            as room_id,
    r.parent_room_id                as parent_room_id,
    r.business_id                   as business_id,
    b.name                          as business_name,
    r.name                          as room_name,
    (r.parent_room_id is not null)  as is_sub_room
  from public.rooms r
  join public.businesses b on b.id = r.business_id
  where r.qr_token = token
    and r.is_active = true;
$$;


ALTER FUNCTION "public"."resolve_room_qr"("token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_tab_payment"("p_token" "text") RETURNS TABLE("business_name" "text", "table_label" "text", "tab_name" "text", "amount_cents" integer, "tip_cents" integer, "status" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select b.name, t.label, tt.name, tp.amount_cents, tp.tip_cents, tp.status
  from public.tab_payments tp
  join public.table_tabs tt on tt.id = tp.tab_id
  join public.tables t on t.id = tt.table_id
  join public.businesses b on b.id = tp.business_id
  where tp.pay_token = p_token and tp.status = 'pending';
$$;


ALTER FUNCTION "public"."resolve_tab_payment"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_table_qr"("p_token" "text") RETURNS TABLE("table_label" "text", "business_slug" "text", "room_qr_token" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select t.label, b.slug, r.qr_token
  from public.tables t
  join public.businesses b on b.id = t.business_id
  left join public.rooms r on r.id = t.room_id and r.is_active = true
  where t.qr_token = p_token and t.is_active = true;
$$;


ALTER FUNCTION "public"."resolve_table_qr"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_table_short"("p_business" "text", "p_label" "text", "p_code" "text") RETURNS TABLE("table_label" "text", "business_slug" "text", "room_qr_token" "text", "table_qr_token" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select t.label, b.slug, r.qr_token, t.qr_token
  from public.tables t
  join public.businesses b on b.id = t.business_id
  left join public.rooms r on r.id = t.room_id and r.is_active
  where (b.subdomain = lower(p_business) or b.slug = lower(p_business))
    and lower(t.label) in (lower(p_label), 't' || lower(p_label), 'mesa ' || lower(p_label))
    and t.short_code = lower(p_code) and t.is_active;
$$;


ALTER FUNCTION "public"."resolve_table_short"("p_business" "text", "p_label" "text", "p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_table_waiter_for_attribution"("p_table_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select coalesce(
    (select t.session_opened_by from public.tables t where t.id = p_table_id and t.session_opened_by is not null),
    (select e.user_id from public.table_waiters tw join public.employees e on e.id = tw.employee_id
      where tw.table_id = p_table_id order by tw.created_at asc limit 1)
  );
$$;


ALTER FUNCTION "public"."resolve_table_waiter_for_attribution"("p_table_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_venue_entry"("p_venue" "text" DEFAULT NULL::"text", "p_label" "text" DEFAULT NULL::"text", "p_code" "text" DEFAULT NULL::"text", "p_token" "text" DEFAULT NULL::"text") RETURNS TABLE("business_id" "uuid", "business_name" "text", "business_slug" "text", "logo_url" "text", "room_id" "uuid", "table_label" "text", "table_qr_token" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_venue text := nullif(lower(btrim(p_venue)), '');
  v_biz   uuid;
  v_room  uuid;
  v_label text;
  v_ttok  text;
begin
  if nullif(btrim(p_token), '') is not null then
    select r.business_id, r.id into v_biz, v_room
    from public.rooms r
    join public.businesses b on b.id = r.business_id
    where r.qr_token = btrim(p_token) and r.is_active and b.is_active
      and (v_venue is null or b.subdomain = v_venue or b.slug = v_venue);
  elsif v_venue is not null then
    select b.id into v_biz
    from public.businesses b
    where b.is_active and (b.subdomain = v_venue or b.slug = v_venue)
    order by (b.subdomain = v_venue) desc nulls last
    limit 1;

    if v_biz is not null and nullif(btrim(p_label), '') is not null and nullif(btrim(p_code), '') is not null then
      select t.label, t.qr_token into v_label, v_ttok
      from public.tables t
      where t.business_id = v_biz and t.is_active
        and lower(t.label) in (lower(btrim(p_label)), 't' || lower(btrim(p_label)), 'mesa ' || lower(btrim(p_label)))
        and t.short_code = lower(btrim(p_code))
      limit 1;
      if v_label is null then
        return;
      end if;
    end if;
  end if;

  if v_biz is null then
    return;
  end if;

  if v_room is null then
    select r.id into v_room
    from public.rooms r
    where r.business_id = v_biz and r.is_active and r.parent_room_id is null
    order by r.is_main desc, r.sort asc nulls last, r.created_at asc
    limit 1;
  end if;

  if v_room is null then
    return;
  end if;

  return query
    select b.id, b.name, b.slug, b.logo_url, v_room, v_label, v_ttok
    from public.businesses b where b.id = v_biz;
end;
$$;


ALTER FUNCTION "public"."resolve_venue_entry"("p_venue" "text", "p_label" "text", "p_code" "text", "p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sbl_sync_total"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_item uuid;
  v_total integer;
BEGIN
  v_item := COALESCE(NEW.menu_item_id, OLD.menu_item_id);
  SELECT COALESCE(SUM(qty), 0) INTO v_total
  FROM public.stock_by_location WHERE menu_item_id = v_item;
  UPDATE public.menu_items SET stock_count = v_total WHERE id = v_item;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."sbl_sync_total"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_reservation_customers"("p_business_id" "uuid", "p_query" "text") RETURNS TABLE("id" "uuid", "phone" "text", "first_name" "text", "last_name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_q text := lower(trim(coalesce(p_query, '')));
begin
  if not (
    exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = auth.uid())
    or public.is_platform_admin()
  ) then
    raise exception 'NOT_ALLOWED';
  end if;

  if v_q = '' then return; end if;

  return query
  select c.id, c.phone, c.first_name, c.last_name
  from public.reservation_customers c
  where c.business_id = p_business_id
    and (
      c.phone ilike '%' || v_q || '%'
      or lower(c.first_name) like '%' || v_q || '%'
      or lower(coalesce(c.last_name,'')) like '%' || v_q || '%'
      or lower(c.first_name || ' ' || coalesce(c.last_name,'')) like '%' || v_q || '%'
    )
  order by c.first_name, c.last_name
  limit 10;
end $$;


ALTER FUNCTION "public"."search_reservation_customers"("p_business_id" "uuid", "p_query" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_item_status"("p_order_item_id" "uuid", "p_status" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_biz uuid;
  v_order_id uuid;
  v_order_status text;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_status is null or p_status not in ('pending', 'preparing', 'ready', 'done') then
    raise exception 'INVALID_STATUS';
  end if;

  select o.business_id, o.id into v_biz, v_order_id
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.id = p_order_item_id;
  if v_order_id is null then raise exception 'ITEM_NOT_FOUND'; end if;

  if not (
    public.is_employee_of_business(v_biz)
    or exists (select 1 from public.businesses b where b.id = v_biz and b.owner_id = v_uid)
    or public.is_platform_admin()
  ) then
    raise exception 'NOT_EMPLOYEE';
  end if;

  update public.order_items set item_status = p_status where id = p_order_item_id;

  select o.status into v_order_status from public.orders o where o.id = v_order_id;

  return jsonb_build_object(
    'item_status', p_status,
    'order_id', v_order_id,
    'order_status', v_order_status
  );
end $$;


ALTER FUNCTION "public"."set_item_status"("p_order_item_id" "uuid", "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_reservation_status"("p_reservation_id" "uuid", "p_status" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_biz uuid;
  v_table_id uuid;
begin
  if p_status not in ('arrived','no_show','cancelled','pending') then
    raise exception 'BAD_STATUS';
  end if;

  select business_id into v_biz from public.reservations where id = p_reservation_id;
  if v_biz is null then raise exception 'RESERVATION_NOT_FOUND'; end if;

  if not (
    exists (select 1 from public.businesses b where b.id = v_biz and b.owner_id = auth.uid())
    or public.is_platform_admin()
  ) then
    raise exception 'NOT_ALLOWED';
  end if;

  update public.reservations set status = p_status where id = p_reservation_id;

  -- Al cancelar o no-show, liberar las mesas de esta reserva (vía RPC de F8, escribe log).
  if p_status in ('no_show','cancelled') then
    for v_table_id in
      select table_id from public.reservation_tables where reservation_id = p_reservation_id
    loop
      perform public.set_table_reserved(v_table_id, false, null, null);
    end loop;
  end if;
end $$;


ALTER FUNCTION "public"."set_reservation_status"("p_reservation_id" "uuid", "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_room_password"("room_id" "uuid", "password" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  _business_id uuid;
  _owner_id    uuid;
begin
  select r.business_id into _business_id
  from public.rooms r where r.id = room_id;

  if _business_id is null then
    raise exception 'Room not found';
  end if;

  select b.owner_id into _owner_id
  from public.businesses b where b.id = _business_id;

  if _owner_id is distinct from auth.uid() then
    raise exception 'Not authorized: only the business owner can set a room password';
  end if;

  if password is null or length(trim(password)) = 0 then
    update public.rooms
      set password_hash = null,
          is_password_protected = false
      where id = room_id;
    return true;
  end if;

  update public.rooms
    set password_hash = extensions.crypt(password, extensions.gen_salt('bf')),
        is_password_protected = true
    where id = room_id;

  return true;
end;
$$;


ALTER FUNCTION "public"."set_room_password"("room_id" "uuid", "password" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_tab_business_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  select t.business_id into new.business_id
  from public.tables t where t.id = new.table_id;
  if new.business_id is null then
    raise exception 'table_id % not found', new.table_id;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."set_tab_business_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_table_reserved"("p_table_id" "uuid", "p_reserved" boolean, "p_note" "text" DEFAULT NULL::"text", "p_until" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_biz   uuid;
  v_label text;
begin
  select business_id, label into v_biz, v_label
  from public.tables where id = p_table_id;
  if v_biz is null then raise exception 'TABLE_NOT_FOUND'; end if;

  if not (public.owns_business_of_table(p_table_id) or public.is_platform_admin()) then
    raise exception 'NOT_ALLOWED';
  end if;

  if p_reserved then
    update public.tables
    set is_reserved = true,
        reserved_note = nullif(trim(coalesce(p_note, '')), ''),
        reserved_until = p_until
    where id = p_table_id;
  else
    update public.tables
    set is_reserved = false,
        reserved_note = null,
        reserved_until = null
    where id = p_table_id;
  end if;

  insert into public.table_reservation_log
    (business_id, table_id, table_label, action, note, reserved_until, changed_by)
  values
    (v_biz, p_table_id, v_label,
     case when p_reserved then 'reserved' else 'released' end,
     nullif(trim(coalesce(p_note, '')), ''),
     case when p_reserved then p_until else null end,
     auth.uid());
end $$;


ALTER FUNCTION "public"."set_table_reserved"("p_table_id" "uuid", "p_reserved" boolean, "p_note" "text", "p_until" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_table_subchat"("p_table_id" "uuid", "p_enable" boolean) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_biz   uuid;
  v_room  uuid;
  v_main  uuid;
  v_label text;
begin
  select business_id, room_id, label into v_biz, v_room, v_label
  from public.tables where id = p_table_id;
  if v_biz is null then raise exception 'TABLE_NOT_FOUND'; end if;

  if not (public.owns_business_of_table(p_table_id) or public.is_platform_admin()) then
    raise exception 'NOT_ALLOWED';
  end if;

  if p_enable then
    if v_room is not null then return v_room; end if;
    select id into v_main from public.rooms
    where business_id = v_biz and is_main = true and is_active = true
    limit 1;
    if v_main is null then raise exception 'NO_MAIN_ROOM'; end if;

    insert into public.rooms (business_id, name, parent_room_id, is_main, is_active)
    values (v_biz, 'Mesa ' || v_label, v_main, false, true)
    returning id into v_room;

    update public.tables set room_id = v_room where id = p_table_id;
    return v_room;
  else
    if v_room is not null then
      update public.rooms set is_active = false where id = v_room;
      update public.tables set room_id = null where id = p_table_id;
    end if;
    return null;
  end if;
end $$;


ALTER FUNCTION "public"."set_table_subchat"("p_table_id" "uuid", "p_enable" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_table_subchat"("p_table_id" "uuid", "p_enable" boolean, "p_base_name" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_biz   uuid;
  v_room  uuid;
  v_main  uuid;
  v_label text;
begin
  select business_id, room_id, label into v_biz, v_room, v_label
  from public.tables where id = p_table_id;
  if v_biz is null then raise exception 'TABLE_NOT_FOUND'; end if;

  if not (public.owns_business_of_table(p_table_id) or public.is_platform_admin()) then
    raise exception 'NOT_ALLOWED';
  end if;

  if p_enable then
    if v_room is not null then return v_room; end if;
    select id into v_main from public.rooms
    where business_id = v_biz and is_main = true and is_active = true
    limit 1;
    if v_main is null then raise exception 'NO_MAIN_ROOM'; end if;

    insert into public.rooms (business_id, name, parent_room_id, is_main, is_active)
    values (v_biz, v_label, v_main, false, true)
    returning id into v_room;

    update public.tables set room_id = v_room where id = p_table_id;
    return v_room;
  else
    if v_room is not null then
      update public.rooms set is_active = false where id = v_room;
      update public.tables set room_id = null where id = p_table_id;
    end if;
    return null;
  end if;
end $$;


ALTER FUNCTION "public"."set_table_subchat"("p_table_id" "uuid", "p_enable" boolean, "p_base_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin new.updated_at = now(); return new; end; $$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."settle_tab_payment"("p_tab_payment_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_tab    uuid;
  v_status text;
  v_due    int;
begin
  select tab_id, status into v_tab, v_status
  from public.tab_payments
  where id = p_tab_payment_id
  for update;

  if v_tab is null then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;

  if v_status = 'succeeded' then
    return jsonb_build_object('already_settled', true, 'tab_id', v_tab);
  end if;

  update public.tab_payments
  set status = 'succeeded', paid_at = now()
  where id = p_tab_payment_id;

  update public.orders
  set paid_at = now()
  where tab_id = v_tab
    and paid_at is null
    and status not in ('cancelled', 'refunded');

  select coalesce(sum(o.total_cents), 0) into v_due
  from public.orders o
  where o.tab_id = v_tab
    and o.paid_at is null
    and status not in ('cancelled', 'refunded');

  if v_due = 0 then
    update public.table_tabs
    set status = 'paid', paid_at = now()
    where id = v_tab and status = 'open';
  end if;

  return jsonb_build_object('settled', true, 'remaining_due_cents', v_due, 'tab_id', v_tab);
end $$;


ALTER FUNCTION "public"."settle_tab_payment"("p_tab_payment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."social_actor_name"("p_user_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(nullif(display_name, ''), nullif(username, ''))
  from public.users where id = p_user_id;
$$;


ALTER FUNCTION "public"."social_actor_name"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."staff_set_order_status"("p_order_id" "uuid", "p_status" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_biz uuid;
begin
  if p_status not in ('confirmed','preparing','ready','delivered','cancelled') then raise exception 'invalid_status' using errcode = '22023'; end if;
  select business_id into v_biz from public.orders where id = p_order_id;
  if v_biz is null or not public.is_venue_staff(v_biz, auth.uid()) then raise exception 'not_staff' using errcode = '42501'; end if;
  update public.orders set status = p_status where id = p_order_id;
end;
$$;


ALTER FUNCTION "public"."staff_set_order_status"("p_order_id" "uuid", "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stamp_item_status_time"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if new.item_status is distinct from old.item_status then
    if new.item_status = 'preparing' and new.preparing_at is null then new.preparing_at := now(); end if;
    if new.item_status = 'ready'     and new.ready_at is null     then new.ready_at := now();     end if;
    if new.item_status = 'done'      and new.done_at is null      then new.done_at := now();      end if;
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."stamp_item_status_time"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dm_conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_a" "uuid" NOT NULL,
    "user_b" "uuid" NOT NULL,
    "last_message_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "hidden_at_a" timestamp with time zone,
    "hidden_at_b" timestamp with time zone,
    "ephemeral_business_id" "uuid",
    "first_sender_id" "uuid",
    "awaiting_reply" boolean DEFAULT false NOT NULL,
    "exit_hidden_at_a" timestamp with time zone,
    "exit_hidden_at_b" timestamp with time zone
);


ALTER TABLE "public"."dm_conversations" OWNER TO "postgres";


COMMENT ON COLUMN "public"."dm_conversations"."hidden_at_a" IS 'Momento en que user_a ocultó la conversación de su bandeja; mensajes anteriores no se le muestran. NULL = visible.';


COMMENT ON COLUMN "public"."dm_conversations"."hidden_at_b" IS 'Momento en que user_b ocultó la conversación de su bandeja; mensajes anteriores no se le muestran. NULL = visible.';


CREATE OR REPLACE FUNCTION "public"."start_dm"("p_target_id" "uuid") RETURNS "public"."dm_conversations"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_caller uuid := auth.uid(); v_user_a uuid; v_user_b uuid; v_setting text; v_conv public.dm_conversations;
begin
  if v_caller is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if v_caller = p_target_id then raise exception 'Cannot DM yourself' using errcode = 'P0001'; end if;
  if is_blocked(v_caller, p_target_id) then raise exception 'Blocked' using errcode = 'P0002'; end if;
  if v_caller < p_target_id then v_user_a := v_caller; v_user_b := p_target_id; else v_user_a := p_target_id; v_user_b := v_caller; end if;
  select * into v_conv from dm_conversations where user_a = v_user_a and user_b = v_user_b;
  select coalesce(privacy_settings->>'whoCanDMMe', 'everyone') into v_setting from users where id = p_target_id;
  if v_setting = 'nobody' then
    if v_conv.id is null then raise exception 'This user does not accept direct messages' using errcode = 'P0003'; end if;
    return v_conv;
  elsif v_setting = 'followers' then
    if not exists (select 1 from follows where follower_id = v_caller and following_id = p_target_id) then
      raise exception 'You must follow this user to send a direct message' using errcode = 'P0004';
    end if;
  end if;
  if v_conv.id is not null then return v_conv; end if;
  insert into dm_conversations (user_a, user_b) values (v_user_a, v_user_b)
  on conflict (user_a, user_b) do update set user_a = excluded.user_a
  returning * into v_conv;
  return v_conv;
end;
$$;


ALTER FUNCTION "public"."start_dm"("p_target_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_business_coords_radius"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  -- Coordenadas: lat/lng es el primario.
  if new.lat is not null and new.lng is not null then
    new.latitude := new.lat;
    new.longitude := new.lng;
  elsif new.latitude is not null and new.longitude is not null then
    new.lat := new.latitude;
    new.lng := new.longitude;
  end if;

  -- Radio: geofence_radius_m es el primario (el que valida el cap
  -- server-side trg_enforce_business_radius_cap).
  if new.geofence_radius_m is not null then
    new.radius_m := new.geofence_radius_m;
  else
    new.geofence_radius_m := new.radius_m; -- radius_m es NOT NULL, siempre hay valor de respaldo
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."sync_business_coords_radius"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_order_status_from_items"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_order_id uuid := coalesce(new.order_id, old.order_id);
  v_cur text;
  v_total int;
  v_ready int;
  v_started int;
  v_new text;
begin
  select o.status into v_cur from public.orders o where o.id = v_order_id;

  if v_cur is null or v_cur in ('delivered', 'cancelled', 'refunded') then
    return null;
  end if;

  select count(*),
         count(*) filter (where oi.item_status = 'ready'),
         count(*) filter (where oi.item_status in ('preparing', 'ready'))
    into v_total, v_ready, v_started
  from public.order_items oi
  where oi.order_id = v_order_id;

  if v_total = 0 then
    return null;
  end if;

  if v_ready = v_total then
    v_new := 'ready';
  elsif v_started > 0 then
    v_new := 'preparing';
  else
    v_new := 'confirmed';
  end if;

  if v_new is distinct from v_cur then
    update public.orders set status = v_new where id = v_order_id;
  end if;

  return null;
end $$;


ALTER FUNCTION "public"."sync_order_status_from_items"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tab_amount_due"("p_tab_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_biz uuid;
  v_amount int;
  v_count int;
  v_paid int;
begin
  select tt.business_id into v_biz from public.table_tabs tt where tt.id = p_tab_id;
  if v_biz is null then raise exception 'TAB_NOT_FOUND'; end if;

  if not (
    public.is_employee_of_business(v_biz)
    or exists (select 1 from public.businesses b where b.id = v_biz and b.owner_id = v_uid)
    or public.is_platform_admin()
  ) then
    raise exception 'NOT_ALLOWED';
  end if;

  select coalesce(sum(o.total_cents), 0), count(*)
    into v_amount, v_count
  from public.orders o
  where o.tab_id = p_tab_id
    and o.paid_at is null
    and o.status not in ('cancelled', 'refunded');

  select coalesce(sum(tp.amount_cents), 0) into v_paid
  from public.tab_payments tp
  where tp.tab_id = p_tab_id and tp.status = 'succeeded';

  return jsonb_build_object(
    'amount_cents', v_amount,
    'orders_count', v_count,
    'already_paid_cents', v_paid
  );
end $$;


ALTER FUNCTION "public"."tab_amount_due"("p_tab_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tables_set_short_code"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare v text;
begin
  if new.short_code is not null then return new; end if;
  loop
    v := public.gen_short_code(4);
    exit when not exists (select 1 from public.tables t where t.business_id = new.business_id and t.short_code = v);
  end loop;
  new.short_code := v;
  return new;
end;
$$;


ALTER FUNCTION "public"."tables_set_short_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tod_accept_terms"("p_version" "text" DEFAULT '2026-10'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  insert into public.tod_terms (user_id, version, accepted_at) values (v_uid, left(coalesce(p_version, '2026-10'), 20), now())
  on conflict (user_id) do update set version = excluded.version, accepted_at = now();
end;
$$;


ALTER FUNCTION "public"."tod_accept_terms"("p_version" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tod_applaud"("p_draw_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid := auth.uid(); v_draw public.tod_draws%rowtype; v_count int; v_new boolean;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_draw from public.tod_draws where id = p_draw_id;
  if v_draw.id is null or v_draw.status <> 'published' then return jsonb_build_object('status','denied','reason','not_found'); end if;
  if v_draw.user_id = v_uid then return jsonb_build_object('status','denied','reason','own_result'); end if;
  if public.is_blocked(v_uid, v_draw.user_id) then return jsonb_build_object('status','denied','reason','unavailable'); end if;
  if not public.can_access_room(v_draw.room_id) then return jsonb_build_object('status','denied','reason','not_in_room'); end if;

  insert into public.tod_votes (draw_id, voter_id) values (v_draw.id, v_uid) on conflict do nothing;
  get diagnostics v_count = row_count;
  v_new := v_count > 0;
  if v_new then
    update public.tod_draws set applause_count = applause_count + 1 where id = v_draw.id returning applause_count into v_count;
    perform public.tod_patch_message(v_draw.message_id, jsonb_build_object('applause', v_count));
  else
    select applause_count into v_count from public.tod_draws where id = v_draw.id;
  end if;
  return jsonb_build_object('status','ok','applause', v_count, 'new', v_new);
end;
$$;


ALTER FUNCTION "public"."tod_applaud"("p_draw_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tod_auto_hide_on_reports"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_type text; v_n int;
begin
  if new.content_type <> 'message' or new.content_id is null then return new; end if;
  select m.type into v_type from public.messages m where m.id = new.content_id;
  if v_type is null or v_type not like 'tod\_%' then return new; end if;
  select count(distinct reporter_id) into v_n from public.reports where content_type = 'message' and content_id = new.content_id and reporter_id is not null;
  if v_n >= 3 then
    perform set_config('jchat.trusted_message', 'on', true);
    update public.messages set hidden_at = coalesce(hidden_at, now()) where id = new.content_id;
    perform set_config('jchat.trusted_message', '', true);
    if v_type = 'tod_round' then
      update public.tod_rounds set status = 'hidden', closed_at = coalesce(closed_at, now())
       where message_id = new.content_id and status = 'active';
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."tod_auto_hide_on_reports"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tod_business_stats"("p_business_id" "uuid", "p_from" timestamp with time zone DEFAULT ("now"() - '30 days'::interval), "p_to" timestamp with time zone DEFAULT "now"()) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.is_venue_staff(p_business_id, v_uid) then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'rounds', (select count(*) from public.tod_rounds where business_id = p_business_id and created_at between p_from and p_to),
    'official_rounds', (select count(*) from public.tod_rounds where business_id = p_business_id and is_official and created_at between p_from and p_to),
    'unique_players', (select count(distinct user_id) from public.tod_draws where business_id = p_business_id and created_at between p_from and p_to),
    'draws', (select count(*) from public.tod_draws where business_id = p_business_id and created_at between p_from and p_to),
    'published', (select count(*) from public.tod_draws where business_id = p_business_id and status = 'published' and created_at between p_from and p_to),
    'by_category', (select coalesce(jsonb_object_agg(category, n), '{}'::jsonb) from (
        select r.category, count(*) n from public.tod_draws d join public.tod_rounds r on r.id = d.round_id
        where d.business_id = p_business_id and d.created_at between p_from and p_to group by r.category) x),
    'by_hour', (select coalesce(jsonb_object_agg(h, n), '{}'::jsonb) from (
        select extract(hour from d.created_at at time zone 'America/New_York')::int h, count(*) n from public.tod_draws d
        where d.business_id = p_business_id and d.created_at between p_from and p_to group by 1) y),
    'reports', (select count(*) from public.reports rp join public.messages m on m.id = rp.content_id
        join public.rooms ro on ro.id = m.room_id
        where rp.content_type = 'message' and m.type like 'tod\_%' and ro.business_id = p_business_id and rp.created_at between p_from and p_to)
  );
end;
$$;


ALTER FUNCTION "public"."tod_business_stats"("p_business_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tod_category_enabled"("p_business_id" "uuid", "p_category" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select p_category in ('classic','party','laughs','confessions','talent')
     and coalesce((select p_category = any(s.categories) from public.tod_settings s where s.business_id = p_business_id), true);
$$;


ALTER FUNCTION "public"."tod_category_enabled"("p_business_id" "uuid", "p_category" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tod_close_round"("p_round_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid := auth.uid(); v_round public.tod_rounds%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_round from public.tod_rounds where id = p_round_id for update;
  if v_round.id is null then return jsonb_build_object('status','denied','reason','not_found'); end if;
  if v_round.creator_id <> v_uid and not public.is_venue_staff(v_round.business_id, v_uid) then
    return jsonb_build_object('status','denied','reason','forbidden'); end if;
  if v_round.status <> 'active' then return jsonb_build_object('status','ok','already', true); end if;
  update public.tod_rounds set status = 'closed', closed_at = now() where id = v_round.id;
  perform public.tod_patch_message(v_round.message_id, jsonb_build_object('status','closed'));
  if v_round.creator_id <> v_uid then
    insert into public.tod_moderation_log (business_id, actor_id, action, target_type, target_id)
    values (v_round.business_id, v_uid, 'round_closed', 'round', v_round.id);
  end if;
  return jsonb_build_object('status','ok');
end;
$$;


ALTER FUNCTION "public"."tod_close_round"("p_round_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tod_create_round"("p_room_id" "uuid", "p_category" "text", "p_official" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid(); v_biz uuid; v_round public.tod_rounds%rowtype; v_last timestamptz; v_msg uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select r.business_id into v_biz from public.rooms r where r.id = p_room_id and r.is_active;
  if v_biz is null then return jsonb_build_object('status','denied','reason','room_not_found'); end if;
  if not exists (select 1 from public.users u where u.id = v_uid and u.age_confirmed_at is not null) then
    return jsonb_build_object('status','denied','reason','age_not_confirmed'); end if;
  if not exists (select 1 from public.users u where u.id = v_uid and coalesce((u.settings->>'gamesEnabled')::boolean, true)) then
    return jsonb_build_object('status','denied','reason','games_disabled'); end if;
  if not exists (select 1 from public.tod_terms t where t.user_id = v_uid) then
    return jsonb_build_object('status','denied','reason','terms_required'); end if;
  if not public.tod_enabled_for_business(v_biz) then return jsonb_build_object('status','denied','reason','game_disabled'); end if;
  if not public.tod_category_enabled(v_biz, p_category) then return jsonb_build_object('status','denied','reason','category_disabled'); end if;
  if exists (select 1 from public.tod_kicks k where k.business_id = v_biz and k.user_id = v_uid and k.lifted_at is null) then
    return jsonb_build_object('status','denied','reason','unavailable'); end if;

  if coalesce(p_official, false) then
    if not public.is_venue_staff(v_biz, v_uid) then return jsonb_build_object('status','denied','reason','not_staff'); end if;
  else
    if not public.can_access_room(p_room_id) then return jsonb_build_object('status','denied','reason','not_in_room'); end if;
    select max(created_at) into v_last from public.tod_rounds where creator_id = v_uid and business_id = v_biz and not is_official;
    if v_last is not null and v_last > now() - interval '5 minutes' then
      return jsonb_build_object('status','cooldown','seconds', ceil(extract(epoch from (v_last + interval '5 minutes' - now())))::int);
    end if;
  end if;

  insert into public.tod_rounds (business_id, room_id, creator_id, category, is_official)
  values (v_biz, p_room_id, v_uid, p_category, coalesce(p_official, false))
  returning * into v_round;

  v_msg := public.tod_post_message(p_room_id, v_uid, 'tod_round', 'Truth or Dare',
    jsonb_build_object('round_id', v_round.id, 'category', v_round.category, 'official', v_round.is_official,
                       'expires_at', v_round.expires_at, 'status', 'active', 'plays', 0));
  update public.tod_rounds set message_id = v_msg where id = v_round.id;

  if v_round.is_official then
    insert into public.tod_moderation_log (business_id, actor_id, action, target_type, target_id, detail)
    values (v_biz, v_uid, 'official_round', 'round', v_round.id, v_round.category);
  end if;

  return jsonb_build_object('status','ok','round_id', v_round.id, 'message_id', v_msg, 'expires_at', v_round.expires_at);
end;
$$;


ALTER FUNCTION "public"."tod_create_round"("p_room_id" "uuid", "p_category" "text", "p_official" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tod_decide"("p_draw_id" "uuid", "p_publish" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid := auth.uid(); v_draw public.tod_draws%rowtype; v_round public.tod_rounds%rowtype; v_msg uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_draw from public.tod_draws where id = p_draw_id and user_id = v_uid for update;
  if v_draw.id is null then return jsonb_build_object('status','denied','reason','not_found'); end if;
  if v_draw.status <> 'drawn' then return jsonb_build_object('status','denied','reason','already_decided'); end if;

  if not coalesce(p_publish, false) then
    update public.tod_draws set status = 'passed', decided_at = now() where id = v_draw.id;
    return jsonb_build_object('status','ok','published', false);
  end if;

  select * into v_round from public.tod_rounds where id = v_draw.round_id;
  if v_draw.created_at <= now() - interval '15 minutes' then return jsonb_build_object('status','denied','reason','draw_expired'); end if;
  if v_round.status = 'hidden' or exists (select 1 from public.tod_kicks k where k.business_id = v_draw.business_id and k.user_id = v_uid and k.lifted_at is null) then
    return jsonb_build_object('status','denied','reason','unavailable'); end if;
  if not public.venue_presence_ok(v_draw.business_id, v_uid) then return jsonb_build_object('status','denied','reason','not_in_venue'); end if;

  v_msg := public.tod_post_message(v_draw.room_id, v_uid, 'tod_draw', '',
    jsonb_build_object('round_id', v_draw.round_id, 'draw_id', v_draw.id, 'category', v_round.category, 'kind', v_draw.kind,
                       'is_random', v_draw.is_random, 'concept_id', v_draw.concept_id, 'applause', 0));
  update public.tod_draws set status = 'published', decided_at = now(), message_id = v_msg where id = v_draw.id;
  return jsonb_build_object('status','ok','published', true, 'message_id', v_msg);
end;
$$;


ALTER FUNCTION "public"."tod_decide"("p_draw_id" "uuid", "p_publish" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tod_draw"("p_round_id" "uuid", "p_choice" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid(); v_round public.tod_rounds%rowtype; v_last timestamptz; v_kind text; v_random boolean := false;
  v_concept text; v_draw public.tod_draws%rowtype; v_plays int;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_choice not in ('truth','dare','random') then raise exception 'invalid_choice' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('tod_draw:' || v_uid::text));

  select * into v_round from public.tod_rounds where id = p_round_id;
  if v_round.id is null then return jsonb_build_object('status','denied','reason','round_not_found'); end if;
  if v_round.status <> 'active' or v_round.expires_at <= now() then return jsonb_build_object('status','denied','reason','round_ended'); end if;
  if v_round.creator_id = v_uid then return jsonb_build_object('status','denied','reason','own_round'); end if;
  if not exists (select 1 from public.tod_terms t where t.user_id = v_uid) then return jsonb_build_object('status','denied','reason','terms_required'); end if;
  if not exists (select 1 from public.users u where u.id = v_uid and u.age_confirmed_at is not null
                 and coalesce((u.settings->>'gamesEnabled')::boolean, true)) then
    return jsonb_build_object('status','denied','reason','unavailable'); end if;
  if not public.tod_enabled_for_business(v_round.business_id) or not public.tod_category_enabled(v_round.business_id, v_round.category) then
    return jsonb_build_object('status','denied','reason','game_disabled'); end if;
  if exists (select 1 from public.tod_kicks k where k.business_id = v_round.business_id and k.user_id = v_uid and k.lifted_at is null)
     or public.is_blocked(v_uid, v_round.creator_id) then
    return jsonb_build_object('status','denied','reason','unavailable'); end if;
  if not public.can_access_room(v_round.room_id) then return jsonb_build_object('status','denied','reason','not_in_room'); end if;

  select * into v_draw from public.tod_draws
   where user_id = v_uid and business_id = v_round.business_id and status = 'drawn' and created_at > now() - interval '15 minutes'
   order by created_at desc limit 1;
  if v_draw.id is not null then
    return jsonb_build_object('status','pending','draw_id', v_draw.id, 'round_id', v_draw.round_id, 'kind', v_draw.kind,
                              'is_random', v_draw.is_random, 'concept_id', v_draw.concept_id);
  end if;

  select max(created_at) into v_last from public.tod_draws where user_id = v_uid and business_id = v_round.business_id;
  if v_last is not null and v_last > now() - interval '5 minutes' then
    return jsonb_build_object('status','cooldown','seconds', ceil(extract(epoch from (v_last + interval '5 minutes' - now())))::int);
  end if;

  if p_choice = 'random' then
    v_random := true;
    v_kind := case when random() < 0.7 then 'dare' else 'truth' end;
  else
    v_kind := p_choice;
  end if;

  select c.concept_id into v_concept
    from (select distinct concept_id from public.tod_cards where category = v_round.category and kind = v_kind and active) c
   where c.concept_id not in (select d.concept_id from public.tod_draws d
                               where d.user_id = v_uid and d.business_id = v_round.business_id and d.created_at > now() - interval '12 hours')
   order by random() limit 1;
  if v_concept is null then
    select c.concept_id into v_concept
      from (select distinct concept_id from public.tod_cards where category = v_round.category and kind = v_kind and active) c
     order by random() limit 1;
  end if;
  if v_concept is null then return jsonb_build_object('status','denied','reason','no_cards'); end if;

  insert into public.tod_draws (round_id, business_id, room_id, user_id, kind, is_random, concept_id)
  values (v_round.id, v_round.business_id, v_round.room_id, v_uid, v_kind, v_random, v_concept)
  returning * into v_draw;

  select count(distinct user_id) into v_plays from public.tod_draws where round_id = v_round.id;
  update public.tod_rounds set plays_count = v_plays where id = v_round.id;
  perform public.tod_patch_message(v_round.message_id, jsonb_build_object('plays', v_plays));

  return jsonb_build_object('status','ok','draw_id', v_draw.id, 'round_id', v_round.id, 'kind', v_kind,
                            'is_random', v_random, 'concept_id', v_concept);
end;
$$;


ALTER FUNCTION "public"."tod_draw"("p_round_id" "uuid", "p_choice" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tod_enabled_for_business"("p_business_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce((select bg.enabled from public.business_games bg where bg.business_id = p_business_id and bg.game_key = 'truth_or_dare'), false)
     and exists (select 1 from public.games g where g.key = 'truth_or_dare' and g.is_active);
$$;


ALTER FUNCTION "public"."tod_enabled_for_business"("p_business_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tod_expire"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare r record; n int := 0;
begin
  for r in update public.tod_rounds set status = 'expired', closed_at = now()
            where status = 'active' and expires_at <= now() returning message_id loop
    perform public.tod_patch_message(r.message_id, jsonb_build_object('status','expired'));
    n := n + 1;
  end loop;
  update public.tod_draws set status = 'passed', decided_at = now() where status = 'drawn' and created_at <= now() - interval '15 minutes';
  return n;
end;
$$;


ALTER FUNCTION "public"."tod_expire"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tod_kick"("p_business_id" "uuid", "p_user_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.is_venue_staff(p_business_id, v_uid) then return jsonb_build_object('status','denied','reason','forbidden'); end if;
  if public.is_venue_staff(p_business_id, p_user_id) then return jsonb_build_object('status','denied','reason','invalid_target'); end if;
  insert into public.tod_kicks (business_id, user_id, kicked_by, reason) values (p_business_id, p_user_id, v_uid, left(p_reason, 300))
  on conflict (business_id, user_id) do update set kicked_by = excluded.kicked_by, reason = excluded.reason, created_at = now(),
     lifted_at = null, lifted_by = null;
  update public.tod_draws set status = 'passed', decided_at = now()
   where user_id = p_user_id and business_id = p_business_id and status = 'drawn';
  insert into public.tod_moderation_log (business_id, actor_id, action, target_type, target_id, detail)
  values (p_business_id, v_uid, 'kick', 'user', p_user_id, left(p_reason, 300));
  return jsonb_build_object('status','ok');
end;
$$;


ALTER FUNCTION "public"."tod_kick"("p_business_id" "uuid", "p_user_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tod_patch_message"("p_message_id" "uuid", "p_patch" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if p_message_id is null then return; end if;
  perform set_config('jchat.trusted_message', 'on', true);
  update public.messages set metadata = coalesce(metadata, '{}'::jsonb) || p_patch where id = p_message_id;
  perform set_config('jchat.trusted_message', '', true);
end;
$$;


ALTER FUNCTION "public"."tod_patch_message"("p_message_id" "uuid", "p_patch" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tod_post_message"("p_room_id" "uuid", "p_user_id" "uuid", "p_type" "text", "p_body" "text", "p_metadata" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_id uuid;
begin
  perform set_config('jchat.trusted_message', 'on', true);
  insert into public.messages (room_id, user_id, body, type, metadata, is_system)
  values (p_room_id, p_user_id, p_body, p_type, p_metadata, false)
  returning id into v_id;
  perform set_config('jchat.trusted_message', '', true);
  return v_id;
end;
$$;


ALTER FUNCTION "public"."tod_post_message"("p_room_id" "uuid", "p_user_id" "uuid", "p_type" "text", "p_body" "text", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tod_purge"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  delete from public.tod_rounds where created_at < now() - interval '90 days';
  delete from public.tod_moderation_log where created_at < now() - interval '365 days';
end;
$$;


ALTER FUNCTION "public"."tod_purge"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tod_resolve_report"("p_report_id" "uuid", "p_status" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid := auth.uid(); v_biz uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_status not in ('resolved','dismissed') then raise exception 'invalid_status' using errcode = '22023'; end if;
  select r.business_id into v_biz
    from public.reports r
    join public.messages m on m.id = r.content_id
   where r.id = p_report_id and r.content_type = 'message' and m.type in ('tod_round','tod_draw')
     and exists (select 1 from public.businesses b where b.id = r.business_id and b.owner_id = v_uid);
  if v_biz is null then raise exception 'not_owner_or_not_found' using errcode = '42501'; end if;
  update public.reports
     set status = p_status, resolved_by = v_uid, resolved_at = now(),
         resolution = coalesce(resolution, case when p_status = 'resolved' then 'venue_owner_resolved' else 'venue_owner_dismissed' end)
   where id = p_report_id;
  insert into public.tod_moderation_log (business_id, actor_id, action, target_type, target_id, detail)
  values (v_biz, v_uid, 'report_' || p_status, 'report', p_report_id, '{}'::jsonb);
end $$;


ALTER FUNCTION "public"."tod_resolve_report"("p_report_id" "uuid", "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tod_staff_hide"("p_message_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid := auth.uid(); v_msg record; v_biz uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select m.id, m.type, m.metadata, m.room_id into v_msg from public.messages m where m.id = p_message_id;
  if v_msg.id is null or v_msg.type not like 'tod\_%' then return jsonb_build_object('status','denied','reason','not_found'); end if;
  select r.business_id into v_biz from public.rooms r where r.id = v_msg.room_id;
  if not public.is_venue_staff(v_biz, v_uid) then return jsonb_build_object('status','denied','reason','forbidden'); end if;

  perform set_config('jchat.trusted_message', 'on', true);
  update public.messages set hidden_at = now(), hidden_by = v_uid where id = p_message_id;
  perform set_config('jchat.trusted_message', '', true);
  if v_msg.type = 'tod_round' then
    update public.tod_rounds set status = 'hidden', closed_at = now() where id = (v_msg.metadata->>'round_id')::uuid;
  end if;
  insert into public.tod_moderation_log (business_id, actor_id, action, target_type, target_id, detail)
  values (v_biz, v_uid, 'hide', v_msg.type, p_message_id, left(p_reason, 300));
  return jsonb_build_object('status','ok');
end;
$$;


ALTER FUNCTION "public"."tod_staff_hide"("p_message_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tod_unkick"("p_business_id" "uuid", "p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid := auth.uid(); v_n int;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.is_venue_staff(p_business_id, v_uid) then return jsonb_build_object('status','denied','reason','forbidden'); end if;
  update public.tod_kicks set lifted_at = now(), lifted_by = v_uid
   where business_id = p_business_id and user_id = p_user_id and lifted_at is null;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    insert into public.tod_moderation_log (business_id, actor_id, action, target_type, target_id)
    values (p_business_id, v_uid, 'unkick', 'user', p_user_id);
  end if;
  return jsonb_build_object('status','ok');
end;
$$;


ALTER FUNCTION "public"."tod_unkick"("p_business_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_deactivate_table_subchat"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if old.room_id is not null then
    update public.rooms set is_active = false where id = old.room_id;
  end if;
  return old;
end $$;


ALTER FUNCTION "public"."trg_deactivate_table_subchat"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_fn_assign_room_qr_token"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.qr_token is null then
    new.qr_token := public.generate_room_qr_token(
                      new.business_id,
                      new.parent_room_id is not null
                    );
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."trg_fn_assign_room_qr_token"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_fn_assign_table_qr_token"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.qr_token is null then
    new.qr_token := public.generate_table_qr_token(new.business_id);
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."trg_fn_assign_table_qr_token"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_fn_tab_payment_defaults"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  select tt.business_id into new.business_id
  from public.table_tabs tt where tt.id = new.tab_id;
  if new.business_id is null then
    raise exception 'tab_id % not found', new.tab_id;
  end if;
  if new.pay_token is null then
    new.pay_token := public.generate_tab_pay_token(new.business_id);
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."trg_fn_tab_payment_defaults"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_fn_table_session_autoclose"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if ((new.paid_at is not null and old.paid_at is null) or (new.canceled_at is not null and old.canceled_at is null)) then
    if new.table_id is not null and not exists (
      select 1 from public.orders o where o.table_id = new.table_id and o.id <> new.id and o.paid_at is null and o.canceled_at is null
    ) then
      update public.tables set access_code = null, session_opened_at = null, session_opened_by = null where id = new.table_id;
      update public.guest_tab_sessions set revoked_at = now() where table_id = new.table_id and revoked_at is null;
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."trg_fn_table_session_autoclose"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."trg_fn_table_session_autoclose"() IS 'Trigger: limpia access_code/session_* en tables y revoca guest_tab_sessions cuando la última orden de la mesa se paga o cancela. F2 + F3.';


CREATE OR REPLACE FUNCTION "public"."unblock_user"("p_target" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  delete from public.blocks where blocker_id = v_me and blocked_id = p_target;
end; $$;


ALTER FUNCTION "public"."unblock_user"("p_target" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_my_settings"("p_patch" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_key text;
  v_val jsonb;
  v_hint_key text;
  v_hint_val jsonb;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'invalid_patch' using errcode = '22023'; end if;

  for v_key, v_val in select * from jsonb_each(p_patch) loop
    case v_key
      when 'notifWork', 'notifSocial', 'gamesEnabled', 'matchNotifyNewPeople' then
        if jsonb_typeof(v_val) <> 'boolean' then raise exception 'invalid_value_for_%', v_key using errcode = '22023'; end if;
      when 'proximityMode' then
        if jsonb_typeof(v_val) <> 'string' or (v_val #>> '{}') not in ('all','favorites','visited','off') then raise exception 'invalid_value_for_%', v_key using errcode = '22023'; end if;
      when 'appearance' then
        if jsonb_typeof(v_val) <> 'string' or (v_val #>> '{}') not in ('dark','light','system') then raise exception 'invalid_value_for_%', v_key using errcode = '22023'; end if;
      when 'feedRadiusMiles' then
        if jsonb_typeof(v_val) <> 'number' or (v_val #>> '{}') not in ('5','10','25','50','100') then raise exception 'invalid_value_for_%', v_key using errcode = '22023'; end if;
      when 'pushPreviewDm', 'pushPreviewMatch' then
        if jsonb_typeof(v_val) <> 'string' or (v_val #>> '{}') not in ('full','name','discreet') then raise exception 'invalid_value_for_%', v_key using errcode = '22023'; end if;
      when 'matchAgeMin', 'matchAgeMax' then
        if jsonb_typeof(v_val) <> 'number' or (v_val #>> '{}')::numeric < 18 or (v_val #>> '{}')::numeric > 99 then raise exception 'invalid_value_for_%', v_key using errcode = '22023'; end if;
      when 'hints' then
        if jsonb_typeof(v_val) <> 'object' then raise exception 'invalid_value_for_%', v_key using errcode = '22023'; end if;
        for v_hint_key, v_hint_val in select * from jsonb_each(v_val) loop
          if v_hint_key not in ('profileMenuSeen') then raise exception 'unknown_hint_%', v_hint_key using errcode = '22023'; end if;
          if jsonb_typeof(v_hint_val) <> 'boolean' then raise exception 'invalid_value_for_hints.%', v_hint_key using errcode = '22023'; end if;
        end loop;
      else
        raise exception 'unknown_setting_%', v_key using errcode = '22023';
    end case;
  end loop;

  update public.users u
     set settings = (coalesce(u.settings, '{}'::jsonb) || (p_patch - 'hints'))
                    || case when p_patch ? 'hints' then
                         jsonb_build_object('hints',
                           (case when jsonb_typeof(u.settings -> 'hints') = 'object' then u.settings -> 'hints' else '{}'::jsonb end)
                           || (p_patch -> 'hints'))
                       else '{}'::jsonb end
   where u.id = v_uid
  returning u.settings into v_result;
  return coalesce(v_result, '{}'::jsonb);
end;
$$;


ALTER FUNCTION "public"."update_my_settings"("p_patch" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_reservation"("p_reservation_id" "uuid", "p_reserved_at" timestamp with time zone, "p_party_size" integer, "p_table_ids" "uuid"[], "p_event_type" "text" DEFAULT NULL::"text", "p_phone" "text" DEFAULT NULL::"text", "p_first_name" "text" DEFAULT NULL::"text", "p_last_name" "text" DEFAULT NULL::"text", "p_special_requests" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_biz uuid;
  v_customer_id uuid;
  v_table_id uuid;
  v_note text;
  v_has_tables boolean := (p_table_ids is not null and array_length(p_table_ids, 1) is not null);
  v_old_table_id uuid;
begin
  select business_id, customer_id into v_biz, v_customer_id
  from public.reservations where id = p_reservation_id;
  if v_biz is null then raise exception 'RESERVATION_NOT_FOUND'; end if;
  if not (
    exists (select 1 from public.businesses b where b.id = v_biz and b.owner_id = auth.uid())
    or public.is_platform_admin()
  ) then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_party_size is null or p_party_size < 1 then raise exception 'BAD_PARTY_SIZE'; end if;
  if p_first_name is null or trim(p_first_name) = '' then raise exception 'NO_CUSTOMER_NAME'; end if;
  if v_has_tables and exists (
    select 1 from unnest(p_table_ids) tid
    where not exists (select 1 from public.tables t where t.id = tid and t.business_id = v_biz)
  ) then
    raise exception 'TABLE_NOT_IN_BUSINESS';
  end if;
  if v_customer_id is not null then
    update public.reservation_customers
    set phone = nullif(trim(coalesce(p_phone,'')),''),
        first_name = trim(p_first_name),
        last_name = nullif(trim(coalesce(p_last_name,'')),'')
    where id = v_customer_id;
  end if;
  update public.reservations
  set reserved_at = p_reserved_at,
      party_size = p_party_size,
      event_type = nullif(trim(coalesce(p_event_type,'')),''),
      special_requests = nullif(trim(coalesce(p_special_requests,'')),'')
  where id = p_reservation_id;
  for v_old_table_id in
    select table_id from public.reservation_tables where reservation_id = p_reservation_id
  loop
    perform public.set_table_reserved(v_old_table_id, false, null, null);
  end loop;
  delete from public.reservation_tables where reservation_id = p_reservation_id;
  if v_has_tables then
    v_note := trim(p_first_name) || coalesce(' ' || nullif(trim(coalesce(p_last_name,'')),''), '') || ' · ' || p_party_size::text || 'p';
    foreach v_table_id in array p_table_ids loop
      insert into public.reservation_tables (reservation_id, table_id)
      values (p_reservation_id, v_table_id)
      on conflict do nothing;
      perform public.set_table_reserved(v_table_id, true, v_note, p_reserved_at);
    end loop;
  end if;
end $$;


ALTER FUNCTION "public"."update_reservation"("p_reservation_id" "uuid", "p_reserved_at" timestamp with time zone, "p_party_size" integer, "p_table_ids" "uuid"[], "p_event_type" "text", "p_phone" "text", "p_first_name" "text", "p_last_name" "text", "p_special_requests" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_has_tab_at_table"("p_table_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1 from public.table_tabs tt
    where tt.table_id = p_table_id and tt.owner_uid = auth.uid()
  );
$$;


ALTER FUNCTION "public"."user_has_tab_at_table"("p_table_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."username_available"("check_username" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select not exists (
    select 1 from public.users
    where lower(username) = lower(trim(check_username))
  );
$$;


ALTER FUNCTION "public"."username_available"("check_username" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."users_is_test_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is not null and new.is_test is distinct from old.is_test then
    raise exception 'is_test_readonly' using errcode = '42501';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."users_is_test_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_business_subdomain"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $_$
begin
  if new.subdomain is null then return new; end if;
  new.subdomain := lower(new.subdomain);
  if new.subdomain !~ '^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])$' then raise exception 'subdomain_invalid' using errcode = '22023'; end if;
  if new.subdomain in ('www','app','api','admin','dashboard','mail','soporte','support','help','ayuda','static','cdn','assets','m','c','t','auth','login','pos','kds','superadmin','status','docs','blog','jchat','otunity') then
    raise exception 'subdomain_reserved' using errcode = '22023';
  end if;
  return new;
end;
$_$;


ALTER FUNCTION "public"."validate_business_subdomain"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_promo_code"("p_code" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_promo public.promo_codes%rowtype;
begin
  -- Devuelve {valid:false, reason:...} en vez de lanzar excepción: la UI necesita
  -- mostrar un mensaje claro, no un error técnico.
  if auth.uid() is null then
    return jsonb_build_object('valid', false, 'reason', 'NOT_AUTHENTICATED');
  end if;

  select * into v_promo from public.promo_codes
   where code = upper(btrim(p_code));

  if not found then
    return jsonb_build_object('valid', false, 'reason', 'CODE_NOT_FOUND');
  end if;
  if not v_promo.active then
    return jsonb_build_object('valid', false, 'reason', 'CODE_INACTIVE');
  end if;
  if v_promo.redeemed_by is not null then
    return jsonb_build_object('valid', false, 'reason', 'CODE_ALREADY_USED');
  end if;
  if v_promo.expires_at is not null and v_promo.expires_at <= now() then
    return jsonb_build_object('valid', false, 'reason', 'CODE_EXPIRED');
  end if;

  -- NO consume el código. Solo informa para que la UI muestre qué otorgaría.
  return jsonb_build_object(
    'valid', true,
    'plan', v_promo.plan,
    'trial_days', v_promo.trial_days
  );
end;
$$;


ALTER FUNCTION "public"."validate_promo_code"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."venue_distance_m"("p_business_id" "uuid", "p_lat" double precision, "p_lng" double precision) RETURNS double precision
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select case when b.lat is null or b.lng is null or p_lat is null or p_lng is null then null
              else public.geo_distance_m(p_lat, p_lng, b.lat, b.lng) end
  from public.businesses b where b.id = p_business_id;
$$;


ALTER FUNCTION "public"."venue_distance_m"("p_business_id" "uuid", "p_lat" double precision, "p_lng" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."venue_exits_purge"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare r record; n int := 0;
begin
  for r in select user_id, business_id from public.venue_exits where purge_at <= now() loop
    delete from public.dm_conversations c
      where c.ephemeral_business_id = r.business_id
        and (c.user_a = r.user_id or c.user_b = r.user_id)
        and c.exit_hidden_at_a is not null and c.exit_hidden_at_b is not null
        and not exists (select 1 from public.follow_requests fr where fr.status = 'pending'
          and ((fr.requester_id = c.user_a and fr.target_id = c.user_b) or (fr.requester_id = c.user_b and fr.target_id = c.user_a)));
    perform public.match_wipe_user_venue_keep_dms(r.user_id, r.business_id);
    delete from public.venue_exits where user_id = r.user_id and business_id = r.business_id;
    n := n + 1;
  end loop;
  return n;
end $$;


ALTER FUNCTION "public"."venue_exits_purge"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."venue_inside"("p_business_id" "uuid", "p_lat" double precision, "p_lng" double precision) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(public.venue_distance_m(p_business_id, p_lat, p_lng) <= b.geofence_radius_m + 25, false)
  from public.businesses b where b.id = p_business_id;
$$;


ALTER FUNCTION "public"."venue_inside"("p_business_id" "uuid", "p_lat" double precision, "p_lng" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."venue_order_access"("p_business_id" "uuid", "p_lat" double precision DEFAULT NULL::double precision, "p_lng" double precision DEFAULT NULL::double precision) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid := auth.uid(); v_inside boolean; v_pickup boolean;
begin
  select pickup_enabled into v_pickup from public.businesses where id = p_business_id;
  v_inside := (v_uid is not null and (public.venue_presence_ok(p_business_id, v_uid) or public.is_venue_staff(p_business_id, v_uid)))
              or public.venue_inside(p_business_id, p_lat, p_lng);
  return jsonb_build_object('inside', v_inside, 'pickup_enabled', coalesce(v_pickup,false),
    'allowed_types', case when v_inside then jsonb_build_array('table','counter','gift')
                          when coalesce(v_pickup,false) then jsonb_build_array('counter') else '[]'::jsonb end);
end;
$$;


ALTER FUNCTION "public"."venue_order_access"("p_business_id" "uuid", "p_lat" double precision, "p_lng" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."venue_people_counts"("p_business_ids" "uuid"[]) RETURNS TABLE("business_id" "uuid", "people" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select r.business_id, count(distinct g.user_id)::int
  from public.room_geo_presence g
  join public.rooms r on r.id = g.room_id
  where r.business_id = any (p_business_ids) and g.expires_at > now()
  group by r.business_id
$$;


ALTER FUNCTION "public"."venue_people_counts"("p_business_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."venue_presence_ok"("p_business_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.room_geo_presence gp
    join public.rooms r on r.id = gp.room_id
    where r.business_id = p_business_id and gp.user_id = p_user_id and gp.expires_at > now()
  );
$$;


ALTER FUNCTION "public"."venue_presence_ok"("p_business_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."venue_present_users"("p_business_id" "uuid", "p_user_ids" "uuid"[]) RETURNS "uuid"[]
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or p_business_id is null or p_user_ids is null then
    return '{}'::uuid[];
  end if;

  -- Quien pregunta tiene que estar presente en este mismo local: si no, nadie puede usar la función para sondear un local.
  if not public.venue_presence_ok(p_business_id, v_uid) then
    return '{}'::uuid[];
  end if;

  return coalesce((
    select array_agg(c.id)
    from (
      select distinct x.id
      from unnest(p_user_ids[1:100]) as x(id)  -- como mucho 100 (se corta el resto) y sin duplicados
      where x.id is not null
    ) c
    where public.venue_presence_ok(p_business_id, c.id)
      and not exists (  -- misma regla que gift_available: sin bloqueo en ningún sentido con quien pregunta
        select 1 from public.blocks b
        where (b.blocker_id = v_uid and b.blocked_id = c.id) or (b.blocker_id = c.id and b.blocked_id = v_uid)
      )
  ), '{}'::uuid[]);
end;
$$;


ALTER FUNCTION "public"."venue_present_users"("p_business_id" "uuid", "p_user_ids" "uuid"[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."venue_present_users"("p_business_id" "uuid", "p_user_ids" "uuid"[]) IS 'Filtro de la lista de la sala: de los ids dados (máx. 100), los que tienen presencia de geo vigente en el local y ningún bloqueo con quien pregunta. Vacío si quien pregunta no está presente en el local. Nunca devuelve un id que no se le haya pasado.';


CREATE OR REPLACE FUNCTION "public"."venue_session_end"("p_business_id" "uuid", "p_reason" "text" DEFAULT 'outside_radius'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'auth_required'; end if;
  delete from public.room_geo_presence g using public.rooms r
    where r.id = g.room_id and r.business_id = p_business_id and g.user_id = v_uid;
  delete from public.room_members m using public.rooms r
    where r.id = m.room_id and r.business_id = p_business_id and m.user_id = v_uid;
  update public.dm_conversations set exit_hidden_at_a = now()
    where ephemeral_business_id = p_business_id and user_a = v_uid;
  update public.dm_conversations set exit_hidden_at_b = now()
    where ephemeral_business_id = p_business_id and user_b = v_uid;
  update public.match_presence set expires_at = now()
    where user_id = v_uid and business_id = p_business_id and expires_at > now();
  insert into public.venue_exits (user_id, business_id, reason) values (v_uid, p_business_id, p_reason)
    on conflict (user_id, business_id) do update
      set exited_at = now(), purge_at = now() + interval '1 hour', reason = excluded.reason;
end $$;


ALTER FUNCTION "public"."venue_session_end"("p_business_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."venue_session_expires_at"("p_business_id" "uuid") RETURNS timestamp with time zone
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  c_fallback constant timestamptz := now() + interval '24 hours';
  -- extract(dow): 0 = domingo … 6 = sábado  →  índice + 1
  c_keys     constant text[] := array['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  v_now      timestamptz := now();
  v_hours    jsonb;
  v_tz       text;
  v_today    date;
  v_date     date;
  v_day      jsonb;
  v_open     time;
  v_close    time;
  v_end      timestamptz;
  v_result   timestamptz;
  v_i        int;
begin
  select b.hours, b.timezone into v_hours, v_tz
  from public.businesses b
  where b.id = p_business_id;

  if not found or v_hours is null or v_hours = '{}'::jsonb then
    return c_fallback;
  end if;

  begin
    v_tz    := coalesce(nullif(btrim(v_tz), ''), 'America/New_York');
    v_today := (v_now at time zone v_tz)::date;   -- la fecha de hoy EN LA ZONA DEL LOCAL

    -- i = -1: ayer · i = 0: hoy · i = 1..7: los próximos días
    for v_i in -1..7 loop
      v_date := v_today + v_i;
      v_day  := v_hours -> c_keys[extract(dow from v_date)::int + 1];

      if v_day is null
         or coalesce((v_day ->> 'closed')::boolean, false)
         or v_day ->> 'open' is null
         or v_day ->> 'close' is null then
        if v_i = 0 then
          return c_fallback;      -- hoy cerrado o sin horario → 24 h
        end if;
        continue;                 -- ayer o un día futuro cerrado: se salta
      end if;

      v_open  := (v_day ->> 'open')::time;
      v_close := (v_day ->> 'close')::time;

      -- Cierre de esa jornada: el mismo día, o el siguiente si cierra pasada la medianoche (close <= open).
      if v_close <= v_open then
        v_end := ((v_date + 1) + v_close) at time zone v_tz;
      else
        v_end := (v_date + v_close) at time zone v_tz;
      end if;

      if v_i = -1 then
        -- (1) Jornada de ayer: solo cuenta si cruzaba la medianoche y todavía no cerró.
        if v_close <= v_open and v_end > v_now then
          v_result := v_end;
          exit;
        end if;
        continue;
      end if;

      -- Hoy (i = 0): si su cierre ya pasó se sigue con el siguiente día abierto. Días futuros: su cierre siempre es futuro.
      if v_end > v_now then
        v_result := v_end;
        exit;
      end if;
    end loop;
  exception when others then
    return c_fallback;           -- hora mal escrita, zona desconocida, 'closed' que no es booleano…
  end;

  if v_result is null or v_result < v_now + interval '1 hour' then
    return c_fallback;
  end if;
  return v_result;
end;
$$;


ALTER FUNCTION "public"."venue_session_expires_at"("p_business_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."venue_session_expires_at"("p_business_id" "uuid") IS 'Instante en que vence una sesión de local entrando ahora: hora de cierre según businesses.hours y businesses.timezone; 24 h si no hay horario, hoy está cerrado, el dato es inválido o el cierre cae a menos de 1 h. Solo la usan otras funciones definer.';


CREATE OR REPLACE FUNCTION "public"."venue_session_resume"("p_business_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid := auth.uid(); v_found boolean;
begin
  if v_uid is null then raise exception 'auth_required'; end if;
  delete from public.venue_exits where user_id = v_uid and business_id = p_business_id and purge_at > now()
    returning true into v_found;
  if coalesce(v_found, false) then
    update public.dm_conversations set exit_hidden_at_a = null
      where ephemeral_business_id = p_business_id and user_a = v_uid;
    update public.dm_conversations set exit_hidden_at_b = null
      where ephemeral_business_id = p_business_id and user_b = v_uid;
  end if;
  return coalesce(v_found, false);
end $$;


ALTER FUNCTION "public"."venue_session_resume"("p_business_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."venue_table_labels"("p_business_id" "uuid") RETURNS TABLE("label" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select t.label
  from public.tables t
  where auth.uid() is not null
    and t.business_id = p_business_id
    and t.is_active
    and public.venue_presence_ok(p_business_id, auth.uid())
  order by (substring(t.label from '\d{1,9}'))::int asc nulls last, lower(t.label), t.label;
$$;


ALTER FUNCTION "public"."venue_table_labels"("p_business_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."venue_table_labels"("p_business_id" "uuid") IS 'Etiquetas (solo label) de las mesas activas del negocio, en orden natural, para una persona con sesión que está dentro del local (venue_presence_ok). Si no: lista vacía, sin error. Nunca devuelve tokens ni códigos de la mesa.';


CREATE OR REPLACE FUNCTION "public"."verify_room_password"("room_id" "uuid", "password" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  _hash text;
  _attempt public.room_access_attempts%rowtype;
begin
  select * into _attempt from public.room_access_attempts
    where room_access_attempts.room_id = verify_room_password.room_id
      and user_id = auth.uid();

  if _attempt.locked_until is not null and _attempt.locked_until > now() then
    raise exception 'locked_out' using detail = _attempt.locked_until::text;
  end if;

  select r.password_hash into _hash from public.rooms r where r.id = room_id;
  if _hash is null then return false; end if;

  if extensions.crypt(password, _hash) = _hash then
    insert into public.room_members (room_id, user_id, expires_at)
      values (verify_room_password.room_id, auth.uid(), now() + interval '24 hours')
    on conflict on constraint room_members_pkey
      do update set expires_at = now() + interval '24 hours';

    delete from public.room_access_attempts
      where room_access_attempts.room_id = verify_room_password.room_id
        and user_id = auth.uid();
    return true;
  end if;

  insert into public.room_access_attempts (room_id, user_id, fail_count, locked_until, updated_at)
    values (
      verify_room_password.room_id, auth.uid(), 1,
      null, now()
    )
  on conflict on constraint room_access_attempts_room_id_user_id_key do update set
    fail_count = public.room_access_attempts.fail_count + 1,
    locked_until = case
      when public.room_access_attempts.fail_count + 1 >= 5
      then now() + interval '30 minutes' else null end,
    updated_at = now();
  return false;
end;
$$;


ALTER FUNCTION "public"."verify_room_password"("room_id" "uuid", "password" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "permissions" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admin_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."affiliate_commissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "affiliate_id" "uuid" NOT NULL,
    "business_id" "uuid",
    "stripe_invoice_id" "text",
    "stripe_subscription_id" "text",
    "base_amount_cents" integer NOT NULL,
    "currency" "text" DEFAULT 'usd'::"text" NOT NULL,
    "commission_pct" numeric(5,2) NOT NULL,
    "commission_amount_cents" integer NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "payout_id" "uuid",
    "source_event_id" "text",
    "reversed_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    CONSTRAINT "affiliate_commissions_base_amount_cents_check" CHECK (("base_amount_cents" >= 0)),
    CONSTRAINT "affiliate_commissions_commission_amount_cents_check" CHECK (("commission_amount_cents" >= 0)),
    CONSTRAINT "affiliate_commissions_commission_pct_check" CHECK ((("commission_pct" >= (0)::numeric) AND ("commission_pct" <= (100)::numeric))),
    CONSTRAINT "affiliate_commissions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'paid'::"text", 'reversed'::"text", 'void'::"text"])))
);


ALTER TABLE "public"."affiliate_commissions" OWNER TO "postgres";


COMMENT ON TABLE "public"."affiliate_commissions" IS 'Libro mayor de comisiones. Una fila por pago de membresia de negocio referido. commission_pct = snapshot congelado. Base = SOLO membresia. Idempotente por (business_id, stripe_invoice_id).';


CREATE TABLE IF NOT EXISTS "public"."affiliates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "affiliate_number" "text" NOT NULL,
    "user_id" "uuid",
    "name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "commission_pct" numeric(5,2) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "payouts_held" boolean DEFAULT false NOT NULL,
    "notes" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tax_form_type" "text",
    "tax_form_on_file" boolean DEFAULT false NOT NULL,
    "tax_form_received_at" timestamp with time zone,
    CONSTRAINT "affiliates_commission_pct_check" CHECK ((("commission_pct" >= (0)::numeric) AND ("commission_pct" <= (100)::numeric))),
    CONSTRAINT "affiliates_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'suspended'::"text", 'terminated'::"text"]))),
    CONSTRAINT "affiliates_tax_form_type_check" CHECK (("tax_form_type" = ANY (ARRAY['w9'::"text", 'w8ben'::"text"])))
);


ALTER TABLE "public"."affiliates" OWNER TO "postgres";


COMMENT ON TABLE "public"."affiliates" IS 'Programa de afiliados (comisión en dinero). Creados por admin. commission_pct editable; se congela por fila en affiliate_commissions.';


COMMENT ON COLUMN "public"."affiliates"."payouts_held" IS 'Pausa individual: true = congela SOLO el pago de este afiliado; la acumulacion sigue.';


COMMENT ON COLUMN "public"."affiliates"."tax_form_on_file" IS 'Si el afiliado tiene su formulario fiscal (W-9/W-8BEN) en archivo. record_affiliate_payout bloquea el pago si es false.';


CREATE TABLE IF NOT EXISTS "public"."announcements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid",
    "segment" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."announcements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid",
    "room_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "banned_by" "uuid",
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."bans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."blocks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "blocker_id" "uuid" NOT NULL,
    "blocked_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "blocks_check" CHECK (("blocker_id" <> "blocked_id"))
);


ALTER TABLE "public"."blocks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."business_games" (
    "business_id" "uuid" NOT NULL,
    "game_key" "text" NOT NULL,
    "enabled" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."business_games" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."business_verifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "identity_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "daily_code" "text",
    "code_date" "date",
    "selfie_url" "text",
    "sms_code" "text",
    "sms_expires_at" timestamp with time zone,
    "sms_verified" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."business_verifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."businesses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text",
    "category" "text",
    "address" "text",
    "city" "text",
    "state" "text",
    "country" "text" DEFAULT 'US'::"text" NOT NULL,
    "lat" double precision,
    "lng" double precision,
    "phone" "text",
    "website" "text",
    "logo_url" "text",
    "cover_url" "text",
    "is_verified" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "plan" "text" DEFAULT 'free'::"text" NOT NULL,
    "dashboard_theme_id" integer DEFAULT 1 NOT NULL,
    "stripe_account_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'pending_verification'::"text" NOT NULL,
    "icon_emoji" "text",
    "hours" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "radius_m" integer DEFAULT 100 NOT NULL,
    "menu_enabled" boolean DEFAULT false NOT NULL,
    "tips_enabled" boolean DEFAULT false NOT NULL,
    "tip_percentages" integer[] DEFAULT '{10,15,20}'::integer[] NOT NULL,
    "payout_frequency" "text" DEFAULT 'weekly'::"text" NOT NULL,
    "gallery_urls" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "tax_rate" numeric,
    "latitude" double precision,
    "longitude" double precision,
    "geofence_radius_m" integer DEFAULT 50,
    "geofence_polygon" "jsonb",
    "menu_mode" "text" DEFAULT 'none'::"text" NOT NULL,
    "external_menu_url" "text",
    "menu_card_effect" "text" DEFAULT 'lift'::"text" NOT NULL,
    "is_temporary" boolean DEFAULT false NOT NULL,
    "event_starts_at" timestamp with time zone,
    "event_ends_at" timestamp with time zone,
    "menu_template_id" "text" DEFAULT 'classic'::"text" NOT NULL,
    "menu_palette_id" "text",
    "menu_language_mode" "text" DEFAULT 'single'::"text" NOT NULL,
    "menu_primary_language" "text" DEFAULT 'en'::"text" NOT NULL,
    "verified_by" "uuid",
    "verified_at" timestamp with time zone,
    "stripe_charges_enabled" boolean DEFAULT false NOT NULL,
    "stripe_payouts_enabled" boolean DEFAULT false NOT NULL,
    "stripe_details_submitted" boolean DEFAULT false NOT NULL,
    "icon_url" "text",
    "dashboard_palette_id" integer,
    "table_subchats_enabled" boolean DEFAULT false NOT NULL,
    "table_subchat_base_name" "text",
    "referred_by_affiliate_id" "uuid",
    "affiliate_attributed_at" timestamp with time zone,
    "affiliate_attribution_source" "text",
    "kds_settings" "jsonb" DEFAULT '{"sla": {"ready_mins": 5, "pending_mins": 5, "preparing_mins": 15}, "alerts": {"ready": {"tone": "ding", "sound": true, "vibration": true}, "service_call": {"tone": "bell", "sound": true, "vibration": true}}, "customer_status_enabled": false}'::"jsonb" NOT NULL,
    "brand_kit" "jsonb" DEFAULT '{"plates": [], "enabled": false, "drinkware": []}'::"jsonb" NOT NULL,
    "sales_location_id" "uuid",
    "receipt_brand_color" "text",
    "receipt_template_id" "text" DEFAULT 'modern'::"text" NOT NULL,
    "pos_payment_mode" "text" DEFAULT 'stripe'::"text" NOT NULL,
    "pickup_enabled" boolean DEFAULT false NOT NULL,
    "subdomain" "text",
    "reservation_capacity" integer,
    "timezone" "text" DEFAULT 'America/New_York'::"text" NOT NULL,
    CONSTRAINT "businesses_affiliate_attribution_source_check" CHECK (("affiliate_attribution_source" = ANY (ARRAY['self_signup'::"text", 'manual'::"text"]))),
    CONSTRAINT "businesses_menu_card_effect_check" CHECK (("menu_card_effect" = ANY (ARRAY['lift'::"text", 'reveal'::"text", 'tilt'::"text", 'spotlight'::"text", 'duotone'::"text", 'glass'::"text", 'shine'::"text", 'focus'::"text", 'neon'::"text", 'polaroid'::"text"]))),
    CONSTRAINT "businesses_menu_language_mode_check" CHECK (("menu_language_mode" = ANY (ARRAY['single'::"text", 'dual'::"text"]))),
    CONSTRAINT "businesses_menu_mode_check" CHECK (("menu_mode" = ANY (ARRAY['none'::"text", 'external'::"text", 'web'::"text"]))),
    CONSTRAINT "businesses_menu_primary_language_check" CHECK (("menu_primary_language" = ANY (ARRAY['en'::"text", 'es'::"text"]))),
    CONSTRAINT "businesses_menu_template_id_check" CHECK (("menu_template_id" = ANY (ARRAY['classic'::"text", 'left-drawer'::"text", 'icon-rail'::"text", 'sticky-tabs'::"text", 'category-sidebar'::"text", 'store-sections'::"text", 'glass-chips'::"text", 'infinite-feed'::"text", 'magazine'::"text", 'streaming-rows'::"text", 'masonry-search'::"text", 'fullscreen-type'::"text", 'timeline'::"text", 'luxury'::"text", 'carousel'::"text", 'immersive'::"text", 'stories'::"text", 'card-stack'::"text", 'gesture'::"text", 'ai-personalized'::"text", 'bottom-nav'::"text", 'bento'::"text", 'hero-list'::"text", 'split-diagonal'::"text", 'polaroid'::"text", 'photo-spotlight'::"text", 'arch-crop'::"text", 'peek-carousel'::"text", 'full-bleed-reel'::"text", 'film-strip'::"text", 'magazine-cover'::"text", 'gallery-print'::"text", 'organic-circles'::"text", 'hexagon-honeycomb'::"text", 'spotlight-stage'::"text", 'framed-gallery'::"text", 'poster-wall'::"text", 'double-page-spread'::"text", 'curved-hero'::"text", 'coverflow-3d'::"text", 'full-bleed-swipe'::"text", 'featured-grid'::"text", 'story-chapters'::"text", 'duotone-spotlight'::"text", 'radial-fan'::"text", 'blob-mask'::"text", 'horizontal-filmstrip'::"text", 'diagonal-mosaic'::"text", 'sticky-hero-sheet'::"text", 'top-arc-dial'::"text", 'bento-deluxe'::"text"]))),
    CONSTRAINT "businesses_pos_payment_mode_chk" CHECK (("pos_payment_mode" = ANY (ARRAY['stripe'::"text", 'external'::"text"]))),
    CONSTRAINT "businesses_reservation_capacity_chk" CHECK ((("reservation_capacity" IS NULL) OR ("reservation_capacity" > 0)))
);


ALTER TABLE "public"."businesses" OWNER TO "postgres";


COMMENT ON COLUMN "public"."businesses"."menu_mode" IS 'How the owner''s menu is served: none | external (link) | web (template editor, future)';


COMMENT ON COLUMN "public"."businesses"."external_menu_url" IS 'URL of the owner''s external menu. Only used when menu_mode = ''external''. Must start with http:// or https://.';


COMMENT ON COLUMN "public"."businesses"."verified_by" IS 'Platform admin (auth.users.id) who manually approved this business. NULL for LEGACY rows: status=''verified'' was set by the pre-2026-07 /api/verify bug (self-approval), so their provenance is NOT trustworthy. A real approval always stamps verified_by + verified_at via admin_set_business_verification().';


COMMENT ON COLUMN "public"."businesses"."verified_at" IS 'When a platform admin approved this business. NULL = never manually approved (see verified_by).';


COMMENT ON COLUMN "public"."businesses"."stripe_charges_enabled" IS 'Stripe account.charges_enabled — the business can accept charges. Synced from Stripe (webhook account.updated / stripe-connect get_account_status). Server-role writable only.';


COMMENT ON COLUMN "public"."businesses"."brand_kit" IS 'Kit de marca para fotos IA: {enabled bool, plates: url[], drinkware: url[]}. La EF usa plates para items station=kitchen, drinkware para station=bar.';


COMMENT ON COLUMN "public"."businesses"."pos_payment_mode" IS 'Modo de cobro del POS: stripe = cobros por Stripe (cliente puede pagar por QR); external = el dueño cobra por fuera (efectivo/tarjeta externa), cliente nunca paga por teléfono. D-01.';


COMMENT ON COLUMN "public"."businesses"."timezone" IS 'Zona horaria IANA del local (p. ej. America/New_York). Hoy todos están en America/New_York; se rellenará por lat/lng en una fase posterior. La usa venue_session_expires_at para convertir businesses.hours a un instante.';


CREATE TABLE IF NOT EXISTS "public"."check_ins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "business_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."check_ins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "hidden_at" timestamp with time zone,
    "hidden_by" "uuid"
);


ALTER TABLE "public"."comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."custom_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "permissions" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "base_template" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."custom_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."disputes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "opened_by" "uuid" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "reason" "text" NOT NULL,
    "resolution" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "description" "text",
    "amount_cents" integer,
    "escalated_at" timestamp with time zone,
    "refund_id" "text"
);


ALTER TABLE "public"."disputes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dm_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "body" "text",
    "media_url" "text",
    "voice_url" "text",
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "voice_duration_s" smallint,
    "gift_offer_id" "uuid",
    "hidden_at" timestamp with time zone,
    "hidden_by" "uuid",
    "media_moderation" "text",
    "media_moderated_at" timestamp with time zone,
    "media_moderation_scores" "jsonb",
    CONSTRAINT "dm_messages_media_moderation_chk" CHECK ((("media_moderation" IS NULL) OR ("media_moderation" = ANY (ARRAY['pending'::"text", 'clear'::"text", 'blurred'::"text", 'rejected'::"text"])))),
    CONSTRAINT "dm_messages_voice_duration_check" CHECK ((("voice_duration_s" IS NULL) OR (("voice_duration_s" >= 1) AND ("voice_duration_s" <= 60))))
);


ALTER TABLE "public"."dm_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employees" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'staff'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "last_active_at" timestamp with time zone,
    "custom_role_id" "uuid",
    "receipt_display_name" "text"
);


ALTER TABLE "public"."employees" OWNER TO "postgres";


COMMENT ON COLUMN "public"."employees"."receipt_display_name" IS 'Short name shown on printed and digital receipts as "Atendido por: ...". Falls back to users.display_name when NULL. Nothing is shown if pos_payments.paid_by is NULL.';


CREATE TABLE IF NOT EXISTS "public"."follow_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "requester_id" "uuid" NOT NULL,
    "target_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "follow_requests_check" CHECK (("requester_id" <> "target_id"))
);


ALTER TABLE "public"."follow_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."follows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "follower_id" "uuid" NOT NULL,
    "following_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."follows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."game_optins" (
    "user_id" "uuid" NOT NULL,
    "business_id" "uuid" NOT NULL,
    "game_key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."game_optins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."games" (
    "key" "text" NOT NULL,
    "name_es" "text" NOT NULL,
    "name_en" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."games" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gift_offers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "from_user_id" "uuid" NOT NULL,
    "to_user_id" "uuid" NOT NULL,
    "conversation_id" "uuid",
    "items" "jsonb" NOT NULL,
    "note" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "subtotal_cents" integer,
    "tax_cents" integer,
    "total_cents" integer,
    "stripe_pi_id" "text",
    "table_label" "text",
    "table_details" "text",
    "order_id" "uuid",
    "held_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "responded_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_payment_error" "text",
    "payment_failures" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "gift_offers_check" CHECK (("from_user_id" <> "to_user_id")),
    CONSTRAINT "gift_offers_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'awaiting_payment'::"text", 'held'::"text", 'accepted'::"text", 'paid'::"text", 'declined'::"text", 'expired'::"text", 'cancelled'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."gift_offers" OWNER TO "postgres";


COMMENT ON COLUMN "public"."gift_offers"."last_payment_error" IS 'Último rechazo de pago del PaymentIntent de la oferta (código y mensaje de Stripe, máx. 200 caracteres). Nunca datos de tarjeta.';


COMMENT ON COLUMN "public"."gift_offers"."payment_failures" IS 'Cuántos rechazos de pago lleva la oferta (payment_intent.payment_failed). Al tercero la oferta se cancela.';


CREATE TABLE IF NOT EXISTS "public"."gifts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "from_user" "uuid" NOT NULL,
    "to_user" "uuid" NOT NULL,
    "room_id" "uuid",
    "type" "text" NOT NULL,
    "amount_cents" integer DEFAULT 0 NOT NULL,
    "message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."gifts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."guest_code_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "table_id" "uuid" NOT NULL,
    "device_id" "text",
    "ip_hash" "text",
    "success" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."guest_code_attempts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."guest_device_blocks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "device_id" "text" NOT NULL,
    "reason" "text" DEFAULT 'rejected_orders'::"text" NOT NULL,
    "blocked_until" timestamp with time zone NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "unblocked_at" timestamp with time zone,
    "unblocked_by" "uuid"
);


ALTER TABLE "public"."guest_device_blocks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."guest_device_strikes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "device_id" "text" NOT NULL,
    "order_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."guest_device_strikes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."guest_order_idempotency" (
    "idempotency_key" "text" NOT NULL,
    "business_id" "uuid" NOT NULL,
    "order_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."guest_order_idempotency" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."guest_service_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "device_id" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."guest_service_attempts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."guest_tab_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "table_id" "uuid" NOT NULL,
    "table_session_opened_at" timestamp with time zone NOT NULL,
    "device_id" "text" NOT NULL,
    "fingerprint_hash" "text",
    "token_hash" "text" NOT NULL,
    "ip_hash" "text",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone,
    "expires_at" timestamp with time zone NOT NULL,
    "revoked_at" timestamp with time zone
);


ALTER TABLE "public"."guest_tab_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."interests" (
    "key" "text" NOT NULL,
    "name_es" "text" NOT NULL,
    "name_en" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."interests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "is_sales_location" boolean DEFAULT false NOT NULL,
    "sort" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."inventory_locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loyalty_points" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "business_id" "uuid" NOT NULL,
    "points" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."loyalty_points" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loyalty_rewards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "cost_points" integer NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."loyalty_rewards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loyalty_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "points_per_dollar" numeric DEFAULT 1 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."loyalty_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loyalty_tiers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "min_points" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."loyalty_tiers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."map_reactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid",
    "room_id" "uuid",
    "user_id" "uuid",
    "emoji" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."map_reactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."match_kicks" (
    "business_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "kicked_by" "uuid",
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."match_kicks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."match_photos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "path" "text" NOT NULL,
    "sort" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "rejection_reason" "text",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "needs_review" boolean DEFAULT false NOT NULL,
    "moderation" "jsonb",
    "moderated_at" timestamp with time zone,
    CONSTRAINT "match_photos_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."match_photos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."match_presence" (
    "user_id" "uuid" NOT NULL,
    "business_id" "uuid" NOT NULL,
    "entered_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "active_since" timestamp with time zone,
    "method" "text" NOT NULL,
    "readings" integer DEFAULT 1 NOT NULL,
    "mocked" boolean DEFAULT false NOT NULL,
    CONSTRAINT "match_presence_method_check" CHECK (("method" = ANY (ARRAY['qr'::"text", 'geo'::"text"])))
);


ALTER TABLE "public"."match_presence" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."match_relikes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "target_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."match_relikes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."match_super_quota" (
    "user_id" "uuid" NOT NULL,
    "day" "date" NOT NULL,
    "used" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."match_super_quota" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."match_swipes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "swiper_id" "uuid" NOT NULL,
    "target_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "undone_at" timestamp with time zone,
    CONSTRAINT "match_swipes_action_check" CHECK (("action" = ANY (ARRAY['like'::"text", 'pass'::"text", 'super'::"text"]))),
    CONSTRAINT "match_swipes_check" CHECK (("swiper_id" <> "target_id"))
);


ALTER TABLE "public"."match_swipes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."matches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "user_a" "uuid" NOT NULL,
    "user_b" "uuid" NOT NULL,
    "is_super" boolean DEFAULT false NOT NULL,
    "conversation_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "matches_check" CHECK (("user_a" < "user_b"))
);


ALTER TABLE "public"."matches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."menu_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "sort" bigint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "icon" "text",
    "is_published" boolean DEFAULT true NOT NULL,
    "icon_url" "text",
    "name_alt" "text"
);


ALTER TABLE "public"."menu_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."menu_item_costs" (
    "menu_item_id" "uuid" NOT NULL,
    "business_id" "uuid" NOT NULL,
    "cost_cents" integer,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "menu_item_costs_cost_cents_check" CHECK ((("cost_cents" IS NULL) OR ("cost_cents" >= 0)))
);


ALTER TABLE "public"."menu_item_costs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."menu_item_modifier_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "menu_item_id" "uuid" NOT NULL,
    "modifier_group_id" "uuid" NOT NULL,
    "sort" bigint DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."menu_item_modifier_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."menu_item_photos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "menu_item_id" "uuid" NOT NULL,
    "business_id" "uuid" NOT NULL,
    "url" "text" NOT NULL,
    "storage_path" "text",
    "sort" bigint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."menu_item_photos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."menu_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category_id" "uuid" NOT NULL,
    "business_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "price_cents" integer DEFAULT 0 NOT NULL,
    "image_url" "text",
    "is_available" boolean DEFAULT true NOT NULL,
    "sort" bigint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "photo_url" "text",
    "dietary_tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "id_required" boolean DEFAULT false NOT NULL,
    "badge" "text",
    "is_published" boolean DEFAULT true NOT NULL,
    "stock_count" integer,
    "low_stock_threshold" integer DEFAULT 5 NOT NULL,
    "options" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "name_alt" "text",
    "description_alt" "text",
    "staff_details" "text",
    "staff_details_alt" "text",
    "station" "text" DEFAULT 'kitchen'::"text" NOT NULL,
    "sla" "jsonb",
    "images" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "barcode" "text",
    "par_level" integer,
    "supplier_id" "uuid",
    CONSTRAINT "menu_items_par_level_check" CHECK ((("par_level" IS NULL) OR ("par_level" >= 0))),
    CONSTRAINT "menu_items_station_chk" CHECK (("station" = ANY (ARRAY['kitchen'::"text", 'bar'::"text"])))
);


ALTER TABLE "public"."menu_items" OWNER TO "postgres";


COMMENT ON COLUMN "public"."menu_items"."images" IS 'Galería de URLs de imágenes del artículo (jsonb array). photo_url = portada, debe estar entre estas.';


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "is_deleted" boolean DEFAULT false NOT NULL,
    "reply_to" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "type" "text" DEFAULT 'text'::"text" NOT NULL,
    "media_url" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_system" boolean DEFAULT false NOT NULL,
    "hidden_at" timestamp with time zone,
    "hidden_by" "uuid"
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."moderation_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid",
    "room_id" "uuid",
    "actor_id" "uuid",
    "target_id" "uuid",
    "action" "text" NOT NULL,
    "detail" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."moderation_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."modifier_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "type" "text" DEFAULT 'single'::"text" NOT NULL,
    "min_select" integer DEFAULT 0 NOT NULL,
    "max_select" integer DEFAULT 1 NOT NULL,
    "choices" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "sort" bigint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "label_alt" "text",
    CONSTRAINT "modifier_groups_type_check" CHECK (("type" = ANY (ARRAY['single'::"text", 'multi'::"text"])))
);


ALTER TABLE "public"."modifier_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "payload" "jsonb",
    "is_read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."offers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "room_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "discount" "text",
    "expires_at" timestamp with time zone,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "type" "text",
    "min_purchase_cents" integer,
    "created_by" "uuid",
    "start_at" timestamp with time zone,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "targeting" "text" DEFAULT 'all'::"text" NOT NULL,
    "redemption_count" integer DEFAULT 0 NOT NULL,
    "views" integer DEFAULT 0 NOT NULL,
    "taps" integer DEFAULT 0 NOT NULL,
    "code" "text"
);


ALTER TABLE "public"."offers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "menu_item_id" "uuid" NOT NULL,
    "qty" integer DEFAULT 1 NOT NULL,
    "price_cents" integer NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "options" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "special_instructions" "text",
    "item_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "seat" integer,
    "paid_at" timestamp with time zone,
    "preparing_at" timestamp with time zone,
    "ready_at" timestamp with time zone,
    "done_at" timestamp with time zone,
    CONSTRAINT "order_items_item_status_valid" CHECK (("item_status" = ANY (ARRAY['pending'::"text", 'preparing'::"text", 'ready'::"text", 'done'::"text"]))),
    CONSTRAINT "order_items_seat_range" CHECK ((("seat" IS NULL) OR (("seat" >= 1) AND ("seat" <= 50))))
);

ALTER TABLE ONLY "public"."order_items" REPLICA IDENTITY FULL;


ALTER TABLE "public"."order_items" OWNER TO "postgres";


COMMENT ON COLUMN "public"."order_items"."item_status" IS 'Estado de cocina de ESTE plato: pending | preparing | ready. El estado del PEDIDO (orders.status) se deriva de aqui por trigger.';


COMMENT ON COLUMN "public"."order_items"."seat" IS 'Seat number (1..N) this dish belongs to, for splitting the bill by seat. NULL for customer/QR orders, which have no seat concept.';


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "room_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "total_cents" integer DEFAULT 0 NOT NULL,
    "tip_cents" integer DEFAULT 0 NOT NULL,
    "notes" "text",
    "stripe_pi_id" "text",
    "status_updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "order_type" "text" DEFAULT 'counter'::"text" NOT NULL,
    "gift_recipient_id" "uuid",
    "subtotal_cents" integer DEFAULT 0 NOT NULL,
    "tax_cents" integer DEFAULT 0 NOT NULL,
    "discount_cents" integer DEFAULT 0 NOT NULL,
    "promo_code" "text",
    "eta_minutes" integer,
    "special_instructions" "text",
    "table_label" "text",
    "contact_email" "text",
    "contact_phone" "text",
    "tab_id" "uuid",
    "table_id" "uuid",
    "contact_name" "text",
    "paid_at" timestamp with time zone,
    "taken_by" "uuid",
    "canceled_at" timestamp with time zone,
    "source" "text" DEFAULT 'pos'::"text" NOT NULL,
    "approval_status" "text",
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "rejected_reason" "text",
    "guest_device_id" "text",
    "guest_session_id" "uuid",
    "comanda_printed_at" timestamp with time zone,
    "comanda_claimed_at" timestamp with time zone,
    "comanda_claimed_by" "uuid",
    "order_number" bigint NOT NULL,
    "guest_tracking_code" "text",
    CONSTRAINT "orders_approval_status_chk" CHECK ((("approval_status" IS NULL) OR ("approval_status" = ANY (ARRAY['awaiting'::"text", 'approved'::"text", 'rejected'::"text"])))),
    CONSTRAINT "orders_contact_email_len" CHECK ((("contact_email" IS NULL) OR ("char_length"("contact_email") <= 120))),
    CONSTRAINT "orders_contact_name_len" CHECK ((("contact_name" IS NULL) OR ("char_length"("contact_name") <= 60))),
    CONSTRAINT "orders_contact_phone_len" CHECK ((("contact_phone" IS NULL) OR ("char_length"("contact_phone") <= 30))),
    CONSTRAINT "orders_source_chk" CHECK (("source" = ANY (ARRAY['pos'::"text", 'app'::"text", 'customer_stripe'::"text", 'customer_tab'::"text"]))),
    CONSTRAINT "orders_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'preparing'::"text", 'ready'::"text", 'delivered'::"text", 'cancelled'::"text", 'disputed'::"text"]))),
    CONSTRAINT "orders_table_label_len" CHECK ((("table_label" IS NULL) OR ("char_length"("table_label") <= 40)))
);

ALTER TABLE ONLY "public"."orders" REPLICA IDENTITY FULL;


ALTER TABLE "public"."orders" OWNER TO "postgres";


COMMENT ON COLUMN "public"."orders"."table_label" IS 'Free-text table/location for order_type = table (e.g. 5, barra, terraza). Max 40 chars.';


COMMENT ON COLUMN "public"."orders"."contact_email" IS 'Optional guest-checkout contact (D-37) for receipt/refund. NULL for signed-in users. Written only by stripe-webhook (service_role) on order creation.';


COMMENT ON COLUMN "public"."orders"."contact_phone" IS 'Optional guest-checkout contact (D-37) for receipt/refund. NULL for signed-in users. Written only by stripe-webhook (service_role) on order creation.';


COMMENT ON COLUMN "public"."orders"."contact_name" IS 'Name the order is served under (guest name typed at QR checkout, or the profile name). From PaymentIntent metadata; nullable. Not client-writable.';


COMMENT ON COLUMN "public"."orders"."paid_at" IS 'When the money entered (service_role/webhook only). NULL = not paid yet. A waiter order goes to the kitchen unpaid and gets paid_at stamped at checkout.';


COMMENT ON COLUMN "public"."orders"."taken_by" IS 'Employee (auth user) who TOOK this order in the terminal. NULL for customer orders. orders.user_id stays the CUSTOMER — the two are not interchangeable.';


COMMENT ON COLUMN "public"."orders"."source" IS 'pos = mesero handheld; app = app JChat; customer_stripe = cliente web pagó por orden; customer_tab = cliente web agregó a la cuenta. D-14.';


COMMENT ON COLUMN "public"."orders"."approval_status" IS 'null = no requiere aprobación; awaiting/approved/rejected (modo external sin código, F4). D-05/D-07.';


ALTER TABLE "public"."orders" ALTER COLUMN "order_number" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."orders_order_number_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


CREATE TABLE IF NOT EXISTS "public"."orphan_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "stripe_pi_id" "text" NOT NULL,
    "business_id" "uuid",
    "amount_cents" integer,
    "metadata" "jsonb",
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."orphan_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pending_order_carts" (
    "payment_intent_id" "text" NOT NULL,
    "business_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "items" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pending_order_carts" OWNER TO "postgres";


COMMENT ON TABLE "public"."pending_order_carts" IS 'Server-resolved cart per PaymentIntent. Written by payments EF, read+deleted by stripe-webhook. Rows older than a few days can be purged.';


CREATE TABLE IF NOT EXISTS "public"."pinned_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "message_id" "uuid" NOT NULL,
    "pinned_by" "uuid" NOT NULL,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notify" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."pinned_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_config" (
    "id" boolean DEFAULT true NOT NULL,
    "business_radius_min_m" integer DEFAULT 50 NOT NULL,
    "business_radius_max_m" integer DEFAULT 50 NOT NULL,
    "affiliate_program_enabled" boolean DEFAULT true NOT NULL,
    "affiliate_payouts_enabled" boolean DEFAULT true NOT NULL,
    "affiliate_commissionable_plans" "text"[] DEFAULT ARRAY['business'::"text", 'pro'::"text"] NOT NULL,
    "affiliate_clawback_days" integer DEFAULT 7 NOT NULL,
    CONSTRAINT "platform_config_affiliate_clawback_days_check" CHECK ((("affiliate_clawback_days" >= 0) AND ("affiliate_clawback_days" <= 365))),
    CONSTRAINT "platform_config_radius_positive" CHECK ((("business_radius_min_m" > 0) AND ("business_radius_max_m" > 0))),
    CONSTRAINT "platform_config_radius_range" CHECK (("business_radius_min_m" <= "business_radius_max_m")),
    CONSTRAINT "platform_config_singleton" CHECK (("id" = true))
);


ALTER TABLE "public"."platform_config" OWNER TO "postgres";


COMMENT ON TABLE "public"."platform_config" IS 'Singleton de configuración de plataforma. Exactamente una fila (id = true).';


COMMENT ON COLUMN "public"."platform_config"."business_radius_min_m" IS 'Radio mínimo de geofence sugerido al UI (slider). No se valida server-side — es guía UX.';


COMMENT ON COLUMN "public"."platform_config"."business_radius_max_m" IS 'Radio máximo de geofence permitido por el trigger enforce_business_radius_cap.';


COMMENT ON COLUMN "public"."platform_config"."affiliate_program_enabled" IS 'Global: false = pausa TOTAL de atribucion/acumulacion de afiliados.';


COMMENT ON COLUMN "public"."platform_config"."affiliate_payouts_enabled" IS 'Global: false = congela TODOS los pagos a afiliados (la acumulacion sigue).';


COMMENT ON COLUMN "public"."platform_config"."affiliate_commissionable_plans" IS 'Planes cuyo pago genera comision de afiliado (checklist admin, A4). Default business+pro. Verified excluido.';


COMMENT ON COLUMN "public"."platform_config"."affiliate_clawback_days" IS 'Dias de espera antes de que una comision pending sea pagable (clawback window). Editable en panel super-admin.';


CREATE TABLE IF NOT EXISTS "public"."pos_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "table_id" "uuid" NOT NULL,
    "amount_cents" integer NOT NULL,
    "tip_cents" integer DEFAULT 0 NOT NULL,
    "kind" "text" DEFAULT 'full'::"text" NOT NULL,
    "seat" integer,
    "order_item_ids" "uuid"[],
    "stripe_pi_id" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "receipt_code" "text",
    "card_brand" "text",
    "card_last4" "text",
    "paid_by" "uuid",
    "session_opened_at" timestamp with time zone,
    "guest_session_id" "uuid",
    "claimed_at" timestamp with time zone,
    "source" "text" DEFAULT 'pos'::"text" NOT NULL,
    "payment_method" "text",
    CONSTRAINT "pos_payments_method_chk" CHECK ((("payment_method" IS NULL) OR ("payment_method" = ANY (ARRAY['stripe_terminal'::"text", 'stripe_web'::"text", 'cash'::"text", 'card_external'::"text"])))),
    CONSTRAINT "pos_payments_source_chk" CHECK (("source" = ANY (ARRAY['pos'::"text", 'guest'::"text"]))),
    CONSTRAINT "pos_payments_status_chk" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'succeeded'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."pos_payments" OWNER TO "postgres";


COMMENT ON COLUMN "public"."pos_payments"."paid_by" IS 'Employee who collected this payment. Set server-side (JWT auth.uid()) only — never from client.';


COMMENT ON COLUMN "public"."pos_payments"."session_opened_at" IS 'Sesión de ocupación a la que pertenece el pago (= tables.session_opened_at al crearlo). Los pagos de sesiones anteriores no cuentan en el saldo. F5.';


COMMENT ON COLUMN "public"."pos_payments"."payment_method" IS 'stripe_terminal = M2 (cargo directo); stripe_web = cliente por QR (destino); cash / card_external = cobrado por fuera en modo external. F6.';


CREATE TABLE IF NOT EXISTS "public"."pos_pins" (
    "user_id" "uuid" NOT NULL,
    "business_id" "uuid" NOT NULL,
    "pin_hash" "text" NOT NULL,
    "failed_attempts" integer DEFAULT 0 NOT NULL,
    "locked_until" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pos_pins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_printers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "label" "text" NOT NULL,
    "connection" "text" DEFAULT 'network'::"text" NOT NULL,
    "host" "text",
    "port" integer DEFAULT 9100 NOT NULL,
    "width_mm" integer DEFAULT 80 NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "role" "text" DEFAULT 'receipt'::"text" NOT NULL,
    CONSTRAINT "pos_printers_role_check" CHECK (("role" = ANY (ARRAY['kitchen'::"text", 'bar'::"text", 'receipt'::"text", 'waiter'::"text"])))
);


ALTER TABLE "public"."pos_printers" OWNER TO "postgres";


COMMENT ON COLUMN "public"."pos_printers"."role" IS 'kitchen/bar = imprime comanda automática al enviar orden (ruteo por menu_items.station), toggle via is_active. receipt = impresora de recibos que el mesero elige al cobrar (favorita via is_default).';


CREATE TABLE IF NOT EXISTS "public"."post_likes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."post_likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "caption" "text",
    "media_urls" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "geotag" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "business_id" "uuid",
    "hidden_at" timestamp with time zone,
    "hidden_by" "uuid",
    CONSTRAINT "posts_business_caption_len" CHECK ((("business_id" IS NULL) OR ("char_length"(COALESCE("caption", ''::"text")) <= 1000))),
    CONSTRAINT "posts_business_media_max" CHECK ((("business_id" IS NULL) OR (COALESCE("cardinality"("media_urls"), 0) <= 4)))
);


ALTER TABLE "public"."posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."processed_stripe_events" (
    "event_id" "text" NOT NULL,
    "type" "text",
    "processed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."processed_stripe_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_catalog" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category" "text" NOT NULL,
    "subcategory" "text",
    "brand" "text",
    "name" "text" NOT NULL,
    "size_value" numeric,
    "size_unit" "text",
    "packaging" "text",
    "barcode" "text",
    "image_url" "text",
    "country" "text" DEFAULT 'US'::"text",
    "source" "text" DEFAULT 'off'::"text" NOT NULL,
    "source_id" "text",
    "verified" boolean DEFAULT false,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."product_catalog" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."public_locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" DEFAULT 'park'::"text" NOT NULL,
    "lat" double precision,
    "lng" double precision,
    "radius_m" integer DEFAULT 100 NOT NULL,
    "description" "text",
    "active_from" "date",
    "active_to" "date",
    "is_active" boolean DEFAULT true NOT NULL,
    "room_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."public_locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "username" "text" NOT NULL,
    "display_name" "text",
    "avatar_url" "text",
    "bio" "text",
    "profile_theme_id" integer DEFAULT 1 NOT NULL,
    "is_incognito" boolean DEFAULT false NOT NULL,
    "is_verified" boolean DEFAULT false NOT NULL,
    "push_token" "text",
    "language" "text" DEFAULT 'en'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "privacy_settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "onboarding_completed" boolean DEFAULT false NOT NULL,
    "city" "text",
    "cover_url" "text",
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "stripe_customer_id" "text",
    "default_payment_method" "text",
    "role" "text",
    "plan" "text" DEFAULT 'regular'::"text" NOT NULL,
    "plan_status" "text" DEFAULT 'active'::"text" NOT NULL,
    "plan_trial_end" timestamp with time zone,
    "active_business_id" "uuid",
    "is_private" boolean DEFAULT false NOT NULL,
    "plan_renews_at" timestamp with time zone,
    "stripe_subscription_id" "text",
    "referred_by_affiliate_id" "uuid",
    "affiliate_attributed_at" timestamp with time zone,
    "affiliate_attribution_source" "text",
    "birth_year" smallint,
    "age_confirmed_at" timestamp with time zone,
    "terms_accepted_at" timestamp with time zone,
    "terms_version" "text",
    "suspended_until" timestamp with time zone,
    "suspended_reason" "text",
    "is_test" boolean DEFAULT false NOT NULL,
    CONSTRAINT "users_affiliate_attribution_source_check" CHECK (("affiliate_attribution_source" = ANY (ARRAY['self_signup'::"text", 'manual'::"text"]))),
    CONSTRAINT "users_city_length_check" CHECK ((("city" IS NULL) OR ("char_length"("city") <= 80))),
    CONSTRAINT "users_language_check" CHECK (("language" = ANY (ARRAY['en'::"text", 'es'::"text"]))),
    CONSTRAINT "users_plan_check" CHECK (("plan" = ANY (ARRAY['regular'::"text", 'verified'::"text", 'business'::"text", 'pro'::"text"]))),
    CONSTRAINT "users_plan_status_check" CHECK (("plan_status" = ANY (ARRAY['active'::"text", 'trialing'::"text", 'expired'::"text", 'canceled'::"text"])))
);


ALTER TABLE "public"."users" OWNER TO "postgres";


COMMENT ON COLUMN "public"."users"."birth_year" IS 'Año de nacimiento (minimización: no se guarda la fecha completa). Solo lo escribe confirm_age.';


COMMENT ON COLUMN "public"."users"."age_confirmed_at" IS 'Momento en que el servidor verificó 18+. NULL = la app debe pedir la confirmación. Solo lo escribe confirm_age.';


COMMENT ON COLUMN "public"."users"."terms_accepted_at" IS 'Momento en que el usuario aceptó Términos y Privacidad. Solo lo escribe confirm_age.';


COMMENT ON COLUMN "public"."users"."terms_version" IS 'Versión de los Términos aceptada (p. ej. 2026-10). Solo lo escribe confirm_age.';


CREATE OR REPLACE VIEW "public"."public_profiles" AS
 SELECT "id",
    "username",
    "display_name",
    "avatar_url",
    "cover_url",
    "bio",
    "city",
    "profile_theme_id",
    "is_verified",
    "is_private",
    "created_at"
   FROM "public"."users";


ALTER VIEW "public"."public_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_order_settings" (
    "business_id" "uuid" NOT NULL,
    "legal_name" "text",
    "address" "text",
    "phone" "text",
    "email" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."purchase_order_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."radius_increase_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid",
    "event_id" "uuid",
    "requested_by" "uuid",
    "current_radius_m" integer,
    "requested_radius_m" integer,
    "reason" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."radius_increase_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reporter_id" "uuid",
    "reported_user_id" "uuid",
    "content_type" "text" DEFAULT 'user'::"text" NOT NULL,
    "content_id" "uuid",
    "reason" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "business_id" "uuid",
    "details" "text",
    "snapshot" "jsonb",
    "priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid",
    "resolution" "text",
    "admin_note" "text",
    CONSTRAINT "reports_priority_chk" CHECK (("priority" = ANY (ARRAY['normal'::"text", 'high'::"text", 'urgent'::"text"]))),
    CONSTRAINT "reports_status_chk" CHECK (("status" = ANY (ARRAY['pending'::"text", 'dismissed'::"text", 'resolved'::"text"])))
);


ALTER TABLE "public"."reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reservation_customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "phone" "text",
    "first_name" "text" NOT NULL,
    "last_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."reservation_customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reservation_tables" (
    "reservation_id" "uuid" NOT NULL,
    "table_id" "uuid" NOT NULL
);


ALTER TABLE "public"."reservation_tables" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reservations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "reserved_at" timestamp with time zone NOT NULL,
    "party_size" integer DEFAULT 2 NOT NULL,
    "special_requests" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "is_waitlist" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "customer_id" "uuid",
    "event_type" "text"
);


ALTER TABLE "public"."reservations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "business_id" "uuid" NOT NULL,
    "rating" smallint NOT NULL,
    "body" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "response" "text",
    "responded_at" timestamp with time zone,
    "status" "text" DEFAULT 'visible'::"text" NOT NULL,
    CONSTRAINT "reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."room_access_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "fail_count" integer DEFAULT 0 NOT NULL,
    "locked_until" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."room_access_attempts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."room_geo_presence" (
    "room_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."room_geo_presence" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."room_members" (
    "room_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."room_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."room_mutes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "muted_by" "uuid",
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."room_mutes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rooms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "parent_room_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "chat_theme_id" integer DEFAULT 1 NOT NULL,
    "is_password_protected" boolean DEFAULT false NOT NULL,
    "password_hash" "text",
    "max_occupancy" integer,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "icon" "text",
    "color" "text",
    "slug" "text",
    "ttl_hours" integer,
    "notify_enabled" boolean DEFAULT true NOT NULL,
    "sort" bigint DEFAULT 0 NOT NULL,
    "is_main" boolean DEFAULT false NOT NULL,
    "qr_token" "text"
);


ALTER TABLE "public"."rooms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."security_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_id" "uuid",
    "action" "text" NOT NULL,
    "target_type" "text",
    "target_id" "uuid",
    "detail" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."security_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_calls" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "business_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "type" "text" DEFAULT 'waiter'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "table_label" "text",
    "guest_device_id" "text",
    "order_id" "uuid"
);


ALTER TABLE "public"."service_calls" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_by_location" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "menu_item_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "qty" integer DEFAULT 0 NOT NULL,
    "low_stock_threshold" integer,
    "par_level" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."stock_by_location" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "menu_item_id" "uuid" NOT NULL,
    "business_id" "uuid",
    "delta" integer NOT NULL,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid"
);


ALTER TABLE "public"."stock_movements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "media_url" "text" NOT NULL,
    "text_overlay" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '24:00:00'::interval) NOT NULL
);


ALTER TABLE "public"."stories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."story_views" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "story_id" "uuid" NOT NULL,
    "viewer_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."story_views" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "stripe_subscription_id" "text",
    "plan" "text" DEFAULT 'regular'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "current_period_end" timestamp with time zone,
    "trial_end" timestamp with time zone,
    "grace_day" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "contact_name" "text",
    "email" "text",
    "phone" "text",
    "notes" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "account_number" "text"
);


ALTER TABLE "public"."suppliers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tab_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "tab_id" "uuid" NOT NULL,
    "amount_cents" integer NOT NULL,
    "tip_cents" integer DEFAULT 0 NOT NULL,
    "method" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "stripe_pi_id" "text",
    "pay_token" "text" NOT NULL,
    "taken_by" "uuid",
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tab_payments_amount_cents_check" CHECK (("amount_cents" > 0)),
    CONSTRAINT "tab_payments_method_check" CHECK (("method" = ANY (ARRAY['card'::"text", 'cash'::"text"]))),
    CONSTRAINT "tab_payments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'succeeded'::"text", 'failed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "tab_payments_tip_cents_check" CHECK (("tip_cents" >= 0))
);


ALTER TABLE "public"."tab_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."table_reservation_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "table_id" "uuid",
    "table_label" "text" NOT NULL,
    "action" "text" NOT NULL,
    "note" "text",
    "reserved_until" timestamp with time zone,
    "changed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "table_reservation_log_action_check" CHECK (("action" = ANY (ARRAY['reserved'::"text", 'released'::"text"])))
);


ALTER TABLE "public"."table_reservation_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."table_tabs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "table_id" "uuid" NOT NULL,
    "business_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "owner_uid" "uuid",
    "created_by" "uuid",
    "kind" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "paid_at" timestamp with time zone,
    "closed_at" timestamp with time zone,
    "closed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "table_tabs_kind_check" CHECK (("kind" = ANY (ARRAY['customer'::"text", 'waiter'::"text"]))),
    CONSTRAINT "table_tabs_kind_coherence" CHECK (((("kind" = 'customer'::"text") AND ("owner_uid" IS NOT NULL)) OR (("kind" = 'waiter'::"text") AND ("created_by" IS NOT NULL)))),
    CONSTRAINT "table_tabs_name_len" CHECK ((("char_length"("name") >= 1) AND ("char_length"("name") <= 40))),
    CONSTRAINT "table_tabs_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'paid'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."table_tabs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."table_waiters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "table_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."table_waiters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tables" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "label" "text" NOT NULL,
    "floor" "text" DEFAULT 'Principal'::"text" NOT NULL,
    "seats" integer DEFAULT 4 NOT NULL,
    "sort" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "qr_token" "text" NOT NULL,
    "room_id" "uuid",
    "is_reserved" boolean DEFAULT false NOT NULL,
    "reserved_note" "text",
    "reserved_until" timestamp with time zone,
    "party_size" integer,
    "combined_into" "uuid",
    "access_code" "text",
    "session_opened_at" timestamp with time zone,
    "session_opened_by" "uuid",
    "short_code" "text",
    CONSTRAINT "tables_access_code_chk" CHECK ((("access_code" IS NULL) OR ("access_code" ~ '^[0-9]{6}$'::"text"))),
    CONSTRAINT "tables_label_len" CHECK ((("char_length"("label") >= 1) AND ("char_length"("label") <= 20))),
    CONSTRAINT "tables_seats_range" CHECK ((("seats" >= 1) AND ("seats" <= 50)))
);

ALTER TABLE ONLY "public"."tables" REPLICA IDENTITY FULL;


ALTER TABLE "public"."tables" OWNER TO "postgres";


COMMENT ON COLUMN "public"."tables"."access_code" IS 'Código de mesa (6 dígitos) de la sesión de ocupación actual. NULL cuando la mesa está libre. Nace al abrir la sesión (primera orden o botón), muere al cerrarse/pagarse. D-02.';


COMMENT ON COLUMN "public"."tables"."session_opened_at" IS 'Instante en que se abrió la sesión de ocupación actual. NULL = libre.';


COMMENT ON COLUMN "public"."tables"."session_opened_by" IS 'user_id del mesero que abrió la sesión (primera orden o botón). NULL = libre.';


CREATE TABLE IF NOT EXISTS "public"."tod_cards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "concept_id" "text" NOT NULL,
    "category" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "locale" "text" NOT NULL,
    "body" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tod_cards_body_check" CHECK ((("char_length"("body") >= 1) AND ("char_length"("body") <= 200))),
    CONSTRAINT "tod_cards_category_check" CHECK (("category" = ANY (ARRAY['classic'::"text", 'party'::"text", 'laughs'::"text", 'confessions'::"text", 'talent'::"text"]))),
    CONSTRAINT "tod_cards_kind_check" CHECK (("kind" = ANY (ARRAY['truth'::"text", 'dare'::"text"]))),
    CONSTRAINT "tod_cards_locale_check" CHECK (("locale" = ANY (ARRAY['es'::"text", 'en'::"text"])))
);


ALTER TABLE "public"."tod_cards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tod_draws" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "round_id" "uuid" NOT NULL,
    "business_id" "uuid" NOT NULL,
    "room_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "is_random" boolean DEFAULT false NOT NULL,
    "concept_id" "text" NOT NULL,
    "status" "text" DEFAULT 'drawn'::"text" NOT NULL,
    "message_id" "uuid",
    "applause_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "decided_at" timestamp with time zone,
    CONSTRAINT "tod_draws_kind_check" CHECK (("kind" = ANY (ARRAY['truth'::"text", 'dare'::"text"]))),
    CONSTRAINT "tod_draws_status_check" CHECK (("status" = ANY (ARRAY['drawn'::"text", 'published'::"text", 'passed'::"text"])))
);


ALTER TABLE "public"."tod_draws" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tod_kicks" (
    "business_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "kicked_by" "uuid",
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "lifted_at" timestamp with time zone,
    "lifted_by" "uuid"
);


ALTER TABLE "public"."tod_kicks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tod_moderation_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "actor_id" "uuid",
    "action" "text" NOT NULL,
    "target_type" "text",
    "target_id" "uuid",
    "detail" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tod_moderation_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tod_rounds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "room_id" "uuid" NOT NULL,
    "creator_id" "uuid" NOT NULL,
    "category" "text" NOT NULL,
    "is_official" boolean DEFAULT false NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "message_id" "uuid",
    "plays_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '00:30:00'::interval) NOT NULL,
    "closed_at" timestamp with time zone,
    CONSTRAINT "tod_rounds_category_check" CHECK (("category" = ANY (ARRAY['classic'::"text", 'party'::"text", 'laughs'::"text", 'confessions'::"text", 'talent'::"text"]))),
    CONSTRAINT "tod_rounds_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'closed'::"text", 'expired'::"text", 'hidden'::"text"])))
);


ALTER TABLE "public"."tod_rounds" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tod_settings" (
    "business_id" "uuid" NOT NULL,
    "categories" "text"[] DEFAULT ARRAY['classic'::"text", 'party'::"text", 'laughs'::"text", 'confessions'::"text", 'talent'::"text"] NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tod_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tod_terms" (
    "user_id" "uuid" NOT NULL,
    "version" "text" NOT NULL,
    "accepted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tod_terms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tod_votes" (
    "draw_id" "uuid" NOT NULL,
    "voter_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tod_votes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ends_at" timestamp with time zone NOT NULL
);


ALTER TABLE "public"."trials" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."us_sales_tax_rates" (
    "state" character(2) NOT NULL,
    "rate" numeric(6,5) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "us_sales_tax_rates_rate_check" CHECK ((("rate" >= (0)::numeric) AND ("rate" < (1)::numeric)))
);


ALTER TABLE "public"."us_sales_tax_rates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_interests" (
    "user_id" "uuid" NOT NULL,
    "interest_key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_interests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."venue_exits" (
    "user_id" "uuid" NOT NULL,
    "business_id" "uuid" NOT NULL,
    "exited_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "purge_at" timestamp with time zone DEFAULT ("now"() + '01:00:00'::interval) NOT NULL,
    "reason" "text"
);


ALTER TABLE "public"."venue_exits" OWNER TO "postgres";


ALTER TABLE ONLY "public"."admin_roles"
    ADD CONSTRAINT "admin_roles_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."admin_roles"
    ADD CONSTRAINT "admin_roles_user_id_role_key" UNIQUE ("user_id", "role");


ALTER TABLE ONLY "public"."affiliate_commissions"
    ADD CONSTRAINT "affiliate_commissions_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."affiliate_payouts"
    ADD CONSTRAINT "affiliate_payouts_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."affiliates"
    ADD CONSTRAINT "affiliates_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."bans"
    ADD CONSTRAINT "bans_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."bans"
    ADD CONSTRAINT "bans_room_id_user_id_key" UNIQUE ("room_id", "user_id");


ALTER TABLE ONLY "public"."blocks"
    ADD CONSTRAINT "blocks_blocker_id_blocked_id_key" UNIQUE ("blocker_id", "blocked_id");


ALTER TABLE ONLY "public"."blocks"
    ADD CONSTRAINT "blocks_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."business_games"
    ADD CONSTRAINT "business_games_pkey" PRIMARY KEY ("business_id", "game_key");


ALTER TABLE ONLY "public"."business_verifications"
    ADD CONSTRAINT "business_verifications_business_id_key" UNIQUE ("business_id");


ALTER TABLE ONLY "public"."business_verifications"
    ADD CONSTRAINT "business_verifications_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."businesses"
    ADD CONSTRAINT "businesses_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."businesses"
    ADD CONSTRAINT "businesses_slug_key" UNIQUE ("slug");


ALTER TABLE ONLY "public"."check_ins"
    ADD CONSTRAINT "check_ins_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."custom_roles"
    ADD CONSTRAINT "custom_roles_business_name_unique" UNIQUE ("business_id", "name");


ALTER TABLE ONLY "public"."custom_roles"
    ADD CONSTRAINT "custom_roles_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."disputes"
    ADD CONSTRAINT "disputes_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."dm_conversations"
    ADD CONSTRAINT "dm_conversations_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."dm_conversations"
    ADD CONSTRAINT "dm_conversations_user_a_user_b_key" UNIQUE ("user_a", "user_b");


ALTER TABLE ONLY "public"."dm_messages"
    ADD CONSTRAINT "dm_messages_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_business_id_user_id_key" UNIQUE ("business_id", "user_id");


ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."follow_requests"
    ADD CONSTRAINT "follow_requests_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."follow_requests"
    ADD CONSTRAINT "follow_requests_requester_id_target_id_key" UNIQUE ("requester_id", "target_id");


ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_follower_id_following_id_key" UNIQUE ("follower_id", "following_id");


ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."game_optins"
    ADD CONSTRAINT "game_optins_pkey" PRIMARY KEY ("user_id", "business_id", "game_key");


ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_pkey" PRIMARY KEY ("key");


ALTER TABLE ONLY "public"."gift_offers"
    ADD CONSTRAINT "gift_offers_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."gift_offers"
    ADD CONSTRAINT "gift_offers_stripe_pi_id_key" UNIQUE ("stripe_pi_id");


ALTER TABLE ONLY "public"."gifts"
    ADD CONSTRAINT "gifts_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."guest_code_attempts"
    ADD CONSTRAINT "guest_code_attempts_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."guest_device_blocks"
    ADD CONSTRAINT "guest_device_blocks_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."guest_device_strikes"
    ADD CONSTRAINT "guest_device_strikes_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."guest_order_idempotency"
    ADD CONSTRAINT "guest_order_idempotency_pkey" PRIMARY KEY ("idempotency_key");


ALTER TABLE ONLY "public"."guest_service_attempts"
    ADD CONSTRAINT "guest_service_attempts_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."guest_tab_sessions"
    ADD CONSTRAINT "guest_tab_sessions_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."guest_tab_sessions"
    ADD CONSTRAINT "guest_tab_sessions_token_hash_key" UNIQUE ("token_hash");


ALTER TABLE ONLY "public"."interests"
    ADD CONSTRAINT "interests_pkey" PRIMARY KEY ("key");


ALTER TABLE ONLY "public"."inventory_locations"
    ADD CONSTRAINT "inventory_locations_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."loyalty_points"
    ADD CONSTRAINT "loyalty_points_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."loyalty_points"
    ADD CONSTRAINT "loyalty_points_user_id_business_id_key" UNIQUE ("user_id", "business_id");


ALTER TABLE ONLY "public"."loyalty_rewards"
    ADD CONSTRAINT "loyalty_rewards_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."loyalty_rules"
    ADD CONSTRAINT "loyalty_rules_business_id_key" UNIQUE ("business_id");


ALTER TABLE ONLY "public"."loyalty_rules"
    ADD CONSTRAINT "loyalty_rules_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."loyalty_tiers"
    ADD CONSTRAINT "loyalty_tiers_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."map_reactions"
    ADD CONSTRAINT "map_reactions_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."match_kicks"
    ADD CONSTRAINT "match_kicks_pkey" PRIMARY KEY ("business_id", "user_id");


ALTER TABLE ONLY "public"."match_photos"
    ADD CONSTRAINT "match_photos_path_key" UNIQUE ("path");


ALTER TABLE ONLY "public"."match_photos"
    ADD CONSTRAINT "match_photos_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."match_presence"
    ADD CONSTRAINT "match_presence_pkey" PRIMARY KEY ("user_id", "business_id");


ALTER TABLE ONLY "public"."match_relikes"
    ADD CONSTRAINT "match_relikes_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."match_super_quota"
    ADD CONSTRAINT "match_super_quota_pkey" PRIMARY KEY ("user_id", "day");


ALTER TABLE ONLY "public"."match_swipes"
    ADD CONSTRAINT "match_swipes_business_id_swiper_id_target_id_key" UNIQUE ("business_id", "swiper_id", "target_id");


ALTER TABLE ONLY "public"."match_swipes"
    ADD CONSTRAINT "match_swipes_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_business_id_user_a_user_b_key" UNIQUE ("business_id", "user_a", "user_b");


ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."menu_categories"
    ADD CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."menu_item_costs"
    ADD CONSTRAINT "menu_item_costs_pkey" PRIMARY KEY ("menu_item_id");


ALTER TABLE ONLY "public"."menu_item_modifier_groups"
    ADD CONSTRAINT "menu_item_modifier_groups_menu_item_id_modifier_group_id_key" UNIQUE ("menu_item_id", "modifier_group_id");


ALTER TABLE ONLY "public"."menu_item_modifier_groups"
    ADD CONSTRAINT "menu_item_modifier_groups_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."menu_item_photos"
    ADD CONSTRAINT "menu_item_photos_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."moderation_logs"
    ADD CONSTRAINT "moderation_logs_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."modifier_groups"
    ADD CONSTRAINT "modifier_groups_business_id_key_key" UNIQUE ("business_id", "key");


ALTER TABLE ONLY "public"."modifier_groups"
    ADD CONSTRAINT "modifier_groups_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."offers"
    ADD CONSTRAINT "offers_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."orphan_payments"
    ADD CONSTRAINT "orphan_payments_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."orphan_payments"
    ADD CONSTRAINT "orphan_payments_stripe_pi_id_key" UNIQUE ("stripe_pi_id");


ALTER TABLE ONLY "public"."pending_order_carts"
    ADD CONSTRAINT "pending_order_carts_pkey" PRIMARY KEY ("payment_intent_id");


ALTER TABLE ONLY "public"."pinned_messages"
    ADD CONSTRAINT "pinned_messages_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."pinned_messages"
    ADD CONSTRAINT "pinned_messages_room_id_message_id_key" UNIQUE ("room_id", "message_id");


ALTER TABLE ONLY "public"."platform_config"
    ADD CONSTRAINT "platform_config_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."pos_payments"
    ADD CONSTRAINT "pos_payments_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."pos_pins"
    ADD CONSTRAINT "pos_pins_pkey" PRIMARY KEY ("user_id", "business_id");


ALTER TABLE ONLY "public"."pos_printers"
    ADD CONSTRAINT "pos_printers_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."post_likes"
    ADD CONSTRAINT "post_likes_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."post_likes"
    ADD CONSTRAINT "post_likes_post_id_user_id_key" UNIQUE ("post_id", "user_id");


ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."processed_stripe_events"
    ADD CONSTRAINT "processed_stripe_events_pkey" PRIMARY KEY ("event_id");


ALTER TABLE ONLY "public"."product_catalog"
    ADD CONSTRAINT "product_catalog_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."promo_codes"
    ADD CONSTRAINT "promo_codes_code_key" UNIQUE ("code");


ALTER TABLE ONLY "public"."promo_codes"
    ADD CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."public_locations"
    ADD CONSTRAINT "public_locations_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."purchase_order_settings"
    ADD CONSTRAINT "purchase_order_settings_pkey" PRIMARY KEY ("business_id");


ALTER TABLE ONLY "public"."radius_increase_requests"
    ADD CONSTRAINT "radius_increase_requests_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."reservation_customers"
    ADD CONSTRAINT "reservation_customers_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."reservation_tables"
    ADD CONSTRAINT "reservation_tables_pkey" PRIMARY KEY ("reservation_id", "table_id");


ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_user_id_business_id_key" UNIQUE ("user_id", "business_id");


ALTER TABLE ONLY "public"."room_access_attempts"
    ADD CONSTRAINT "room_access_attempts_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."room_access_attempts"
    ADD CONSTRAINT "room_access_attempts_room_id_user_id_key" UNIQUE ("room_id", "user_id");


ALTER TABLE ONLY "public"."room_geo_presence"
    ADD CONSTRAINT "room_geo_presence_pkey" PRIMARY KEY ("room_id", "user_id");


ALTER TABLE ONLY "public"."room_members"
    ADD CONSTRAINT "room_members_pkey" PRIMARY KEY ("room_id", "user_id");


ALTER TABLE ONLY "public"."room_mutes"
    ADD CONSTRAINT "room_mutes_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."room_mutes"
    ADD CONSTRAINT "room_mutes_room_id_user_id_key" UNIQUE ("room_id", "user_id");


ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "rooms_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "rooms_qr_token_key" UNIQUE ("qr_token");


ALTER TABLE ONLY "public"."security_logs"
    ADD CONSTRAINT "security_logs_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."service_calls"
    ADD CONSTRAINT "service_calls_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."stock_by_location"
    ADD CONSTRAINT "stock_by_location_menu_item_id_location_id_key" UNIQUE ("menu_item_id", "location_id");


ALTER TABLE ONLY "public"."stock_by_location"
    ADD CONSTRAINT "stock_by_location_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."stories"
    ADD CONSTRAINT "stories_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."story_views"
    ADD CONSTRAINT "story_views_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."story_views"
    ADD CONSTRAINT "story_views_story_id_viewer_id_key" UNIQUE ("story_id", "viewer_id");


ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_business_id_key" UNIQUE ("business_id");


ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."tab_payments"
    ADD CONSTRAINT "tab_payments_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."table_reservation_log"
    ADD CONSTRAINT "table_reservation_log_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."table_tabs"
    ADD CONSTRAINT "table_tabs_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."table_waiters"
    ADD CONSTRAINT "table_waiters_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."table_waiters"
    ADD CONSTRAINT "table_waiters_table_id_employee_id_key" UNIQUE ("table_id", "employee_id");


ALTER TABLE ONLY "public"."tables"
    ADD CONSTRAINT "tables_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."tod_cards"
    ADD CONSTRAINT "tod_cards_concept_id_locale_key" UNIQUE ("concept_id", "locale");


ALTER TABLE ONLY "public"."tod_cards"
    ADD CONSTRAINT "tod_cards_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."tod_draws"
    ADD CONSTRAINT "tod_draws_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."tod_kicks"
    ADD CONSTRAINT "tod_kicks_pkey" PRIMARY KEY ("business_id", "user_id");


ALTER TABLE ONLY "public"."tod_moderation_log"
    ADD CONSTRAINT "tod_moderation_log_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."tod_rounds"
    ADD CONSTRAINT "tod_rounds_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."tod_settings"
    ADD CONSTRAINT "tod_settings_pkey" PRIMARY KEY ("business_id");


ALTER TABLE ONLY "public"."tod_terms"
    ADD CONSTRAINT "tod_terms_pkey" PRIMARY KEY ("user_id");


ALTER TABLE ONLY "public"."tod_votes"
    ADD CONSTRAINT "tod_votes_pkey" PRIMARY KEY ("draw_id", "voter_id");


ALTER TABLE ONLY "public"."trials"
    ADD CONSTRAINT "trials_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."us_sales_tax_rates"
    ADD CONSTRAINT "us_sales_tax_rates_pkey" PRIMARY KEY ("state");


ALTER TABLE ONLY "public"."user_interests"
    ADD CONSTRAINT "user_interests_pkey" PRIMARY KEY ("user_id", "interest_key");


ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_username_key" UNIQUE ("username");


ALTER TABLE ONLY "public"."venue_exits"
    ADD CONSTRAINT "venue_exits_pkey" PRIMARY KEY ("user_id", "business_id");


CREATE INDEX "affiliate_commissions_affiliate_idx" ON "public"."affiliate_commissions" USING "btree" ("affiliate_id");


CREATE INDEX "affiliate_commissions_business_idx" ON "public"."affiliate_commissions" USING "btree" ("business_id");


CREATE UNIQUE INDEX "affiliate_commissions_invoice_uidx" ON "public"."affiliate_commissions" USING "btree" ("stripe_invoice_id") WHERE ("stripe_invoice_id" IS NOT NULL);


CREATE INDEX "affiliate_commissions_payout_idx" ON "public"."affiliate_commissions" USING "btree" ("payout_id") WHERE ("payout_id" IS NOT NULL);


CREATE INDEX "affiliate_commissions_status_idx" ON "public"."affiliate_commissions" USING "btree" ("status");


CREATE INDEX "affiliate_commissions_user_idx" ON "public"."affiliate_commissions" USING "btree" ("user_id");


CREATE INDEX "affiliate_payouts_affiliate_idx" ON "public"."affiliate_payouts" USING "btree" ("affiliate_id");


CREATE UNIQUE INDEX "affiliates_number_lower_uidx" ON "public"."affiliates" USING "btree" ("lower"("affiliate_number"));


CREATE INDEX "businesses_referred_by_affiliate_idx" ON "public"."businesses" USING "btree" ("referred_by_affiliate_id") WHERE ("referred_by_affiliate_id" IS NOT NULL);


CREATE UNIQUE INDEX "businesses_subdomain_key" ON "public"."businesses" USING "btree" ("subdomain") WHERE ("subdomain" IS NOT NULL);


CREATE INDEX "dm_conversations_ephemeral_idx" ON "public"."dm_conversations" USING "btree" ("ephemeral_business_id") WHERE ("ephemeral_business_id" IS NOT NULL);


CREATE INDEX "dm_messages_media_pending_idx" ON "public"."dm_messages" USING "btree" ("created_at") WHERE ("media_moderation" = 'pending'::"text");


CREATE INDEX "dm_messages_media_url_idx" ON "public"."dm_messages" USING "btree" ("media_url") WHERE ("media_url" IS NOT NULL);


CREATE INDEX "gift_offers_expiry_idx" ON "public"."gift_offers" USING "btree" ("expires_at") WHERE ("status" = 'held'::"text");


CREATE INDEX "gift_offers_from_idx" ON "public"."gift_offers" USING "btree" ("from_user_id", "created_at" DESC);


CREATE INDEX "gift_offers_to_idx" ON "public"."gift_offers" USING "btree" ("to_user_id", "status");


CREATE INDEX "guest_code_attempts_dev_idx" ON "public"."guest_code_attempts" USING "btree" ("device_id", "created_at");


CREATE INDEX "guest_code_attempts_ip_idx" ON "public"."guest_code_attempts" USING "btree" ("ip_hash", "created_at");


CREATE INDEX "guest_code_attempts_tbl_idx" ON "public"."guest_code_attempts" USING "btree" ("table_id", "created_at");


CREATE UNIQUE INDEX "guest_device_blocks_active_uidx" ON "public"."guest_device_blocks" USING "btree" ("business_id", "device_id") WHERE ("unblocked_at" IS NULL);


CREATE INDEX "guest_device_strikes_idx" ON "public"."guest_device_strikes" USING "btree" ("business_id", "device_id", "created_at");


CREATE INDEX "guest_service_attempts_idx" ON "public"."guest_service_attempts" USING "btree" ("business_id", "device_id", "created_at" DESC);


CREATE INDEX "guest_tab_sessions_table_idx" ON "public"."guest_tab_sessions" USING "btree" ("table_id") WHERE ("revoked_at" IS NULL);


CREATE INDEX "idx_bans_user_id" ON "public"."bans" USING "btree" ("user_id");


CREATE INDEX "idx_blocks_blocked_id" ON "public"."blocks" USING "btree" ("blocked_id");


CREATE INDEX "idx_blocks_blocker_id" ON "public"."blocks" USING "btree" ("blocker_id");


CREATE INDEX "idx_business_verifications_business_id" ON "public"."business_verifications" USING "btree" ("business_id");


CREATE INDEX "idx_businesses_created_at" ON "public"."businesses" USING "btree" ("created_at");


CREATE INDEX "idx_businesses_is_temporary" ON "public"."businesses" USING "btree" ("owner_id", "is_temporary");


CREATE INDEX "idx_businesses_lat_lng" ON "public"."businesses" USING "btree" ("lat", "lng");


CREATE INDEX "idx_businesses_owner_id" ON "public"."businesses" USING "btree" ("owner_id");


CREATE INDEX "idx_businesses_slug" ON "public"."businesses" USING "btree" ("slug");


CREATE INDEX "idx_check_ins_business_id" ON "public"."check_ins" USING "btree" ("business_id");


CREATE INDEX "idx_check_ins_created_at" ON "public"."check_ins" USING "btree" ("created_at");


CREATE INDEX "idx_check_ins_user_id" ON "public"."check_ins" USING "btree" ("user_id");


CREATE INDEX "idx_comments_post_id" ON "public"."comments" USING "btree" ("post_id");


CREATE INDEX "idx_comments_user_id" ON "public"."comments" USING "btree" ("user_id");


CREATE INDEX "idx_custom_roles_business_id" ON "public"."custom_roles" USING "btree" ("business_id");


CREATE INDEX "idx_disputes_created_at" ON "public"."disputes" USING "btree" ("created_at");


CREATE INDEX "idx_disputes_opened_by" ON "public"."disputes" USING "btree" ("opened_by");


CREATE INDEX "idx_disputes_order_id" ON "public"."disputes" USING "btree" ("order_id");


CREATE INDEX "idx_dm_conversations_user_a" ON "public"."dm_conversations" USING "btree" ("user_a");


CREATE INDEX "idx_dm_conversations_user_b" ON "public"."dm_conversations" USING "btree" ("user_b");


CREATE INDEX "idx_dm_messages_conversation_id" ON "public"."dm_messages" USING "btree" ("conversation_id");


CREATE INDEX "idx_dm_messages_created_at" ON "public"."dm_messages" USING "btree" ("created_at");


CREATE INDEX "idx_employees_business_id" ON "public"."employees" USING "btree" ("business_id");


CREATE INDEX "idx_employees_user_id" ON "public"."employees" USING "btree" ("user_id");


CREATE INDEX "idx_follow_requests_requester_id" ON "public"."follow_requests" USING "btree" ("requester_id");


CREATE INDEX "idx_follow_requests_target_id" ON "public"."follow_requests" USING "btree" ("target_id");


CREATE INDEX "idx_follows_follower_id" ON "public"."follows" USING "btree" ("follower_id");


CREATE INDEX "idx_follows_following_id" ON "public"."follows" USING "btree" ("following_id");


CREATE INDEX "idx_gifts_created_at" ON "public"."gifts" USING "btree" ("created_at");


CREATE INDEX "idx_gifts_from_user" ON "public"."gifts" USING "btree" ("from_user");


CREATE INDEX "idx_gifts_room_id" ON "public"."gifts" USING "btree" ("room_id");


CREATE INDEX "idx_gifts_to_user" ON "public"."gifts" USING "btree" ("to_user");


CREATE INDEX "idx_inv_locations_business" ON "public"."inventory_locations" USING "btree" ("business_id");


CREATE INDEX "idx_loyalty_points_business_id" ON "public"."loyalty_points" USING "btree" ("business_id");


CREATE INDEX "idx_loyalty_points_user_id" ON "public"."loyalty_points" USING "btree" ("user_id");


CREATE INDEX "idx_loyalty_rewards_business_id" ON "public"."loyalty_rewards" USING "btree" ("business_id");


CREATE INDEX "idx_loyalty_tiers_business_id" ON "public"."loyalty_tiers" USING "btree" ("business_id");


CREATE INDEX "idx_map_reactions_room_id" ON "public"."map_reactions" USING "btree" ("room_id");


CREATE INDEX "idx_menu_categories_business_id" ON "public"."menu_categories" USING "btree" ("business_id");


CREATE INDEX "idx_menu_items_business_id" ON "public"."menu_items" USING "btree" ("business_id");


CREATE INDEX "idx_menu_items_category_id" ON "public"."menu_items" USING "btree" ("category_id");


CREATE INDEX "idx_menu_items_supplier" ON "public"."menu_items" USING "btree" ("supplier_id");


CREATE INDEX "idx_messages_created_at" ON "public"."messages" USING "btree" ("created_at");


CREATE INDEX "idx_messages_room_created" ON "public"."messages" USING "btree" ("room_id", "created_at" DESC);


CREATE INDEX "idx_messages_room_id" ON "public"."messages" USING "btree" ("room_id");


CREATE INDEX "idx_messages_user_id" ON "public"."messages" USING "btree" ("user_id");


CREATE INDEX "idx_mimg_group" ON "public"."menu_item_modifier_groups" USING "btree" ("modifier_group_id");


CREATE INDEX "idx_mimg_item" ON "public"."menu_item_modifier_groups" USING "btree" ("menu_item_id");


CREATE INDEX "idx_moderation_logs_business_id" ON "public"."moderation_logs" USING "btree" ("business_id");


CREATE INDEX "idx_moderation_logs_room_id" ON "public"."moderation_logs" USING "btree" ("room_id");


CREATE INDEX "idx_modifier_groups_business" ON "public"."modifier_groups" USING "btree" ("business_id");


CREATE INDEX "idx_notifications_created_at" ON "public"."notifications" USING "btree" ("created_at");


CREATE INDEX "idx_notifications_is_read" ON "public"."notifications" USING "btree" ("user_id", "is_read");


CREATE INDEX "idx_notifications_user_id" ON "public"."notifications" USING "btree" ("user_id");


CREATE INDEX "idx_offers_business_id" ON "public"."offers" USING "btree" ("business_id");


CREATE INDEX "idx_offers_room_id" ON "public"."offers" USING "btree" ("room_id");


CREATE INDEX "idx_order_items_menu_item_id" ON "public"."order_items" USING "btree" ("menu_item_id");


CREATE INDEX "idx_order_items_order_id" ON "public"."order_items" USING "btree" ("order_id");


CREATE INDEX "idx_orders_business_id" ON "public"."orders" USING "btree" ("business_id");


CREATE INDEX "idx_orders_business_paid_at" ON "public"."orders" USING "btree" ("business_id", "paid_at");


CREATE INDEX "idx_orders_created_at" ON "public"."orders" USING "btree" ("created_at");


CREATE INDEX "idx_orders_room_id" ON "public"."orders" USING "btree" ("room_id");


CREATE INDEX "idx_orders_status" ON "public"."orders" USING "btree" ("status");


CREATE INDEX "idx_orders_tab_id" ON "public"."orders" USING "btree" ("tab_id");


CREATE INDEX "idx_orders_table_id" ON "public"."orders" USING "btree" ("table_id");


CREATE INDEX "idx_orders_taken_by" ON "public"."orders" USING "btree" ("taken_by");


CREATE INDEX "idx_orders_user_id" ON "public"."orders" USING "btree" ("user_id");


CREATE INDEX "idx_orphan_payments_created" ON "public"."orphan_payments" USING "btree" ("created_at");


CREATE INDEX "idx_pinned_messages_room_id" ON "public"."pinned_messages" USING "btree" ("room_id");


CREATE INDEX "idx_pos_payments_paid_by_created" ON "public"."pos_payments" USING "btree" ("business_id", "paid_by", "created_at");


CREATE INDEX "idx_pos_printers_business" ON "public"."pos_printers" USING "btree" ("business_id");


CREATE INDEX "idx_pos_printers_business_role" ON "public"."pos_printers" USING "btree" ("business_id", "role") WHERE ("is_active" = true);


CREATE INDEX "idx_post_likes_post_id" ON "public"."post_likes" USING "btree" ("post_id");


CREATE INDEX "idx_post_likes_user_id" ON "public"."post_likes" USING "btree" ("user_id");


CREATE INDEX "idx_posts_created_at" ON "public"."posts" USING "btree" ("created_at" DESC);


CREATE INDEX "idx_posts_user_id" ON "public"."posts" USING "btree" ("user_id");


CREATE INDEX "idx_promo_codes_redeemed_by" ON "public"."promo_codes" USING "btree" ("redeemed_by");


CREATE INDEX "idx_public_locations_is_active" ON "public"."public_locations" USING "btree" ("is_active");


CREATE INDEX "idx_reports_created_at" ON "public"."reports" USING "btree" ("created_at" DESC);


CREATE INDEX "idx_reports_reported_user_id" ON "public"."reports" USING "btree" ("reported_user_id");


CREATE INDEX "idx_reports_status" ON "public"."reports" USING "btree" ("status");


CREATE INDEX "idx_res_customers_business_name" ON "public"."reservation_customers" USING "btree" ("business_id", "lower"("first_name"), "lower"("last_name"));


CREATE INDEX "idx_res_customers_business_phone" ON "public"."reservation_customers" USING "btree" ("business_id", "phone");


CREATE INDEX "idx_reservation_log_business" ON "public"."table_reservation_log" USING "btree" ("business_id", "created_at" DESC);


CREATE INDEX "idx_reservation_tables_table" ON "public"."reservation_tables" USING "btree" ("table_id");


CREATE INDEX "idx_reservations_business_id" ON "public"."reservations" USING "btree" ("business_id");


CREATE INDEX "idx_reservations_reserved_at" ON "public"."reservations" USING "btree" ("reserved_at");


CREATE INDEX "idx_reviews_business_id" ON "public"."reviews" USING "btree" ("business_id");


CREATE INDEX "idx_reviews_created_at" ON "public"."reviews" USING "btree" ("created_at");


CREATE INDEX "idx_reviews_user_id" ON "public"."reviews" USING "btree" ("user_id");


CREATE INDEX "idx_room_geo_presence_expires_at" ON "public"."room_geo_presence" USING "btree" ("expires_at");


CREATE INDEX "idx_room_members_expires_at" ON "public"."room_members" USING "btree" ("expires_at");


CREATE INDEX "idx_room_mutes_room_id" ON "public"."room_mutes" USING "btree" ("room_id");


CREATE INDEX "idx_rooms_business_id" ON "public"."rooms" USING "btree" ("business_id");


CREATE INDEX "idx_rooms_created_at" ON "public"."rooms" USING "btree" ("created_at");


CREATE INDEX "idx_rooms_parent_room_id" ON "public"."rooms" USING "btree" ("parent_room_id");


CREATE INDEX "idx_sbl_business" ON "public"."stock_by_location" USING "btree" ("business_id");


CREATE INDEX "idx_sbl_item" ON "public"."stock_by_location" USING "btree" ("menu_item_id");


CREATE INDEX "idx_sbl_location" ON "public"."stock_by_location" USING "btree" ("location_id");


CREATE INDEX "idx_security_logs_created_at" ON "public"."security_logs" USING "btree" ("created_at" DESC);


CREATE INDEX "idx_service_calls_business_id" ON "public"."service_calls" USING "btree" ("business_id");


CREATE INDEX "idx_service_calls_created_at" ON "public"."service_calls" USING "btree" ("created_at");


CREATE INDEX "idx_service_calls_room_id" ON "public"."service_calls" USING "btree" ("room_id");


CREATE INDEX "idx_service_calls_user_id" ON "public"."service_calls" USING "btree" ("user_id");


CREATE INDEX "idx_stock_movements_menu_item_id" ON "public"."stock_movements" USING "btree" ("menu_item_id");


CREATE INDEX "idx_stories_expires_at" ON "public"."stories" USING "btree" ("expires_at");


CREATE INDEX "idx_stories_user_id" ON "public"."stories" USING "btree" ("user_id");


CREATE INDEX "idx_story_views_story_id" ON "public"."story_views" USING "btree" ("story_id");


CREATE INDEX "idx_suppliers_business" ON "public"."suppliers" USING "btree" ("business_id");


CREATE INDEX "idx_tab_payments_biz_created" ON "public"."tab_payments" USING "btree" ("business_id", "created_at");


CREATE INDEX "idx_tab_payments_pay_token" ON "public"."tab_payments" USING "btree" ("pay_token");


CREATE INDEX "idx_tab_payments_tab_status" ON "public"."tab_payments" USING "btree" ("tab_id", "status");


CREATE INDEX "idx_table_tabs_business_status" ON "public"."table_tabs" USING "btree" ("business_id", "status");


CREATE INDEX "idx_table_tabs_owner_uid" ON "public"."table_tabs" USING "btree" ("owner_uid");


CREATE INDEX "idx_table_tabs_table_status" ON "public"."table_tabs" USING "btree" ("table_id", "status");


CREATE INDEX "idx_table_waiters_business" ON "public"."table_waiters" USING "btree" ("business_id");


CREATE INDEX "idx_table_waiters_employee" ON "public"."table_waiters" USING "btree" ("employee_id");


CREATE INDEX "idx_tables_business_floor_sort" ON "public"."tables" USING "btree" ("business_id", "floor", "sort");


CREATE INDEX "idx_trials_business_id" ON "public"."trials" USING "btree" ("business_id");


CREATE INDEX "idx_users_active_business" ON "public"."users" USING "btree" ("active_business_id");


CREATE INDEX "idx_users_created_at" ON "public"."users" USING "btree" ("created_at");


CREATE INDEX "idx_users_plan" ON "public"."users" USING "btree" ("plan", "plan_status");


CREATE INDEX "idx_users_username" ON "public"."users" USING "btree" ("username");


CREATE INDEX "match_photos_review_idx" ON "public"."match_photos" USING "btree" ("created_at") WHERE ("status" = 'pending'::"text");


CREATE INDEX "match_photos_user_idx" ON "public"."match_photos" USING "btree" ("user_id", "status", "sort");


CREATE INDEX "match_presence_business_active_idx" ON "public"."match_presence" USING "btree" ("business_id", "expires_at") WHERE ("active_since" IS NOT NULL);


CREATE INDEX "match_presence_expires_idx" ON "public"."match_presence" USING "btree" ("expires_at");


CREATE INDEX "match_relikes_idx" ON "public"."match_relikes" USING "btree" ("user_id", "business_id", "created_at" DESC);


CREATE INDEX "match_swipes_target_idx" ON "public"."match_swipes" USING "btree" ("business_id", "target_id") WHERE ("undone_at" IS NULL);


CREATE INDEX "menu_item_costs_business_idx" ON "public"."menu_item_costs" USING "btree" ("business_id");


CREATE INDEX "menu_item_photos_business_idx" ON "public"."menu_item_photos" USING "btree" ("business_id");


CREATE INDEX "menu_item_photos_item_sort_idx" ON "public"."menu_item_photos" USING "btree" ("menu_item_id", "sort");


CREATE UNIQUE INDEX "menu_items_business_barcode_ux" ON "public"."menu_items" USING "btree" ("business_id", "barcode") WHERE ("barcode" IS NOT NULL);


CREATE INDEX "orders_awaiting_idx" ON "public"."orders" USING "btree" ("business_id", "created_at") WHERE ("approval_status" = 'awaiting'::"text");


CREATE INDEX "orders_comanda_pending_idx" ON "public"."orders" USING "btree" ("business_id", "created_at") WHERE (("comanda_printed_at" IS NULL) AND ("source" = ANY (ARRAY['customer_stripe'::"text", 'customer_tab'::"text"])));


CREATE INDEX "orders_guest_session_idx" ON "public"."orders" USING "btree" ("guest_session_id") WHERE ("guest_session_id" IS NOT NULL);


CREATE UNIQUE INDEX "orders_guest_tracking_code_key" ON "public"."orders" USING "btree" ("guest_tracking_code") WHERE ("guest_tracking_code" IS NOT NULL);


CREATE UNIQUE INDEX "orders_order_number_key" ON "public"."orders" USING "btree" ("order_number");


CREATE UNIQUE INDEX "orders_stripe_pi_id_uniq" ON "public"."orders" USING "btree" ("stripe_pi_id") WHERE ("stripe_pi_id" IS NOT NULL);


CREATE INDEX "pending_order_carts_created_at_idx" ON "public"."pending_order_carts" USING "btree" ("created_at");


CREATE UNIQUE INDEX "pos_payments_receipt_code_key" ON "public"."pos_payments" USING "btree" ("receipt_code") WHERE ("receipt_code" IS NOT NULL);


CREATE INDEX "pos_payments_session_idx" ON "public"."pos_payments" USING "btree" ("table_id", "session_opened_at", "status");


CREATE INDEX "pos_payments_tab_idx" ON "public"."pos_payments" USING "btree" ("business_id", "table_id", "status");


CREATE UNIQUE INDEX "pos_printers_biz_role_unique" ON "public"."pos_printers" USING "btree" ("business_id", "role") WHERE ("role" = ANY (ARRAY['kitchen'::"text", 'bar'::"text"]));


CREATE INDEX "posts_business_created_idx" ON "public"."posts" USING "btree" ("business_id", "created_at" DESC) WHERE ("business_id" IS NOT NULL);


CREATE UNIQUE INDEX "product_catalog_barcode_ux" ON "public"."product_catalog" USING "btree" ("barcode") WHERE ("barcode" IS NOT NULL);


CREATE INDEX "product_catalog_cat_brand_ix" ON "public"."product_catalog" USING "btree" ("category", "brand");


CREATE INDEX "product_catalog_country_active_ix" ON "public"."product_catalog" USING "btree" ("country") WHERE "is_active";


CREATE UNIQUE INDEX "product_catalog_source_ux" ON "public"."product_catalog" USING "btree" ("source", "source_id") WHERE ("source_id" IS NOT NULL);


CREATE INDEX "reports_business_idx" ON "public"."reports" USING "btree" ("business_id", "created_at" DESC);


CREATE INDEX "reports_content_idx" ON "public"."reports" USING "btree" ("content_type", "content_id") WHERE ("content_id" IS NOT NULL);


CREATE INDEX "reports_pending_priority_idx" ON "public"."reports" USING "btree" ("priority", "created_at" DESC) WHERE ("status" = 'pending'::"text");


CREATE INDEX "reports_reporter_day_idx" ON "public"."reports" USING "btree" ("reporter_id", "created_at" DESC);


CREATE INDEX "service_calls_order_idx" ON "public"."service_calls" USING "btree" ("order_id") WHERE ("order_id" IS NOT NULL);


CREATE UNIQUE INDEX "tables_open_access_code_uidx" ON "public"."tables" USING "btree" ("business_id", "access_code") WHERE ("access_code" IS NOT NULL);


CREATE UNIQUE INDEX "tables_short_code_key" ON "public"."tables" USING "btree" ("business_id", "short_code") WHERE ("short_code" IS NOT NULL);


CREATE INDEX "tod_cards_pick_idx" ON "public"."tod_cards" USING "btree" ("category", "kind", "active");


CREATE INDEX "tod_draws_round_idx" ON "public"."tod_draws" USING "btree" ("round_id");


CREATE INDEX "tod_draws_user_biz_idx" ON "public"."tod_draws" USING "btree" ("user_id", "business_id", "created_at" DESC);


CREATE INDEX "tod_modlog_biz_idx" ON "public"."tod_moderation_log" USING "btree" ("business_id", "created_at" DESC);


CREATE INDEX "tod_rounds_creator_idx" ON "public"."tod_rounds" USING "btree" ("creator_id", "business_id", "created_at" DESC);


CREATE INDEX "tod_rounds_room_active_idx" ON "public"."tod_rounds" USING "btree" ("room_id", "expires_at") WHERE ("status" = 'active'::"text");


CREATE UNIQUE INDEX "uq_tab_payments_pay_token" ON "public"."tab_payments" USING "btree" ("pay_token");


CREATE UNIQUE INDEX "uq_tab_payments_stripe_pi" ON "public"."tab_payments" USING "btree" ("stripe_pi_id") WHERE ("stripe_pi_id" IS NOT NULL);


CREATE UNIQUE INDEX "uq_tables_business_label" ON "public"."tables" USING "btree" ("business_id", "lower"("label"));


CREATE UNIQUE INDEX "uq_tables_qr_token" ON "public"."tables" USING "btree" ("qr_token");


CREATE INDEX "users_is_test_idx" ON "public"."users" USING "btree" ("id") WHERE "is_test";


CREATE INDEX "users_referred_by_affiliate_idx" ON "public"."users" USING "btree" ("referred_by_affiliate_id") WHERE ("referred_by_affiliate_id" IS NOT NULL);


CREATE UNIQUE INDEX "users_username_lower_unique" ON "public"."users" USING "btree" ("lower"("username"));


CREATE INDEX "venue_exits_purge_idx" ON "public"."venue_exits" USING "btree" ("purge_at");


CREATE OR REPLACE TRIGGER "reservations_customer_guard" BEFORE UPDATE ON "public"."reservations" FOR EACH ROW EXECUTE FUNCTION "public"."reservations_customer_guard"();


CREATE OR REPLACE TRIGGER "set_affiliate_commissions_updated_at" BEFORE UPDATE ON "public"."affiliate_commissions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


CREATE OR REPLACE TRIGGER "set_affiliates_updated_at" BEFORE UPDATE ON "public"."affiliates" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


CREATE OR REPLACE TRIGGER "trg_assign_room_qr_token" BEFORE INSERT ON "public"."rooms" FOR EACH ROW EXECUTE FUNCTION "public"."trg_fn_assign_room_qr_token"();


CREATE OR REPLACE TRIGGER "trg_assign_table_qr_token" BEFORE INSERT ON "public"."tables" FOR EACH ROW EXECUTE FUNCTION "public"."trg_fn_assign_table_qr_token"();


CREATE OR REPLACE TRIGGER "trg_auto_uncombine" AFTER UPDATE OF "paid_at" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."auto_uncombine_on_tab_close"();


CREATE OR REPLACE TRIGGER "trg_businesses_updated_at" BEFORE UPDATE ON "public"."businesses" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


CREATE OR REPLACE TRIGGER "trg_disputes_updated_at" BEFORE UPDATE ON "public"."disputes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


CREATE OR REPLACE TRIGGER "trg_dm_first_message_guard" BEFORE INSERT ON "public"."dm_messages" FOR EACH ROW EXECUTE FUNCTION "public"."dm_first_message_guard"();


CREATE OR REPLACE TRIGGER "trg_dm_media_guard" BEFORE UPDATE ON "public"."dm_messages" FOR EACH ROW EXECUTE FUNCTION "public"."dm_messages_media_guard"();


CREATE OR REPLACE TRIGGER "trg_dm_media_init" BEFORE INSERT ON "public"."dm_messages" FOR EACH ROW EXECUTE FUNCTION "public"."dm_messages_media_init"();


CREATE OR REPLACE TRIGGER "trg_dm_photo_moderation" AFTER INSERT ON "public"."dm_messages" FOR EACH ROW WHEN (("new"."media_url" IS NOT NULL)) EXECUTE FUNCTION "public"."dm_photo_dispatch_moderation"();


CREATE OR REPLACE TRIGGER "trg_employees_plan_limit" BEFORE INSERT ON "public"."employees" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_employee_plan_limit"();


CREATE OR REPLACE TRIGGER "trg_enforce_business_limit" BEFORE INSERT ON "public"."businesses" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_business_limit"();


CREATE OR REPLACE TRIGGER "trg_enforce_business_radius_cap" BEFORE INSERT OR UPDATE OF "geofence_radius_m" ON "public"."businesses" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_business_radius_cap"();


CREATE OR REPLACE TRIGGER "trg_gift_offer_dispatch" AFTER UPDATE OF "status" ON "public"."gift_offers" FOR EACH ROW EXECUTE FUNCTION "public"."gift_offer_dispatch"();


CREATE OR REPLACE TRIGGER "trg_gift_offer_notify" AFTER UPDATE OF "status" ON "public"."gift_offers" FOR EACH ROW EXECUTE FUNCTION "public"."gift_offer_notify_response"();


CREATE OR REPLACE TRIGGER "trg_gift_offers_touch" BEFORE UPDATE ON "public"."gift_offers" FOR EACH ROW EXECUTE FUNCTION "public"."gift_offers_touch"();


CREATE OR REPLACE TRIGGER "trg_match_detect" AFTER INSERT OR UPDATE OF "action", "undone_at" ON "public"."match_swipes" FOR EACH ROW EXECUTE FUNCTION "public"."match_detect"();


CREATE OR REPLACE TRIGGER "trg_match_follow_survival" AFTER INSERT ON "public"."follows" FOR EACH ROW EXECUTE FUNCTION "public"."match_follow_survival"();


CREATE OR REPLACE TRIGGER "trg_match_notify_new_people" AFTER INSERT OR UPDATE OF "active_since" ON "public"."match_presence" FOR EACH ROW EXECUTE FUNCTION "public"."match_notify_new_people"();


CREATE OR REPLACE TRIGGER "trg_match_photo_moderation" AFTER INSERT ON "public"."match_photos" FOR EACH ROW EXECUTE FUNCTION "public"."match_photo_dispatch_moderation"();


CREATE OR REPLACE TRIGGER "trg_match_photos_guard" BEFORE UPDATE ON "public"."match_photos" FOR EACH ROW EXECUTE FUNCTION "public"."match_photos_guard"();


CREATE OR REPLACE TRIGGER "trg_match_photos_limit" BEFORE INSERT ON "public"."match_photos" FOR EACH ROW EXECUTE FUNCTION "public"."match_photos_limit"();


CREATE OR REPLACE TRIGGER "trg_match_relikes_wipe" AFTER DELETE ON "public"."match_presence" FOR EACH ROW EXECUTE FUNCTION "public"."match_relikes_wipe_on_leave"();


CREATE OR REPLACE TRIGGER "trg_menu_item_costs_updated_at" BEFORE UPDATE ON "public"."menu_item_costs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


CREATE OR REPLACE TRIGGER "trg_menu_items_updated_at" BEFORE UPDATE ON "public"."menu_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


CREATE OR REPLACE TRIGGER "trg_message_filter" BEFORE INSERT OR UPDATE OF "body" ON "public"."comments" FOR EACH ROW EXECUTE FUNCTION "public"."message_filter_trigger"();


CREATE OR REPLACE TRIGGER "trg_message_filter" BEFORE INSERT OR UPDATE OF "body" ON "public"."dm_messages" FOR EACH ROW EXECUTE FUNCTION "public"."message_filter_trigger"();


CREATE OR REPLACE TRIGGER "trg_message_filter" BEFORE INSERT OR UPDATE OF "body" ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."message_filter_trigger"();


CREATE OR REPLACE TRIGGER "trg_messages_type_guard" BEFORE INSERT OR UPDATE ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."messages_type_guard"();


CREATE OR REPLACE TRIGGER "trg_notify_low_stock" AFTER UPDATE OF "stock_count" ON "public"."menu_items" FOR EACH ROW EXECUTE FUNCTION "public"."notify_low_stock"();


CREATE OR REPLACE TRIGGER "trg_notify_on_comment" AFTER INSERT ON "public"."comments" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_comment"();


CREATE OR REPLACE TRIGGER "trg_notify_on_follow" AFTER INSERT ON "public"."follows" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_follow"();


CREATE OR REPLACE TRIGGER "trg_notify_on_follow_request" AFTER INSERT ON "public"."follow_requests" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_follow_request"();


CREATE OR REPLACE TRIGGER "trg_notify_on_post_like" AFTER INSERT ON "public"."post_likes" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_post_like"();


CREATE OR REPLACE TRIGGER "trg_notify_order_status" AFTER UPDATE OF "status" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."notify_order_status"();


CREATE OR REPLACE TRIGGER "trg_order_auto_delivered" AFTER UPDATE OF "item_status" ON "public"."order_items" FOR EACH ROW EXECUTE FUNCTION "public"."order_auto_delivered"();


CREATE OR REPLACE TRIGGER "trg_order_items_normalize_status" BEFORE INSERT OR UPDATE OF "item_status" ON "public"."order_items" FOR EACH ROW EXECUTE FUNCTION "public"."normalize_item_status"();


CREATE OR REPLACE TRIGGER "trg_order_items_sync_order_status" AFTER INSERT OR DELETE OR UPDATE OF "item_status" ON "public"."order_items" FOR EACH ROW EXECUTE FUNCTION "public"."sync_order_status_from_items"();


CREATE OR REPLACE TRIGGER "trg_orders_status_change" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."orders_status_changed"();


CREATE OR REPLACE TRIGGER "trg_orders_updated_at" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


CREATE OR REPLACE TRIGGER "trg_push_on_dm_insert" AFTER INSERT ON "public"."dm_messages" FOR EACH ROW WHEN (("new"."gift_offer_id" IS NULL)) EXECUTE FUNCTION "public"."push_on_dm_insert"();


CREATE OR REPLACE TRIGGER "trg_push_on_notification_insert" AFTER INSERT ON "public"."notifications" FOR EACH ROW WHEN (("new"."type" = ANY (ARRAY['follower'::"text", 'like'::"text", 'comment'::"text", 'work_alert'::"text", 'match_like'::"text", 'match_super'::"text", 'match_match'::"text", 'match_new_people'::"text", 'order_status'::"text", 'gift_offer'::"text", 'gift_response'::"text"]))) EXECUTE FUNCTION "public"."push_on_notification_insert"();


CREATE OR REPLACE TRIGGER "trg_reports_priority" BEFORE INSERT ON "public"."reports" FOR EACH ROW EXECUTE FUNCTION "public"."reports_set_priority"();


CREATE OR REPLACE TRIGGER "trg_reports_set_business_from_tod_message" BEFORE INSERT ON "public"."reports" FOR EACH ROW EXECUTE FUNCTION "public"."reports_set_business_from_tod_message"();


CREATE OR REPLACE TRIGGER "trg_reports_urgent_alert" AFTER INSERT ON "public"."reports" FOR EACH ROW WHEN (("new"."priority" = 'urgent'::"text")) EXECUTE FUNCTION "public"."reports_urgent_alert"();


CREATE OR REPLACE TRIGGER "trg_rooms_updated_at" BEFORE UPDATE ON "public"."rooms" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


CREATE OR REPLACE TRIGGER "trg_sbl_sync_total" AFTER INSERT OR DELETE OR UPDATE ON "public"."stock_by_location" FOR EACH ROW EXECUTE FUNCTION "public"."sbl_sync_total"();


CREATE OR REPLACE TRIGGER "trg_service_call_cooldown" BEFORE INSERT ON "public"."service_calls" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_service_call_cooldown"();


CREATE OR REPLACE TRIGGER "trg_service_call_golden_rule" BEFORE INSERT ON "public"."service_calls" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_service_call_golden_rule"();


CREATE OR REPLACE TRIGGER "trg_service_calls_updated_at" BEFORE UPDATE ON "public"."service_calls" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


CREATE OR REPLACE TRIGGER "trg_stamp_item_status" BEFORE UPDATE OF "item_status" ON "public"."order_items" FOR EACH ROW EXECUTE FUNCTION "public"."stamp_item_status_time"();


CREATE OR REPLACE TRIGGER "trg_sync_business_coords_radius" BEFORE INSERT OR UPDATE ON "public"."businesses" FOR EACH ROW EXECUTE FUNCTION "public"."sync_business_coords_radius"();


CREATE OR REPLACE TRIGGER "trg_tab_payment_defaults" BEFORE INSERT ON "public"."tab_payments" FOR EACH ROW EXECUTE FUNCTION "public"."trg_fn_tab_payment_defaults"();


CREATE OR REPLACE TRIGGER "trg_tab_payments_updated_at" BEFORE UPDATE ON "public"."tab_payments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


CREATE OR REPLACE TRIGGER "trg_table_session_autoclose" AFTER UPDATE OF "paid_at", "canceled_at" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."trg_fn_table_session_autoclose"();


CREATE OR REPLACE TRIGGER "trg_table_tabs_business_id" BEFORE INSERT ON "public"."table_tabs" FOR EACH ROW EXECUTE FUNCTION "public"."set_tab_business_id"();


CREATE OR REPLACE TRIGGER "trg_table_tabs_updated_at" BEFORE UPDATE ON "public"."table_tabs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


CREATE OR REPLACE TRIGGER "trg_table_waiters_business_id" BEFORE INSERT ON "public"."table_waiters" FOR EACH ROW EXECUTE FUNCTION "public"."set_tab_business_id"();


CREATE OR REPLACE TRIGGER "trg_tables_deactivate_subchat" BEFORE DELETE ON "public"."tables" FOR EACH ROW EXECUTE FUNCTION "public"."trg_deactivate_table_subchat"();


CREATE OR REPLACE TRIGGER "trg_tables_short_code" BEFORE INSERT ON "public"."tables" FOR EACH ROW EXECUTE FUNCTION "public"."tables_set_short_code"();


CREATE OR REPLACE TRIGGER "trg_tables_updated_at" BEFORE UPDATE ON "public"."tables" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


CREATE OR REPLACE TRIGGER "trg_tod_auto_hide" AFTER INSERT ON "public"."reports" FOR EACH ROW EXECUTE FUNCTION "public"."tod_auto_hide_on_reports"();


CREATE OR REPLACE TRIGGER "trg_users_is_test_guard" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."users_is_test_guard"();


CREATE OR REPLACE TRIGGER "trg_users_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


CREATE OR REPLACE TRIGGER "trg_validate_business_subdomain" BEFORE INSERT OR UPDATE OF "subdomain" ON "public"."businesses" FOR EACH ROW EXECUTE FUNCTION "public"."validate_business_subdomain"();


ALTER TABLE ONLY "public"."admin_roles"
    ADD CONSTRAINT "admin_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."affiliate_commissions"
    ADD CONSTRAINT "affiliate_commissions_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id");


ALTER TABLE ONLY "public"."affiliate_commissions"
    ADD CONSTRAINT "affiliate_commissions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id");


ALTER TABLE ONLY "public"."affiliate_commissions"
    ADD CONSTRAINT "affiliate_commissions_payout_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."affiliate_payouts"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."affiliate_commissions"
    ADD CONSTRAINT "affiliate_commissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."affiliate_payouts"
    ADD CONSTRAINT "affiliate_payouts_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id");


ALTER TABLE ONLY "public"."affiliate_payouts"
    ADD CONSTRAINT "affiliate_payouts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."affiliates"
    ADD CONSTRAINT "affiliates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."affiliates"
    ADD CONSTRAINT "affiliates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."bans"
    ADD CONSTRAINT "bans_banned_by_fkey" FOREIGN KEY ("banned_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."bans"
    ADD CONSTRAINT "bans_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."bans"
    ADD CONSTRAINT "bans_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."bans"
    ADD CONSTRAINT "bans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."blocks"
    ADD CONSTRAINT "blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."blocks"
    ADD CONSTRAINT "blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."business_games"
    ADD CONSTRAINT "business_games_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."business_games"
    ADD CONSTRAINT "business_games_game_key_fkey" FOREIGN KEY ("game_key") REFERENCES "public"."games"("key") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."business_verifications"
    ADD CONSTRAINT "business_verifications_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."businesses"
    ADD CONSTRAINT "businesses_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."businesses"
    ADD CONSTRAINT "businesses_referred_by_affiliate_id_fkey" FOREIGN KEY ("referred_by_affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."businesses"
    ADD CONSTRAINT "businesses_sales_location_id_fkey" FOREIGN KEY ("sales_location_id") REFERENCES "public"."inventory_locations"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."businesses"
    ADD CONSTRAINT "businesses_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "auth"."users"("id");


ALTER TABLE ONLY "public"."check_ins"
    ADD CONSTRAINT "check_ins_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."check_ins"
    ADD CONSTRAINT "check_ins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."custom_roles"
    ADD CONSTRAINT "custom_roles_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."disputes"
    ADD CONSTRAINT "disputes_opened_by_fkey" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."disputes"
    ADD CONSTRAINT "disputes_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."dm_conversations"
    ADD CONSTRAINT "dm_conversations_ephemeral_business_id_fkey" FOREIGN KEY ("ephemeral_business_id") REFERENCES "public"."businesses"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."dm_conversations"
    ADD CONSTRAINT "dm_conversations_first_sender_id_fkey" FOREIGN KEY ("first_sender_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."dm_conversations"
    ADD CONSTRAINT "dm_conversations_user_a_fkey" FOREIGN KEY ("user_a") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."dm_conversations"
    ADD CONSTRAINT "dm_conversations_user_b_fkey" FOREIGN KEY ("user_b") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."dm_messages"
    ADD CONSTRAINT "dm_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."dm_conversations"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."dm_messages"
    ADD CONSTRAINT "dm_messages_gift_offer_id_fkey" FOREIGN KEY ("gift_offer_id") REFERENCES "public"."gift_offers"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."dm_messages"
    ADD CONSTRAINT "dm_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_custom_role_id_fkey" FOREIGN KEY ("custom_role_id") REFERENCES "public"."custom_roles"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."follow_requests"
    ADD CONSTRAINT "follow_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."follow_requests"
    ADD CONSTRAINT "follow_requests_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_following_id_fkey" FOREIGN KEY ("following_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."game_optins"
    ADD CONSTRAINT "game_optins_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."game_optins"
    ADD CONSTRAINT "game_optins_game_key_fkey" FOREIGN KEY ("game_key") REFERENCES "public"."games"("key") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."game_optins"
    ADD CONSTRAINT "game_optins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."gift_offers"
    ADD CONSTRAINT "gift_offers_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."gift_offers"
    ADD CONSTRAINT "gift_offers_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."dm_conversations"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."gift_offers"
    ADD CONSTRAINT "gift_offers_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."gift_offers"
    ADD CONSTRAINT "gift_offers_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."gift_offers"
    ADD CONSTRAINT "gift_offers_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."gifts"
    ADD CONSTRAINT "gifts_from_user_fkey" FOREIGN KEY ("from_user") REFERENCES "public"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."gifts"
    ADD CONSTRAINT "gifts_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."gifts"
    ADD CONSTRAINT "gifts_to_user_fkey" FOREIGN KEY ("to_user") REFERENCES "public"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."guest_device_blocks"
    ADD CONSTRAINT "guest_device_blocks_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."guest_device_strikes"
    ADD CONSTRAINT "guest_device_strikes_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."guest_device_strikes"
    ADD CONSTRAINT "guest_device_strikes_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."guest_order_idempotency"
    ADD CONSTRAINT "guest_order_idempotency_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."guest_service_attempts"
    ADD CONSTRAINT "guest_service_attempts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."guest_tab_sessions"
    ADD CONSTRAINT "guest_tab_sessions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."guest_tab_sessions"
    ADD CONSTRAINT "guest_tab_sessions_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."inventory_locations"
    ADD CONSTRAINT "inventory_locations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."loyalty_points"
    ADD CONSTRAINT "loyalty_points_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."loyalty_points"
    ADD CONSTRAINT "loyalty_points_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."loyalty_rewards"
    ADD CONSTRAINT "loyalty_rewards_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."loyalty_rules"
    ADD CONSTRAINT "loyalty_rules_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."loyalty_tiers"
    ADD CONSTRAINT "loyalty_tiers_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."map_reactions"
    ADD CONSTRAINT "map_reactions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."map_reactions"
    ADD CONSTRAINT "map_reactions_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."map_reactions"
    ADD CONSTRAINT "map_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."match_kicks"
    ADD CONSTRAINT "match_kicks_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."match_kicks"
    ADD CONSTRAINT "match_kicks_kicked_by_fkey" FOREIGN KEY ("kicked_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."match_kicks"
    ADD CONSTRAINT "match_kicks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."match_photos"
    ADD CONSTRAINT "match_photos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."match_presence"
    ADD CONSTRAINT "match_presence_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."match_presence"
    ADD CONSTRAINT "match_presence_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."match_relikes"
    ADD CONSTRAINT "match_relikes_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."match_relikes"
    ADD CONSTRAINT "match_relikes_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."match_relikes"
    ADD CONSTRAINT "match_relikes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."match_super_quota"
    ADD CONSTRAINT "match_super_quota_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."match_swipes"
    ADD CONSTRAINT "match_swipes_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."match_swipes"
    ADD CONSTRAINT "match_swipes_swiper_id_fkey" FOREIGN KEY ("swiper_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."match_swipes"
    ADD CONSTRAINT "match_swipes_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."dm_conversations"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_user_a_fkey" FOREIGN KEY ("user_a") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_user_b_fkey" FOREIGN KEY ("user_b") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."menu_categories"
    ADD CONSTRAINT "menu_categories_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."menu_item_costs"
    ADD CONSTRAINT "menu_item_costs_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."menu_item_costs"
    ADD CONSTRAINT "menu_item_costs_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."menu_item_modifier_groups"
    ADD CONSTRAINT "menu_item_modifier_groups_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."menu_item_modifier_groups"
    ADD CONSTRAINT "menu_item_modifier_groups_modifier_group_id_fkey" FOREIGN KEY ("modifier_group_id") REFERENCES "public"."modifier_groups"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."menu_item_photos"
    ADD CONSTRAINT "menu_item_photos_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."menu_item_photos"
    ADD CONSTRAINT "menu_item_photos_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."menu_categories"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_reply_to_fkey" FOREIGN KEY ("reply_to") REFERENCES "public"."messages"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."moderation_logs"
    ADD CONSTRAINT "moderation_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."moderation_logs"
    ADD CONSTRAINT "moderation_logs_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."moderation_logs"
    ADD CONSTRAINT "moderation_logs_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."moderation_logs"
    ADD CONSTRAINT "moderation_logs_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."modifier_groups"
    ADD CONSTRAINT "modifier_groups_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."offers"
    ADD CONSTRAINT "offers_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."offers"
    ADD CONSTRAINT "offers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."offers"
    ADD CONSTRAINT "offers_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE RESTRICT;


ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_gift_recipient_id_fkey" FOREIGN KEY ("gift_recipient_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_guest_session_fk" FOREIGN KEY ("guest_session_id") REFERENCES "public"."guest_tab_sessions"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_tab_id_fkey" FOREIGN KEY ("tab_id") REFERENCES "public"."table_tabs"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_taken_by_fkey" FOREIGN KEY ("taken_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."orphan_payments"
    ADD CONSTRAINT "orphan_payments_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."pending_order_carts"
    ADD CONSTRAINT "pending_order_carts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."pending_order_carts"
    ADD CONSTRAINT "pending_order_carts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."pinned_messages"
    ADD CONSTRAINT "pinned_messages_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."pinned_messages"
    ADD CONSTRAINT "pinned_messages_pinned_by_fkey" FOREIGN KEY ("pinned_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."pinned_messages"
    ADD CONSTRAINT "pinned_messages_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."pos_payments"
    ADD CONSTRAINT "pos_payments_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."pos_payments"
    ADD CONSTRAINT "pos_payments_guest_session_id_fkey" FOREIGN KEY ("guest_session_id") REFERENCES "public"."guest_tab_sessions"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."pos_payments"
    ADD CONSTRAINT "pos_payments_paid_by_fkey" FOREIGN KEY ("paid_by") REFERENCES "auth"."users"("id");


ALTER TABLE ONLY "public"."pos_payments"
    ADD CONSTRAINT "pos_payments_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."pos_pins"
    ADD CONSTRAINT "pos_pins_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."pos_pins"
    ADD CONSTRAINT "pos_pins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."pos_printers"
    ADD CONSTRAINT "pos_printers_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."post_likes"
    ADD CONSTRAINT "post_likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."post_likes"
    ADD CONSTRAINT "post_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."promo_codes"
    ADD CONSTRAINT "promo_codes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."promo_codes"
    ADD CONSTRAINT "promo_codes_redeemed_by_fkey" FOREIGN KEY ("redeemed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."public_locations"
    ADD CONSTRAINT "public_locations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."public_locations"
    ADD CONSTRAINT "public_locations_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."purchase_order_settings"
    ADD CONSTRAINT "purchase_order_settings_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."radius_increase_requests"
    ADD CONSTRAINT "radius_increase_requests_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."radius_increase_requests"
    ADD CONSTRAINT "radius_increase_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."radius_increase_requests"
    ADD CONSTRAINT "radius_increase_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_reported_user_id_fkey" FOREIGN KEY ("reported_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."reservation_customers"
    ADD CONSTRAINT "reservation_customers_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."reservation_tables"
    ADD CONSTRAINT "reservation_tables_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."reservation_tables"
    ADD CONSTRAINT "reservation_tables_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."reservation_customers"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."room_access_attempts"
    ADD CONSTRAINT "room_access_attempts_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."room_access_attempts"
    ADD CONSTRAINT "room_access_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."room_geo_presence"
    ADD CONSTRAINT "room_geo_presence_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."room_geo_presence"
    ADD CONSTRAINT "room_geo_presence_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."room_members"
    ADD CONSTRAINT "room_members_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."room_members"
    ADD CONSTRAINT "room_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."room_mutes"
    ADD CONSTRAINT "room_mutes_muted_by_fkey" FOREIGN KEY ("muted_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."room_mutes"
    ADD CONSTRAINT "room_mutes_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."room_mutes"
    ADD CONSTRAINT "room_mutes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "rooms_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "rooms_parent_room_id_fkey" FOREIGN KEY ("parent_room_id") REFERENCES "public"."rooms"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."security_logs"
    ADD CONSTRAINT "security_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."service_calls"
    ADD CONSTRAINT "service_calls_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."service_calls"
    ADD CONSTRAINT "service_calls_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."service_calls"
    ADD CONSTRAINT "service_calls_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."service_calls"
    ADD CONSTRAINT "service_calls_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."stock_by_location"
    ADD CONSTRAINT "stock_by_location_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."stock_by_location"
    ADD CONSTRAINT "stock_by_location_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."inventory_locations"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."stock_by_location"
    ADD CONSTRAINT "stock_by_location_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."stories"
    ADD CONSTRAINT "stories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."story_views"
    ADD CONSTRAINT "story_views_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."story_views"
    ADD CONSTRAINT "story_views_viewer_id_fkey" FOREIGN KEY ("viewer_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."tab_payments"
    ADD CONSTRAINT "tab_payments_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."tab_payments"
    ADD CONSTRAINT "tab_payments_tab_id_fkey" FOREIGN KEY ("tab_id") REFERENCES "public"."table_tabs"("id") ON DELETE RESTRICT;


ALTER TABLE ONLY "public"."tab_payments"
    ADD CONSTRAINT "tab_payments_taken_by_fkey" FOREIGN KEY ("taken_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."table_reservation_log"
    ADD CONSTRAINT "table_reservation_log_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."table_reservation_log"
    ADD CONSTRAINT "table_reservation_log_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."table_reservation_log"
    ADD CONSTRAINT "table_reservation_log_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."table_tabs"
    ADD CONSTRAINT "table_tabs_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."table_tabs"
    ADD CONSTRAINT "table_tabs_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."table_tabs"
    ADD CONSTRAINT "table_tabs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."table_tabs"
    ADD CONSTRAINT "table_tabs_owner_uid_fkey" FOREIGN KEY ("owner_uid") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."table_tabs"
    ADD CONSTRAINT "table_tabs_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE RESTRICT;


ALTER TABLE ONLY "public"."table_waiters"
    ADD CONSTRAINT "table_waiters_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."table_waiters"
    ADD CONSTRAINT "table_waiters_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."table_waiters"
    ADD CONSTRAINT "table_waiters_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."tables"
    ADD CONSTRAINT "tables_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."tables"
    ADD CONSTRAINT "tables_combined_into_fkey" FOREIGN KEY ("combined_into") REFERENCES "public"."tables"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."tables"
    ADD CONSTRAINT "tables_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."tod_draws"
    ADD CONSTRAINT "tod_draws_round_fk" FOREIGN KEY ("round_id") REFERENCES "public"."tod_rounds"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."tod_draws"
    ADD CONSTRAINT "tod_draws_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."tod_kicks"
    ADD CONSTRAINT "tod_kicks_business_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."tod_kicks"
    ADD CONSTRAINT "tod_kicks_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."tod_moderation_log"
    ADD CONSTRAINT "tod_modlog_business_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."tod_rounds"
    ADD CONSTRAINT "tod_rounds_business_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."tod_rounds"
    ADD CONSTRAINT "tod_rounds_creator_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."tod_rounds"
    ADD CONSTRAINT "tod_rounds_room_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."tod_settings"
    ADD CONSTRAINT "tod_settings_business_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."tod_terms"
    ADD CONSTRAINT "tod_terms_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."tod_votes"
    ADD CONSTRAINT "tod_votes_draw_fk" FOREIGN KEY ("draw_id") REFERENCES "public"."tod_draws"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."tod_votes"
    ADD CONSTRAINT "tod_votes_voter_fk" FOREIGN KEY ("voter_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."trials"
    ADD CONSTRAINT "trials_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."user_interests"
    ADD CONSTRAINT "user_interests_interest_key_fkey" FOREIGN KEY ("interest_key") REFERENCES "public"."interests"("key") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."user_interests"
    ADD CONSTRAINT "user_interests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_active_business_id_fkey" FOREIGN KEY ("active_business_id") REFERENCES "public"."businesses"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_referred_by_affiliate_id_fkey" FOREIGN KEY ("referred_by_affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."venue_exits"
    ADD CONSTRAINT "venue_exits_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."venue_exits"
    ADD CONSTRAINT "venue_exits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


CREATE POLICY "admin read admin_roles" ON "public"."admin_roles" FOR SELECT TO "authenticated" USING (("public"."is_platform_admin"() OR ("user_id" = "auth"."uid"())));


CREATE POLICY "admin read all subscriptions" ON "public"."subscriptions" FOR SELECT TO "authenticated" USING ("public"."is_platform_admin"());


CREATE POLICY "admin read all verifications" ON "public"."business_verifications" FOR SELECT TO "authenticated" USING ("public"."is_platform_admin"());


CREATE POLICY "admin read announcements" ON "public"."announcements" FOR SELECT TO "authenticated" USING ("public"."is_platform_admin"());


CREATE POLICY "admin read reports" ON "public"."reports" FOR SELECT TO "authenticated" USING ("public"."is_platform_admin"());


CREATE POLICY "admin read security logs" ON "public"."security_logs" FOR SELECT TO "authenticated" USING ("public"."is_platform_admin"());


CREATE POLICY "admin update reports" ON "public"."reports" FOR UPDATE TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());


ALTER TABLE "public"."admin_roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."affiliate_commissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "affiliate_commissions admin all" ON "public"."affiliate_commissions" TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());


ALTER TABLE "public"."affiliate_payouts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "affiliate_payouts admin all" ON "public"."affiliate_payouts" TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());


ALTER TABLE "public"."affiliates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "affiliates admin all" ON "public"."affiliates" TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());


ALTER TABLE "public"."announcements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bans_owner_manage" ON "public"."bans" TO "authenticated" USING (((("room_id" IS NOT NULL) AND "public"."owns_room_business"("room_id")) OR (("business_id" IS NOT NULL) AND "public"."owns_business"("business_id")))) WITH CHECK ((("banned_by" = ( SELECT "auth"."uid"() AS "uid")) AND ((("room_id" IS NOT NULL) AND "public"."owns_room_business"("room_id")) OR (("business_id" IS NOT NULL) AND "public"."owns_business"("business_id")))));


CREATE POLICY "bans_read_self_or_owner" ON "public"."bans" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("room_id" IS NOT NULL) AND "public"."owns_room_business"("room_id")) OR (("business_id" IS NOT NULL) AND "public"."owns_business"("business_id"))));


CREATE POLICY "biz_verif_owner_read" ON "public"."business_verifications" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "business_verifications"."business_id") AND ("b"."owner_id" = "auth"."uid"())))));


ALTER TABLE "public"."blocks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "blocks_own" ON "public"."blocks" TO "authenticated" USING (("blocker_id" = "auth"."uid"())) WITH CHECK (("blocker_id" = "auth"."uid"()));


ALTER TABLE "public"."business_games" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "business_games_owner_write" ON "public"."business_games" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "business_games"."business_id") AND ("b"."owner_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "business_games"."business_id") AND ("b"."owner_id" = "auth"."uid"())))));


CREATE POLICY "business_games_read" ON "public"."business_games" FOR SELECT TO "authenticated" USING (true);


ALTER TABLE "public"."business_verifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."businesses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "businesses admin update" ON "public"."businesses" FOR UPDATE TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());


CREATE POLICY "businesses: owner delete" ON "public"."businesses" FOR DELETE USING (("auth"."uid"() = "owner_id"));


CREATE POLICY "businesses: owner insert" ON "public"."businesses" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "owner_id") AND ("status" = 'pending_verification'::"text") AND ("plan" = 'free'::"text")));


CREATE POLICY "businesses: owner update" ON "public"."businesses" FOR UPDATE USING (("auth"."uid"() = "owner_id"));


CREATE POLICY "businesses: public read" ON "public"."businesses" FOR SELECT USING (true);


CREATE POLICY "catalog readable by authenticated" ON "public"."product_catalog" FOR SELECT TO "authenticated" USING ("is_active");


ALTER TABLE "public"."check_ins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "check_ins: authenticated insert" ON "public"."check_ins" FOR INSERT TO "authenticated" WITH CHECK (false);


CREATE POLICY "check_ins: business owner read" ON "public"."check_ins" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "check_ins"."business_id") AND ("b"."owner_id" = "auth"."uid"())))));


CREATE POLICY "check_ins: user read own" ON "public"."check_ins" FOR SELECT USING (("auth"."uid"() = "user_id"));


ALTER TABLE "public"."comments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "comments: hide hidden" ON "public"."comments" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((("hidden_at" IS NULL) OR ("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_platform_admin"()));


CREATE POLICY "comments_read" ON "public"."comments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."posts" "p"
  WHERE (("p"."id" = "comments"."post_id") AND "public"."can_view_user_content"(( SELECT "auth"."uid"() AS "uid"), "p"."user_id", 'whoSeesMyPosts'::"text") AND (NOT "public"."is_blocked"(( SELECT "auth"."uid"() AS "uid"), "p"."user_id"))))));


CREATE POLICY "comments_write_own" ON "public"."comments" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));


ALTER TABLE "public"."custom_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "custom_roles: owner delete" ON "public"."custom_roles" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "custom_roles"."business_id") AND ("b"."owner_id" = "auth"."uid"())))));


CREATE POLICY "custom_roles: owner insert" ON "public"."custom_roles" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "custom_roles"."business_id") AND ("b"."owner_id" = "auth"."uid"())))));


CREATE POLICY "custom_roles: owner update" ON "public"."custom_roles" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "custom_roles"."business_id") AND ("b"."owner_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "custom_roles"."business_id") AND ("b"."owner_id" = "auth"."uid"())))));


CREATE POLICY "custom_roles: read" ON "public"."custom_roles" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "custom_roles"."business_id") AND ("b"."owner_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."business_id" = "custom_roles"."business_id") AND ("e"."user_id" = "auth"."uid"())))) OR "public"."is_platform_admin"()));


CREATE POLICY "deny_all" ON "public"."pending_order_carts" TO "authenticated", "anon" USING (false) WITH CHECK (false);


CREATE POLICY "deny_all" ON "public"."processed_stripe_events" TO "authenticated", "anon" USING (false) WITH CHECK (false);


ALTER TABLE "public"."disputes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "disputes: authenticated open" ON "public"."disputes" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "opened_by"));


CREATE POLICY "disputes: business owner update" ON "public"."disputes" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."orders" "o"
     JOIN "public"."businesses" "b" ON (("b"."id" = "o"."business_id")))
  WHERE (("o"."id" = "disputes"."order_id") AND ("b"."owner_id" = "auth"."uid"())))));


CREATE POLICY "disputes: parties read" ON "public"."disputes" FOR SELECT USING ((("auth"."uid"() = "opened_by") OR (EXISTS ( SELECT 1
   FROM ("public"."orders" "o"
     JOIN "public"."businesses" "b" ON (("b"."id" = "o"."business_id")))
  WHERE (("o"."id" = "disputes"."order_id") AND ("b"."owner_id" = "auth"."uid"()))))));


CREATE POLICY "dm_conv_read" ON "public"."dm_conversations" FOR SELECT TO "authenticated" USING (((("user_a" = ( SELECT "auth"."uid"() AS "uid")) OR ("user_b" = ( SELECT "auth"."uid"() AS "uid"))) AND (NOT "public"."is_blocked"(( SELECT "auth"."uid"() AS "uid"),
CASE
    WHEN ("user_a" = ( SELECT "auth"."uid"() AS "uid")) THEN "user_b"
    ELSE "user_a"
END))));


CREATE POLICY "dm_conv_update" ON "public"."dm_conversations" FOR UPDATE TO "authenticated" USING ((("user_a" = "auth"."uid"()) OR ("user_b" = "auth"."uid"()))) WITH CHECK ((("user_a" = "auth"."uid"()) OR ("user_b" = "auth"."uid"())));


ALTER TABLE "public"."dm_conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dm_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dm_messages: hide hidden" ON "public"."dm_messages" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((("hidden_at" IS NULL) OR ("sender_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_platform_admin"()));


CREATE POLICY "dm_msg_read" ON "public"."dm_messages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."dm_conversations" "c"
  WHERE (("c"."id" = "dm_messages"."conversation_id") AND (("c"."user_a" = ( SELECT "auth"."uid"() AS "uid")) OR ("c"."user_b" = ( SELECT "auth"."uid"() AS "uid"))) AND (NOT "public"."is_blocked"(( SELECT "auth"."uid"() AS "uid"),
        CASE
            WHEN ("c"."user_a" = ( SELECT "auth"."uid"() AS "uid")) THEN "c"."user_b"
            ELSE "c"."user_a"
        END))))));


CREATE POLICY "dm_msg_send" ON "public"."dm_messages" FOR INSERT TO "authenticated" WITH CHECK ((("sender_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."dm_conversations" "c"
  WHERE (("c"."id" = "dm_messages"."conversation_id") AND (("c"."user_a" = "auth"."uid"()) OR ("c"."user_b" = "auth"."uid"())) AND (NOT "public"."is_blocked"("auth"."uid"(),
        CASE
            WHEN ("c"."user_a" = "auth"."uid"()) THEN "c"."user_b"
            ELSE "c"."user_a"
        END)))))));


CREATE POLICY "dm_msg_update_read" ON "public"."dm_messages" FOR UPDATE TO "authenticated" USING ((("sender_id" <> "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."dm_conversations" "c"
  WHERE (("c"."id" = "dm_messages"."conversation_id") AND (("c"."user_a" = "auth"."uid"()) OR ("c"."user_b" = "auth"."uid"()))))))) WITH CHECK ((("sender_id" <> "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."dm_conversations" "c"
  WHERE (("c"."id" = "dm_messages"."conversation_id") AND (("c"."user_a" = "auth"."uid"()) OR ("c"."user_b" = "auth"."uid"())))))));


ALTER TABLE "public"."employees" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "employees: invited user update own status" ON "public"."employees" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


CREATE POLICY "employees: owner delete" ON "public"."employees" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "employees"."business_id") AND ("b"."owner_id" = "auth"."uid"())))));


CREATE POLICY "employees: owner insert" ON "public"."employees" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "employees"."business_id") AND ("b"."owner_id" = "auth"."uid"())))));


CREATE POLICY "employees: owner/manager read" ON "public"."employees" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "employees"."business_id") AND ("b"."owner_id" = "auth"."uid"()))))));


ALTER TABLE "public"."follow_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "follow_requests_create" ON "public"."follow_requests" FOR INSERT TO "authenticated" WITH CHECK ((("requester_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("requester_id" <> "target_id") AND (NOT "public"."is_blocked"(( SELECT "auth"."uid"() AS "uid"), "target_id"))));


CREATE POLICY "follow_requests_requester_delete" ON "public"."follow_requests" FOR DELETE TO "authenticated" USING (("requester_id" = "auth"."uid"()));


CREATE POLICY "follow_requests_target_update" ON "public"."follow_requests" FOR UPDATE TO "authenticated" USING (("target_id" = "auth"."uid"()));


CREATE POLICY "follow_requests_visible" ON "public"."follow_requests" FOR SELECT TO "authenticated" USING ((("requester_id" = "auth"."uid"()) OR ("target_id" = "auth"."uid"())));


ALTER TABLE "public"."follows" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "follows: authenticated insert own" ON "public"."follows" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "follower_id") AND ("follower_id" <> "following_id") AND (NOT "public"."is_private_account"("following_id")) AND (NOT "public"."is_blocked"(( SELECT "auth"."uid"() AS "uid"), "following_id"))));


CREATE POLICY "follows: delete own" ON "public"."follows" FOR DELETE USING (("auth"."uid"() = "follower_id"));


CREATE POLICY "follows_read" ON "public"."follows" FOR SELECT TO "authenticated" USING (("public"."can_view_profile"(( SELECT "auth"."uid"() AS "uid"), "follower_id") OR "public"."can_view_profile"(( SELECT "auth"."uid"() AS "uid"), "following_id")));


ALTER TABLE "public"."game_optins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "game_optins_own" ON "public"."game_optins" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));


ALTER TABLE "public"."games" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "games_read" ON "public"."games" FOR SELECT TO "authenticated" USING (true);


ALTER TABLE "public"."gift_offers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "gift_offers_participants_read" ON "public"."gift_offers" FOR SELECT TO "authenticated" USING ((("from_user_id" = "auth"."uid"()) OR ("to_user_id" = "auth"."uid"())));


ALTER TABLE "public"."gifts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "gifts: authenticated insert" ON "public"."gifts" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "from_user"));


CREATE POLICY "gifts: sender or recipient read" ON "public"."gifts" FOR SELECT USING ((("auth"."uid"() = "from_user") OR ("auth"."uid"() = "to_user")));


ALTER TABLE "public"."guest_code_attempts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."guest_device_blocks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "guest_device_blocks_staff_read" ON "public"."guest_device_blocks" FOR SELECT TO "authenticated" USING (("public"."is_employee_of_business"("business_id") OR (EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "guest_device_blocks"."business_id") AND ("b"."owner_id" = "auth"."uid"())))) OR "public"."is_platform_admin"()));


ALTER TABLE "public"."guest_device_strikes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."guest_order_idempotency" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."guest_service_attempts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."guest_tab_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."interests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "interests_read" ON "public"."interests" FOR SELECT TO "authenticated" USING (true);


CREATE POLICY "inv_locations owner all" ON "public"."inventory_locations" USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "inventory_locations"."business_id") AND ("b"."owner_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "inventory_locations"."business_id") AND ("b"."owner_id" = "auth"."uid"())))));


ALTER TABLE "public"."inventory_locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."loyalty_points" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "loyalty_points: business owner read" ON "public"."loyalty_points" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "loyalty_points"."business_id") AND ("b"."owner_id" = "auth"."uid"())))));


CREATE POLICY "loyalty_points: service role upsert" ON "public"."loyalty_points" TO "service_role" USING (true);


CREATE POLICY "loyalty_points: user read own" ON "public"."loyalty_points" FOR SELECT USING (("auth"."uid"() = "user_id"));


ALTER TABLE "public"."loyalty_rewards" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "loyalty_rewards_owner" ON "public"."loyalty_rewards" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "loyalty_rewards"."business_id") AND ("b"."owner_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "loyalty_rewards"."business_id") AND ("b"."owner_id" = "auth"."uid"())))));


CREATE POLICY "loyalty_rewards_read" ON "public"."loyalty_rewards" FOR SELECT TO "authenticated" USING (true);


ALTER TABLE "public"."loyalty_rules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "loyalty_rules_owner" ON "public"."loyalty_rules" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "loyalty_rules"."business_id") AND ("b"."owner_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "loyalty_rules"."business_id") AND ("b"."owner_id" = "auth"."uid"())))));


CREATE POLICY "loyalty_rules_read" ON "public"."loyalty_rules" FOR SELECT TO "authenticated" USING (true);


ALTER TABLE "public"."loyalty_tiers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "loyalty_tiers_owner" ON "public"."loyalty_tiers" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "loyalty_tiers"."business_id") AND ("b"."owner_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "loyalty_tiers"."business_id") AND ("b"."owner_id" = "auth"."uid"())))));


CREATE POLICY "loyalty_tiers_read" ON "public"."loyalty_tiers" FOR SELECT TO "authenticated" USING (true);


ALTER TABLE "public"."map_reactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "map_reactions_insert_own" ON "public"."map_reactions" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));


CREATE POLICY "map_reactions_read" ON "public"."map_reactions" FOR SELECT TO "authenticated" USING (true);


ALTER TABLE "public"."match_kicks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "match_kicks_owner" ON "public"."match_kicks" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "match_kicks"."business_id") AND ("b"."owner_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "match_kicks"."business_id") AND ("b"."owner_id" = "auth"."uid"())))));


ALTER TABLE "public"."match_photos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "match_photos_own_delete" ON "public"."match_photos" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));


CREATE POLICY "match_photos_own_insert" ON "public"."match_photos" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND ("status" = 'pending'::"text") AND ("path" ~~ (("auth"."uid"())::"text" || '/%'::"text"))));


CREATE POLICY "match_photos_own_select" ON "public"."match_photos" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));


CREATE POLICY "match_photos_own_update" ON "public"."match_photos" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));


CREATE POLICY "match_photos_visible" ON "public"."match_photos" FOR SELECT TO "authenticated" USING ((("status" = 'approved'::"text") AND ("public"."match_common_business"("auth"."uid"(), "user_id") IS NOT NULL)));


ALTER TABLE "public"."match_presence" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "match_presence_own" ON "public"."match_presence" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));


ALTER TABLE "public"."match_relikes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."match_super_quota" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "match_super_quota_own" ON "public"."match_super_quota" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));


ALTER TABLE "public"."match_swipes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "match_swipes_own" ON "public"."match_swipes" FOR SELECT TO "authenticated" USING (("swiper_id" = "auth"."uid"()));


ALTER TABLE "public"."matches" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "matches_participant" ON "public"."matches" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "user_a") OR ("auth"."uid"() = "user_b")));


ALTER TABLE "public"."menu_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "menu_categories: business owner manage" ON "public"."menu_categories" USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "menu_categories"."business_id") AND ("b"."owner_id" = "auth"."uid"())))));


CREATE POLICY "menu_categories: public read" ON "public"."menu_categories" FOR SELECT USING (true);


ALTER TABLE "public"."menu_item_costs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "menu_item_costs owner all" ON "public"."menu_item_costs" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "menu_item_costs"."business_id") AND ("b"."owner_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "menu_item_costs"."business_id") AND ("b"."owner_id" = "auth"."uid"())))));


ALTER TABLE "public"."menu_item_modifier_groups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."menu_item_photos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "menu_item_photos: business owner manage" ON "public"."menu_item_photos" USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "menu_item_photos"."business_id") AND ("b"."owner_id" = "auth"."uid"())))));


CREATE POLICY "menu_item_photos: public read" ON "public"."menu_item_photos" FOR SELECT USING (true);


ALTER TABLE "public"."menu_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "menu_items: business owner manage" ON "public"."menu_items" USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "menu_items"."business_id") AND ("b"."owner_id" = "auth"."uid"())))));


CREATE POLICY "menu_items: public read" ON "public"."menu_items" FOR SELECT USING (true);


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "messages: authenticated insert" ON "public"."messages" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "public"."can_access_room"("room_id") AND (NOT "public"."is_muted_in_room"("room_id", ( SELECT "auth"."uid"() AS "uid")))));


CREATE POLICY "messages: authenticated read" ON "public"."messages" FOR SELECT TO "authenticated" USING ("public"."can_access_room"("room_id"));


CREATE POLICY "messages: author or business owner delete" ON "public"."messages" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM ("public"."rooms" "r"
     JOIN "public"."businesses" "b" ON (("b"."id" = "r"."business_id")))
  WHERE (("r"."id" = "messages"."room_id") AND ("b"."owner_id" = "auth"."uid"()))))));


CREATE POLICY "messages: hide blocked" ON "public"."messages" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((("user_id" IS NULL) OR ("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (NOT "public"."is_blocked"(( SELECT "auth"."uid"() AS "uid"), "user_id"))));


CREATE POLICY "messages: hide hidden" ON "public"."messages" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((("hidden_at" IS NULL) OR ("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_platform_admin"()));


CREATE POLICY "mimg owner all" ON "public"."menu_item_modifier_groups" USING ((EXISTS ( SELECT 1
   FROM ("public"."menu_items" "mi"
     JOIN "public"."businesses" "b" ON (("b"."id" = "mi"."business_id")))
  WHERE (("mi"."id" = "menu_item_modifier_groups"."menu_item_id") AND ("b"."owner_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."menu_items" "mi"
     JOIN "public"."businesses" "b" ON (("b"."id" = "mi"."business_id")))
  WHERE (("mi"."id" = "menu_item_modifier_groups"."menu_item_id") AND ("b"."owner_id" = "auth"."uid"())))));


CREATE POLICY "mimg public read" ON "public"."menu_item_modifier_groups" FOR SELECT USING (true);


CREATE POLICY "mod_logs_business_staff_read" ON "public"."moderation_logs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "moderation_logs"."business_id") AND ("b"."owner_id" = "auth"."uid"())))));


CREATE POLICY "mod_logs_insert" ON "public"."moderation_logs" FOR INSERT TO "authenticated" WITH CHECK ((("actor_id" = ( SELECT "auth"."uid"() AS "uid")) AND ((("business_id" IS NOT NULL) AND "public"."owns_business"("business_id")) OR (("room_id" IS NOT NULL) AND "public"."owns_room_business"("room_id")))));


ALTER TABLE "public"."moderation_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."modifier_groups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "modifier_groups owner all" ON "public"."modifier_groups" USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "modifier_groups"."business_id") AND ("b"."owner_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "modifier_groups"."business_id") AND ("b"."owner_id" = "auth"."uid"())))));


CREATE POLICY "modifier_groups public read" ON "public"."modifier_groups" FOR SELECT USING (true);


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications admin insert" ON "public"."notifications" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_platform_admin"());


CREATE POLICY "notifications: service role insert" ON "public"."notifications" FOR INSERT TO "service_role" WITH CHECK (true);


CREATE POLICY "notifications: user delete own" ON "public"."notifications" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));


CREATE POLICY "notifications: user read own" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "user_id"));


CREATE POLICY "notifications: user update own" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "user_id"));


ALTER TABLE "public"."offers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "offers: authenticated read" ON "public"."offers" FOR SELECT TO "authenticated" USING (true);


CREATE POLICY "offers: business owner manage" ON "public"."offers" USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "offers"."business_id") AND ("b"."owner_id" = "auth"."uid"())))));


ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "order_items: employee of business read" ON "public"."order_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND "public"."is_employee_of_business"("o"."business_id")))));


CREATE POLICY "order_items: employee read via visible order" ON "public"."order_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND ((("o"."table_id" IS NOT NULL) AND "public"."can_employee_see_table"("o"."table_id")) OR (("o"."tab_id" IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM "public"."table_tabs" "tt"
          WHERE (("tt"."id" = "o"."tab_id") AND "public"."can_employee_see_table"("tt"."table_id"))))))))));


CREATE POLICY "order_items: read via order" ON "public"."order_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND (("o"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."businesses" "b"
          WHERE (("b"."id" = "o"."business_id") AND ("b"."owner_id" = "auth"."uid"())))))))));


ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "orders: business owner read" ON "public"."orders" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "orders"."business_id") AND ("b"."owner_id" = "auth"."uid"())))));


CREATE POLICY "orders: business owner update" ON "public"."orders" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "orders"."business_id") AND ("b"."owner_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "orders"."business_id") AND ("b"."owner_id" = "auth"."uid"())))));


CREATE POLICY "orders: customer read own" ON "public"."orders" FOR SELECT USING (("auth"."uid"() = "user_id"));


CREATE POLICY "orders: employee of business read" ON "public"."orders" FOR SELECT USING ("public"."is_employee_of_business"("business_id"));


CREATE POLICY "orders: employee read for visible tables" ON "public"."orders" FOR SELECT TO "authenticated" USING (((("table_id" IS NOT NULL) AND "public"."can_employee_see_table"("table_id")) OR (("tab_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."table_tabs" "tt"
  WHERE (("tt"."id" = "orders"."tab_id") AND "public"."can_employee_see_table"("tt"."table_id")))))));


ALTER TABLE "public"."orphan_payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "orphan_payments: owner/admin read" ON "public"."orphan_payments" FOR SELECT TO "authenticated" USING (("public"."is_platform_admin"() OR (("business_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "orphan_payments"."business_id") AND ("b"."owner_id" = "auth"."uid"())))))));


ALTER TABLE "public"."pending_order_carts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pinned_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pinned_messages: authenticated read" ON "public"."pinned_messages" FOR SELECT TO "authenticated" USING (true);


CREATE POLICY "pinned_messages: business owner manage" ON "public"."pinned_messages" USING ((EXISTS ( SELECT 1
   FROM ("public"."rooms" "r"
     JOIN "public"."businesses" "b" ON (("b"."id" = "r"."business_id")))
  WHERE (("r"."id" = "pinned_messages"."room_id") AND ("b"."owner_id" = "auth"."uid"())))));


ALTER TABLE "public"."platform_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "platform_config: admin can update" ON "public"."platform_config" FOR UPDATE TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());


CREATE POLICY "platform_config: authenticated can read" ON "public"."platform_config" FOR SELECT TO "authenticated" USING (true);


CREATE POLICY "po_settings owner all" ON "public"."purchase_order_settings" USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "purchase_order_settings"."business_id") AND ("b"."owner_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "purchase_order_settings"."business_id") AND ("b"."owner_id" = "auth"."uid"())))));


ALTER TABLE "public"."pos_payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pos_pins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pos_printers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_printers_owner_all" ON "public"."pos_printers" USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "pos_printers"."business_id") AND ("b"."owner_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "pos_printers"."business_id") AND ("b"."owner_id" = "auth"."uid"())))));


CREATE POLICY "pos_printers_select_employee" ON "public"."pos_printers" FOR SELECT USING ("public"."is_employee_of_business"("business_id"));


ALTER TABLE "public"."post_likes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "post_likes_read" ON "public"."post_likes" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."posts" "p"
  WHERE (("p"."id" = "post_likes"."post_id") AND "public"."can_view_user_content"(( SELECT "auth"."uid"() AS "uid"), "p"."user_id", 'whoSeesMyPosts'::"text") AND (NOT "public"."is_blocked"(( SELECT "auth"."uid"() AS "uid"), "p"."user_id"))))));


CREATE POLICY "post_likes_write_own" ON "public"."post_likes" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));


ALTER TABLE "public"."posts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "posts: hide hidden" ON "public"."posts" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((("hidden_at" IS NULL) OR ("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_platform_admin"()));


CREATE POLICY "posts_delete_own" ON "public"."posts" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));


CREATE POLICY "posts_insert_own" ON "public"."posts" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("business_id" IS NULL) OR "public"."can_publish_business_post"("business_id"))));


CREATE POLICY "posts_read" ON "public"."posts" FOR SELECT TO "authenticated" USING (("public"."can_view_user_content"(( SELECT "auth"."uid"() AS "uid"), "user_id", 'whoSeesMyPosts'::"text") AND (NOT "public"."is_blocked"(( SELECT "auth"."uid"() AS "uid"), "user_id")) AND (("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (NOT "public"."is_private_account"("user_id")) OR (EXISTS ( SELECT 1
   FROM "public"."follows" "f"
  WHERE (("f"."follower_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("f"."following_id" = "posts"."user_id")))))));


CREATE POLICY "posts_read_business" ON "public"."posts" FOR SELECT TO "authenticated" USING ((("business_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "posts"."business_id") AND ("b"."status" = 'verified'::"text")))) AND (NOT "public"."is_blocked"(( SELECT "auth"."uid"() AS "uid"), "user_id"))));


CREATE POLICY "posts_update_own" ON "public"."posts" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("business_id" IS NULL) OR "public"."can_publish_business_post"("business_id"))));


ALTER TABLE "public"."processed_stripe_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_catalog" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."promo_codes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "promo_codes_admin_all" ON "public"."promo_codes" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());


ALTER TABLE "public"."public_locations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "public_locations_admin_write" ON "public"."public_locations" TO "authenticated" USING (("created_by" = "auth"."uid"())) WITH CHECK (("created_by" = "auth"."uid"()));


CREATE POLICY "public_locations_read" ON "public"."public_locations" FOR SELECT TO "authenticated" USING (true);


ALTER TABLE "public"."purchase_order_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."radius_increase_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reports_create" ON "public"."reports" FOR INSERT TO "authenticated" WITH CHECK (("reporter_id" = "auth"."uid"()));


CREATE POLICY "reports_read_own" ON "public"."reports" FOR SELECT TO "authenticated" USING (("reporter_id" = "auth"."uid"()));


CREATE POLICY "reports_read_owner" ON "public"."reports" FOR SELECT TO "authenticated" USING ((("business_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "reports"."business_id") AND ("b"."owner_id" = "auth"."uid"()))))));


CREATE POLICY "res_customers: business owner read" ON "public"."reservation_customers" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "reservation_customers"."business_id") AND ("b"."owner_id" = "auth"."uid"())))) OR "public"."is_platform_admin"()));


ALTER TABLE "public"."reservation_customers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reservation_log: business owner read" ON "public"."table_reservation_log" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "table_reservation_log"."business_id") AND ("b"."owner_id" = "auth"."uid"())))));


ALTER TABLE "public"."reservation_tables" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reservation_tables: business owner read" ON "public"."reservation_tables" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM ("public"."reservations" "r"
     JOIN "public"."businesses" "b" ON (("b"."id" = "r"."business_id")))
  WHERE (("r"."id" = "reservation_tables"."reservation_id") AND ("b"."owner_id" = "auth"."uid"())))) OR "public"."is_platform_admin"()));


ALTER TABLE "public"."reservations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reservations_customer_insert" ON "public"."reservations" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND ("status" = 'pending'::"text")));


CREATE POLICY "reservations_customer_select" ON "public"."reservations" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));


CREATE POLICY "reservations_customer_update" ON "public"."reservations" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));


CREATE POLICY "reservations_owner_all" ON "public"."reservations" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "reservations"."business_id") AND ("b"."owner_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "reservations"."business_id") AND ("b"."owner_id" = "auth"."uid"())))));


ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reviews: authenticated insert own" ON "public"."reviews" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));


CREATE POLICY "reviews: author delete" ON "public"."reviews" FOR DELETE USING (("auth"."uid"() = "user_id"));


CREATE POLICY "reviews: author update" ON "public"."reviews" FOR UPDATE USING (("auth"."uid"() = "user_id"));


CREATE POLICY "reviews: business owner respond" ON "public"."reviews" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "reviews"."business_id") AND ("b"."owner_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "reviews"."business_id") AND ("b"."owner_id" = "auth"."uid"())))));


CREATE POLICY "reviews: public read" ON "public"."reviews" FOR SELECT USING (true);


CREATE POLICY "rir admin update" ON "public"."radius_increase_requests" FOR UPDATE TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());


CREATE POLICY "rir owner insert" ON "public"."radius_increase_requests" FOR INSERT TO "authenticated" WITH CHECK ((("requested_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "radius_increase_requests"."business_id") AND ("b"."owner_id" = "auth"."uid"()))))));


CREATE POLICY "rir owner read" ON "public"."radius_increase_requests" FOR SELECT TO "authenticated" USING ((("requested_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "radius_increase_requests"."business_id") AND ("b"."owner_id" = "auth"."uid"())))) OR "public"."is_platform_admin"()));


ALTER TABLE "public"."room_access_attempts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "room_access_attempts: select own" ON "public"."room_access_attempts" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));


ALTER TABLE "public"."room_geo_presence" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "room_geo_presence: select own" ON "public"."room_geo_presence" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));


ALTER TABLE "public"."room_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "room_members: select own" ON "public"."room_members" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));


ALTER TABLE "public"."room_mutes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "room_mutes_owner_manage" ON "public"."room_mutes" TO "authenticated" USING ("public"."owns_room_business"("room_id")) WITH CHECK ((("muted_by" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."owns_room_business"("room_id")));


CREATE POLICY "room_mutes_read_self_or_owner" ON "public"."room_mutes" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."owns_room_business"("room_id")));


ALTER TABLE "public"."rooms" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rooms: authenticated read" ON "public"."rooms" FOR SELECT TO "authenticated" USING (("is_active" = true));


CREATE POLICY "rooms: business owner manage" ON "public"."rooms" USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "rooms"."business_id") AND ("b"."owner_id" = "auth"."uid"())))));


CREATE POLICY "sbl owner all" ON "public"."stock_by_location" USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "stock_by_location"."business_id") AND ("b"."owner_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "stock_by_location"."business_id") AND ("b"."owner_id" = "auth"."uid"())))));


ALTER TABLE "public"."security_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."service_calls" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_calls: authenticated insert" ON "public"."service_calls" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));


CREATE POLICY "service_calls: business owner read" ON "public"."service_calls" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "service_calls"."business_id") AND ("b"."owner_id" = "auth"."uid"())))));


CREATE POLICY "service_calls: business owner update" ON "public"."service_calls" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "service_calls"."business_id") AND ("b"."owner_id" = "auth"."uid"())))));


ALTER TABLE "public"."stock_by_location" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stock_movements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stock_movements_owner" ON "public"."stock_movements" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "stock_movements"."business_id") AND ("b"."owner_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "stock_movements"."business_id") AND ("b"."owner_id" = "auth"."uid"())))));


ALTER TABLE "public"."stories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stories_read" ON "public"."stories" FOR SELECT TO "authenticated" USING (true);


CREATE POLICY "stories_write_own" ON "public"."stories" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));


ALTER TABLE "public"."story_views" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "story_views_insert_own" ON "public"."story_views" FOR INSERT TO "authenticated" WITH CHECK (("viewer_id" = "auth"."uid"()));


CREATE POLICY "story_views_read_own_story" ON "public"."story_views" FOR SELECT TO "authenticated" USING (true);


ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "subscriptions_owner_read" ON "public"."subscriptions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "subscriptions"."business_id") AND ("b"."owner_id" = "auth"."uid"())))));


ALTER TABLE "public"."suppliers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "suppliers owner all" ON "public"."suppliers" USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "suppliers"."business_id") AND ("b"."owner_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "suppliers"."business_id") AND ("b"."owner_id" = "auth"."uid"())))));


ALTER TABLE "public"."tab_payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tab_payments: owner/admin/waiter read" ON "public"."tab_payments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."table_tabs" "tt"
  WHERE (("tt"."id" = "tab_payments"."tab_id") AND ("public"."owns_business_of_table"("tt"."table_id") OR "public"."can_employee_see_table"("tt"."table_id") OR "public"."is_platform_admin"())))));


ALTER TABLE "public"."table_reservation_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."table_tabs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "table_tabs: owner/admin delete" ON "public"."table_tabs" FOR DELETE TO "authenticated" USING (("public"."owns_business_of_table"("table_id") OR "public"."is_platform_admin"()));


CREATE POLICY "table_tabs: participants read" ON "public"."table_tabs" FOR SELECT TO "authenticated" USING (("public"."owns_business_of_table"("table_id") OR "public"."is_waiter_of_table"("table_id") OR "public"."user_has_tab_at_table"("table_id") OR "public"."is_platform_admin"()));


CREATE POLICY "table_tabs: waiter insert only" ON "public"."table_tabs" FOR INSERT TO "authenticated" WITH CHECK ((("kind" = 'waiter'::"text") AND ("created_by" = "auth"."uid"()) AND "public"."is_waiter_of_table"("table_id")));


CREATE POLICY "table_tabs: waiter/owner manage" ON "public"."table_tabs" FOR UPDATE TO "authenticated" USING (("public"."is_waiter_of_table"("table_id") OR "public"."owns_business_of_table"("table_id") OR "public"."is_platform_admin"())) WITH CHECK (("public"."is_waiter_of_table"("table_id") OR "public"."owns_business_of_table"("table_id") OR "public"."is_platform_admin"()));


ALTER TABLE "public"."table_waiters" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "table_waiters: owner/admin delete" ON "public"."table_waiters" FOR DELETE TO "authenticated" USING (("public"."owns_business_of_table"("table_id") OR "public"."is_platform_admin"()));


CREATE POLICY "table_waiters: owner/admin insert" ON "public"."table_waiters" FOR INSERT TO "authenticated" WITH CHECK (("public"."owns_business_of_table"("table_id") OR "public"."is_platform_admin"()));


CREATE POLICY "table_waiters: owner/admin update" ON "public"."table_waiters" FOR UPDATE TO "authenticated" USING (("public"."owns_business_of_table"("table_id") OR "public"."is_platform_admin"())) WITH CHECK (("public"."owns_business_of_table"("table_id") OR "public"."is_platform_admin"()));


CREATE POLICY "table_waiters: owner/admin/self read" ON "public"."table_waiters" FOR SELECT TO "authenticated" USING (("public"."owns_business_of_table"("table_id") OR "public"."is_platform_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."id" = "table_waiters"."employee_id") AND ("e"."user_id" = "auth"."uid"()))))));


ALTER TABLE "public"."tables" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tables: admin read" ON "public"."tables" FOR SELECT TO "authenticated" USING ("public"."is_platform_admin"());


CREATE POLICY "tables: business owner manage" ON "public"."tables" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "tables"."business_id") AND ("b"."owner_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "tables"."business_id") AND ("b"."owner_id" = "auth"."uid"())))));


CREATE POLICY "tables: employee read own/unassigned" ON "public"."tables" FOR SELECT TO "authenticated" USING ("public"."can_employee_see_table"("id"));


ALTER TABLE "public"."tod_cards" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tod_cards_read" ON "public"."tod_cards" FOR SELECT TO "authenticated" USING ("active");


ALTER TABLE "public"."tod_draws" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tod_draws_own" ON "public"."tod_draws" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));


CREATE POLICY "tod_draws_staff_published" ON "public"."tod_draws" FOR SELECT TO "authenticated" USING ((("status" = 'published'::"text") AND "public"."is_venue_staff"("business_id", ( SELECT "auth"."uid"() AS "uid"))));


ALTER TABLE "public"."tod_kicks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tod_kicks_read" ON "public"."tod_kicks" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_venue_staff"("business_id", ( SELECT "auth"."uid"() AS "uid"))));


ALTER TABLE "public"."tod_moderation_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tod_modlog_staff" ON "public"."tod_moderation_log" FOR SELECT TO "authenticated" USING ("public"."is_venue_staff"("business_id", ( SELECT "auth"."uid"() AS "uid")));


ALTER TABLE "public"."tod_rounds" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tod_rounds_read" ON "public"."tod_rounds" FOR SELECT TO "authenticated" USING ((("public"."can_access_room"("room_id") AND (NOT "public"."is_blocked"(( SELECT "auth"."uid"() AS "uid"), "creator_id"))) OR "public"."is_venue_staff"("business_id", ( SELECT "auth"."uid"() AS "uid"))));


ALTER TABLE "public"."tod_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tod_settings_owner_write" ON "public"."tod_settings" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "tod_settings"."business_id") AND ("b"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "tod_settings"."business_id") AND ("b"."owner_id" = ( SELECT "auth"."uid"() AS "uid"))))) AND ("categories" <@ ARRAY['classic'::"text", 'party'::"text", 'laughs'::"text", 'confessions'::"text", 'talent'::"text"])));


CREATE POLICY "tod_settings_read" ON "public"."tod_settings" FOR SELECT TO "authenticated" USING (true);


ALTER TABLE "public"."tod_terms" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tod_terms_own" ON "public"."tod_terms" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));


ALTER TABLE "public"."tod_votes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tod_votes_own" ON "public"."tod_votes" FOR SELECT TO "authenticated" USING (("voter_id" = ( SELECT "auth"."uid"() AS "uid")));


ALTER TABLE "public"."trials" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trials: owner insert" ON "public"."trials" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "trials"."business_id") AND ("b"."owner_id" = "auth"."uid"())))));


CREATE POLICY "trials: owner read" ON "public"."trials" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "trials"."business_id") AND ("b"."owner_id" = "auth"."uid"())))));


ALTER TABLE "public"."us_sales_tax_rates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "us_sales_tax_rates_read" ON "public"."us_sales_tax_rates" FOR SELECT TO "authenticated", "anon" USING (true);


ALTER TABLE "public"."user_interests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_interests_own_write" ON "public"."user_interests" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));


CREATE POLICY "user_interests_read" ON "public"."user_interests" FOR SELECT TO "authenticated" USING (true);


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users: insert own" ON "public"."users" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));


CREATE POLICY "users: select own" ON "public"."users" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));


CREATE POLICY "users: select platform admin" ON "public"."users" FOR SELECT TO "authenticated" USING ("public"."is_platform_admin"());


CREATE POLICY "users: update own" ON "public"."users" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));


ALTER TABLE "public"."venue_exits" ENABLE ROW LEVEL SECURITY;


ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."comments";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."dm_messages";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."gift_offers";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."map_reactions";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."messages";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."notifications";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."order_items";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."orders";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."pinned_messages";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."post_likes";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."posts";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."reservations";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."service_calls";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."stories";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."tables";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


REVOKE ALL ON FUNCTION "public"."accept_follow_request"("p_requester" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_follow_request"("p_requester" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_follow_request"("p_requester" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."admin_hide_content"("p_content_type" "text", "p_content_id" "uuid", "p_report_id" "uuid", "p_unhide" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_hide_content"("p_content_type" "text", "p_content_id" "uuid", "p_report_id" "uuid", "p_unhide" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_hide_content"("p_content_type" "text", "p_content_id" "uuid", "p_report_id" "uuid", "p_unhide" boolean) TO "service_role";


REVOKE ALL ON FUNCTION "public"."admin_list_match_photos_for_review"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_list_match_photos_for_review"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_list_match_photos_for_review"("p_limit" integer) TO "service_role";


REVOKE ALL ON FUNCTION "public"."admin_report_content_exists"("p_content_type" "text", "p_content_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_report_content_exists"("p_content_type" "text", "p_content_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_report_content_exists"("p_content_type" "text", "p_content_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."admin_resolve_report"("p_report_id" "uuid", "p_resolution" "text", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_resolve_report"("p_report_id" "uuid", "p_resolution" "text", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_resolve_report"("p_report_id" "uuid", "p_resolution" "text", "p_note" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."admin_review_match_photo"("p_photo_id" "uuid", "p_approve" boolean, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_review_match_photo"("p_photo_id" "uuid", "p_approve" boolean, "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_review_match_photo"("p_photo_id" "uuid", "p_approve" boolean, "p_reason" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."admin_set_business_status"("p_business_id" "uuid", "p_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_set_business_status"("p_business_id" "uuid", "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_set_business_status"("p_business_id" "uuid", "p_status" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."admin_suspend_user"("p_user_id" "uuid", "p_days" integer, "p_reason" "text", "p_report_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_suspend_user"("p_user_id" "uuid", "p_days" integer, "p_reason" "text", "p_report_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_suspend_user"("p_user_id" "uuid", "p_days" integer, "p_reason" "text", "p_report_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."admin_unsuspend_user"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_unsuspend_user"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_unsuspend_user"("p_user_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."affiliate_summary"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."affiliate_summary"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."affiliate_summary"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."affiliate_yearly_payouts"("p_year" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."affiliate_yearly_payouts"("p_year" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."affiliate_yearly_payouts"("p_year" integer) TO "service_role";


REVOKE ALL ON FUNCTION "public"."assert_venue_order_allowed"("p_business_id" "uuid", "p_user_id" "uuid", "p_order_type" "text", "p_lat" double precision, "p_lng" double precision, "p_source" "text", "p_taken_by" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assert_venue_order_allowed"("p_business_id" "uuid", "p_user_id" "uuid", "p_order_type" "text", "p_lat" double precision, "p_lng" double precision, "p_source" "text", "p_taken_by" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."assign_affiliate_to_user"("p_user_id" "uuid", "p_affiliate_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assign_affiliate_to_user"("p_user_id" "uuid", "p_affiliate_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_affiliate_to_user"("p_user_id" "uuid", "p_affiliate_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."attach_order_to_tab"("p_order_id" "uuid", "p_tab_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."attach_order_to_tab"("p_order_id" "uuid", "p_tab_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."attach_order_to_tab"("p_order_id" "uuid", "p_tab_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."auto_uncombine_on_tab_close"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."auto_uncombine_on_tab_close"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."block_user"("p_target" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."block_user"("p_target" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."block_user"("p_target" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."can_access_room"("_room_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_access_room"("_room_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_room"("_room_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."can_employee_see_table"("p_table_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_employee_see_table"("p_table_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_employee_see_table"("p_table_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."can_publish_business_post"("p_business_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_publish_business_post"("p_business_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_publish_business_post"("p_business_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."can_view_profile"("viewer" "uuid", "target" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_view_profile"("viewer" "uuid", "target" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_profile"("viewer" "uuid", "target" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."can_view_user_content"("viewer" "uuid", "owner" "uuid", "dimension" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_view_user_content"("viewer" "uuid", "owner" "uuid", "dimension" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_user_content"("viewer" "uuid", "owner" "uuid", "dimension" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."catalog_lookup"("p_barcode" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."catalog_lookup"("p_barcode" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."catalog_lookup"("p_barcode" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."check_geofence_and_join_room"("_room_id" "uuid", "_lat" double precision, "_lng" double precision) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_geofence_and_join_room"("_room_id" "uuid", "_lat" double precision, "_lng" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_geofence_and_join_room"("_room_id" "uuid", "_lat" double precision, "_lng" double precision) TO "service_role";


REVOKE ALL ON FUNCTION "public"."check_in"("p_business_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_in"("p_business_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_in"("p_business_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."claim_embedded_order"("p_order_id" "uuid", "p_tracking_code" "text", "p_room_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_embedded_order"("p_order_id" "uuid", "p_tracking_code" "text", "p_room_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_embedded_order"("p_order_id" "uuid", "p_tracking_code" "text", "p_room_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."cleanup_anonymous_users"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_anonymous_users"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."confirm_age"("p_birth_date" "date", "p_terms_version" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirm_age"("p_birth_date" "date", "p_terms_version" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_age"("p_birth_date" "date", "p_terms_version" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."create_paid_order"("p_order" "jsonb", "p_items" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_paid_order"("p_order" "jsonb", "p_items" "jsonb") TO "service_role";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."promo_codes" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."promo_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."promo_codes" TO "service_role";


GRANT UPDATE("active") ON TABLE "public"."promo_codes" TO "authenticated";


REVOKE ALL ON FUNCTION "public"."create_promo_code"("p_plan" "text", "p_trial_days" integer, "p_expires_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_promo_code"("p_plan" "text", "p_trial_days" integer, "p_expires_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_promo_code"("p_plan" "text", "p_trial_days" integer, "p_expires_at" timestamp with time zone) TO "service_role";


REVOKE ALL ON FUNCTION "public"."create_reservation"("p_business_id" "uuid", "p_reserved_at" timestamp with time zone, "p_party_size" integer, "p_table_ids" "uuid"[], "p_event_type" "text", "p_phone" "text", "p_first_name" "text", "p_last_name" "text", "p_special_requests" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_reservation"("p_business_id" "uuid", "p_reserved_at" timestamp with time zone, "p_party_size" integer, "p_table_ids" "uuid"[], "p_event_type" "text", "p_phone" "text", "p_first_name" "text", "p_last_name" "text", "p_special_requests" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_reservation"("p_business_id" "uuid", "p_reserved_at" timestamp with time zone, "p_party_size" integer, "p_table_ids" "uuid"[], "p_event_type" "text", "p_phone" "text", "p_first_name" "text", "p_last_name" "text", "p_special_requests" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."derive_username"("_email" "text", "_meta" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."derive_username"("_email" "text", "_meta" "jsonb") TO "service_role";


REVOKE ALL ON FUNCTION "public"."dm_first_message_guard"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dm_first_message_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."dm_first_message_guard"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."dm_media_is_blocked"("p_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dm_media_is_blocked"("p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dm_media_is_blocked"("p_name" "text") TO "service_role";


GRANT ALL ON FUNCTION "public"."dm_messages_media_guard"() TO "anon";
GRANT ALL ON FUNCTION "public"."dm_messages_media_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."dm_messages_media_guard"() TO "service_role";


GRANT ALL ON FUNCTION "public"."dm_messages_media_init"() TO "anon";
GRANT ALL ON FUNCTION "public"."dm_messages_media_init"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."dm_messages_media_init"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."dm_photo_dispatch_moderation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dm_photo_dispatch_moderation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."dm_photo_dispatch_moderation"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."dm_photo_retry_moderation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dm_photo_retry_moderation"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."dm_photo_set_verdict"("p_message_id" "uuid", "p_status" "text", "p_scores" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dm_photo_set_verdict"("p_message_id" "uuid", "p_status" "text", "p_scores" "jsonb") TO "service_role";


REVOKE ALL ON FUNCTION "public"."effective_tax_rate"("p_business_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."effective_tax_rate"("p_business_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."effective_tax_rate"("p_business_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."enforce_business_limit"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_business_limit"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."enforce_business_radius_cap"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_business_radius_cap"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."enforce_employee_plan_limit"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_employee_plan_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_employee_plan_limit"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."enforce_service_call_cooldown"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_service_call_cooldown"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."enforce_service_call_golden_rule"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_service_call_golden_rule"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_service_call_golden_rule"() TO "service_role";


GRANT ALL ON FUNCTION "public"."gen_short_code"("p_len" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."gen_short_code"("p_len" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."gen_short_code"("p_len" integer) TO "service_role";


REVOKE ALL ON FUNCTION "public"."generate_room_qr_token"("_business_id" "uuid", "_is_sub_room" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."generate_room_qr_token"("_business_id" "uuid", "_is_sub_room" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_room_qr_token"("_business_id" "uuid", "_is_sub_room" boolean) TO "service_role";


REVOKE ALL ON FUNCTION "public"."generate_tab_pay_token"("_business_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."generate_tab_pay_token"("_business_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_tab_pay_token"("_business_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."generate_table_access_code"("_business_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."generate_table_access_code"("_business_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."generate_table_qr_token"("_business_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."generate_table_qr_token"("_business_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_table_qr_token"("_business_id" "uuid") TO "service_role";


GRANT ALL ON FUNCTION "public"."geo_distance_m"("lat1" double precision, "lng1" double precision, "lat2" double precision, "lng2" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."geo_distance_m"("lat1" double precision, "lng1" double precision, "lat2" double precision, "lng2" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geo_distance_m"("lat1" double precision, "lng1" double precision, "lat2" double precision, "lng2" double precision) TO "service_role";


REVOKE ALL ON FUNCTION "public"."get_public_receipt"("p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_receipt"("p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_receipt"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_receipt"("p_code" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."get_room_qr_token"("p_room_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_room_qr_token"("p_room_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_room_qr_token"("p_room_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."get_table_order_status"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_table_order_status"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_table_order_status"("p_token" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_table_order_status"("p_token" "text") TO "anon";


REVOKE ALL ON FUNCTION "public"."gift_available"("p_business_id" "uuid", "p_other_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."gift_available"("p_business_id" "uuid", "p_other_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gift_available"("p_business_id" "uuid", "p_other_user_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."gift_offer_cancel"("p_offer_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."gift_offer_cancel"("p_offer_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gift_offer_cancel"("p_offer_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."gift_offer_create"("p_business_id" "uuid", "p_to_user_id" "uuid", "p_items" "jsonb", "p_note" "text", "p_conversation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."gift_offer_create"("p_business_id" "uuid", "p_to_user_id" "uuid", "p_items" "jsonb", "p_note" "text", "p_conversation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gift_offer_create"("p_business_id" "uuid", "p_to_user_id" "uuid", "p_items" "jsonb", "p_note" "text", "p_conversation_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."gift_offer_dispatch"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."gift_offer_dispatch"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."gift_offer_dispatch"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."gift_offer_mark_failed"("p_stripe_pi_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."gift_offer_mark_failed"("p_stripe_pi_id" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."gift_offer_mark_held"("p_stripe_pi_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."gift_offer_mark_held"("p_stripe_pi_id" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."gift_offer_mark_paid"("p_stripe_pi_id" "text", "p_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."gift_offer_mark_paid"("p_stripe_pi_id" "text", "p_order_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."gift_offer_notify_response"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."gift_offer_notify_response"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."gift_offer_notify_response"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."gift_offer_register_payment_failure"("p_stripe_pi_id" "text", "p_error" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."gift_offer_register_payment_failure"("p_stripe_pi_id" "text", "p_error" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."gift_offer_respond"("p_offer_id" "uuid", "p_accept" boolean, "p_table_label" "text", "p_table_details" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."gift_offer_respond"("p_offer_id" "uuid", "p_accept" boolean, "p_table_label" "text", "p_table_details" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gift_offer_respond"("p_offer_id" "uuid", "p_accept" boolean, "p_table_label" "text", "p_table_details" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."gift_offer_set_hold"("p_offer_id" "uuid", "p_stripe_pi_id" "text", "p_subtotal" integer, "p_tax" integer, "p_total" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."gift_offer_set_hold"("p_offer_id" "uuid", "p_stripe_pi_id" "text", "p_subtotal" integer, "p_tax" integer, "p_total" integer) TO "service_role";


REVOKE ALL ON FUNCTION "public"."gift_offer_view"("p_offer_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."gift_offer_view"("p_offer_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gift_offer_view"("p_offer_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."gift_offers_expire"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."gift_offers_expire"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."gift_offers_reconcile"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."gift_offers_reconcile"() TO "service_role";


GRANT ALL ON FUNCTION "public"."gift_offers_touch"() TO "anon";
GRANT ALL ON FUNCTION "public"."gift_offers_touch"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."gift_offers_touch"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."guest_order_notify_staff"("p_code" "text", "p_kind" "text", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guest_order_notify_staff"("p_code" "text", "p_kind" "text", "p_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."guest_order_notify_staff"("p_code" "text", "p_kind" "text", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."guest_order_notify_staff"("p_code" "text", "p_kind" "text", "p_note" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."guest_order_view"("p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guest_order_view"("p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."guest_order_view"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."guest_order_view"("p_code" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."guest_request_service"("p_table_token" "text", "p_lat" double precision, "p_lng" double precision, "p_device_id" "text", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guest_request_service"("p_table_token" "text", "p_lat" double precision, "p_lng" double precision, "p_device_id" "text", "p_notes" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."guest_request_service_by_label"("p_business_id" "uuid", "p_label" "text", "p_lat" double precision, "p_lng" double precision, "p_device_id" "text", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guest_request_service_by_label"("p_business_id" "uuid", "p_label" "text", "p_lat" double precision, "p_lng" double precision, "p_device_id" "text", "p_notes" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."guest_tab_session_validate"("p_token_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guest_tab_session_validate"("p_token_hash" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."handle_new_auth_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."hide_dm_conversation"("p_conversation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hide_dm_conversation"("p_conversation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hide_dm_conversation"("p_conversation_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."inv_can_manage"("p_business_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."inv_can_manage"("p_business_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inv_can_manage"("p_business_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."inventory_archive_location"("p_business_id" "uuid", "p_location_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."inventory_archive_location"("p_business_id" "uuid", "p_location_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inventory_archive_location"("p_business_id" "uuid", "p_location_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."inventory_create_location"("p_business_id" "uuid", "p_name" "text", "p_is_sales" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."inventory_create_location"("p_business_id" "uuid", "p_name" "text", "p_is_sales" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."inventory_create_location"("p_business_id" "uuid", "p_name" "text", "p_is_sales" boolean) TO "service_role";


REVOKE ALL ON FUNCTION "public"."inventory_kpis"("p_business_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."inventory_kpis"("p_business_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."inventory_kpis"("p_business_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "service_role";


REVOKE ALL ON FUNCTION "public"."inventory_rename_location"("p_business_id" "uuid", "p_location_id" "uuid", "p_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."inventory_rename_location"("p_business_id" "uuid", "p_location_id" "uuid", "p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inventory_rename_location"("p_business_id" "uuid", "p_location_id" "uuid", "p_name" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."inventory_report"("p_business_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."inventory_report"("p_business_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."inventory_report"("p_business_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "service_role";


REVOKE ALL ON FUNCTION "public"."inventory_set_location_qty"("p_business_id" "uuid", "p_menu_item_id" "uuid", "p_location_id" "uuid", "p_qty" integer, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."inventory_set_location_qty"("p_business_id" "uuid", "p_menu_item_id" "uuid", "p_location_id" "uuid", "p_qty" integer, "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inventory_set_location_qty"("p_business_id" "uuid", "p_menu_item_id" "uuid", "p_location_id" "uuid", "p_qty" integer, "p_reason" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."inventory_set_sales_location"("p_business_id" "uuid", "p_location_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."inventory_set_sales_location"("p_business_id" "uuid", "p_location_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inventory_set_sales_location"("p_business_id" "uuid", "p_location_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."inventory_transfer"("p_business_id" "uuid", "p_menu_item_id" "uuid", "p_from_location" "uuid", "p_to_location" "uuid", "p_qty" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."inventory_transfer"("p_business_id" "uuid", "p_menu_item_id" "uuid", "p_from_location" "uuid", "p_to_location" "uuid", "p_qty" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."inventory_transfer"("p_business_id" "uuid", "p_menu_item_id" "uuid", "p_from_location" "uuid", "p_to_location" "uuid", "p_qty" integer) TO "service_role";


REVOKE ALL ON FUNCTION "public"."is_banned_from_room"("p_room" "uuid", "p_user" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_banned_from_room"("p_room" "uuid", "p_user" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_banned_from_room"("p_room" "uuid", "p_user" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."is_blocked"("a" "uuid", "b" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_blocked"("a" "uuid", "b" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_blocked"("a" "uuid", "b" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."is_employee_of_business"("p_business_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_employee_of_business"("p_business_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_employee_of_business"("p_business_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."is_muted_in_room"("p_room" "uuid", "p_user" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_muted_in_room"("p_room" "uuid", "p_user" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_muted_in_room"("p_room" "uuid", "p_user" "uuid") TO "service_role";


GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."is_private_account"("p_user" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_private_account"("p_user" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_private_account"("p_user" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."is_venue_staff"("p_business_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_venue_staff"("p_business_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_venue_staff"("p_business_id" "uuid", "p_user_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."is_waiter_of_table"("p_table_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_waiter_of_table"("p_table_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_waiter_of_table"("p_table_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."join_room_via_qr"("token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."join_room_via_qr"("token" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."join_room_via_qr"("token" "text", "p_lat" double precision, "p_lng" double precision) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."join_room_via_qr"("token" "text", "p_lat" double precision, "p_lng" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."join_room_via_qr"("token" "text", "p_lat" double precision, "p_lng" double precision) TO "service_role";


REVOKE ALL ON FUNCTION "public"."match_card"("p_viewer" "uuid", "p_user" "uuid", "p_business_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_card"("p_viewer" "uuid", "p_user" "uuid", "p_business_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."match_check_in"("p_business_id" "uuid", "p_lat" double precision, "p_lng" double precision, "p_qr_token" "text", "p_mocked" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_check_in"("p_business_id" "uuid", "p_lat" double precision, "p_lng" double precision, "p_qr_token" "text", "p_mocked" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_check_in"("p_business_id" "uuid", "p_lat" double precision, "p_lng" double precision, "p_qr_token" "text", "p_mocked" boolean) TO "service_role";


REVOKE ALL ON FUNCTION "public"."match_clear_likes"("p_business_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_clear_likes"("p_business_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_clear_likes"("p_business_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."match_common_business"("p_viewer" "uuid", "p_target" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_common_business"("p_viewer" "uuid", "p_target" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_common_business"("p_viewer" "uuid", "p_target" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."match_delete_like"("p_swipe_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_delete_like"("p_swipe_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_delete_like"("p_swipe_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."match_delete_match"("p_match_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_delete_match"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_delete_match"("p_match_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."match_detect"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_detect"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_detect"() TO "service_role";


GRANT ALL ON FUNCTION "public"."match_enabled_for_business"("p_business_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."match_enabled_for_business"("p_business_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_enabled_for_business"("p_business_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."match_follow_survival"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_follow_survival"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_follow_survival"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."match_get_activity"("p_business_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_get_activity"("p_business_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_get_activity"("p_business_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."match_get_deck"("p_business_id" "uuid", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_get_deck"("p_business_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_get_deck"("p_business_id" "uuid", "p_limit" integer) TO "service_role";


REVOKE ALL ON FUNCTION "public"."match_get_passed"("p_business_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_get_passed"("p_business_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_get_passed"("p_business_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."match_get_profile"("p_business_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_get_profile"("p_business_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_get_profile"("p_business_id" "uuid", "p_user_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."match_kick"("p_business_id" "uuid", "p_user_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_kick"("p_business_id" "uuid", "p_user_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_kick"("p_business_id" "uuid", "p_user_id" "uuid", "p_reason" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."match_leave_venue"("p_business_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_leave_venue"("p_business_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_leave_venue"("p_business_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."match_notify_new_people"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_notify_new_people"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_notify_new_people"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."match_photo_dispatch_moderation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_photo_dispatch_moderation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_photo_dispatch_moderation"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."match_photo_retry_moderation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_photo_retry_moderation"() TO "service_role";


GRANT ALL ON FUNCTION "public"."match_photos_guard"() TO "anon";
GRANT ALL ON FUNCTION "public"."match_photos_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_photos_guard"() TO "service_role";


GRANT ALL ON FUNCTION "public"."match_photos_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."match_photos_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_photos_limit"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."match_relike"("p_business_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_relike"("p_business_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_relike"("p_business_id" "uuid", "p_user_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."match_relikes_wipe_on_leave"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_relikes_wipe_on_leave"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_relikes_wipe_on_leave"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."match_remove_pair"("p_business_id" "uuid", "p_u1" "uuid", "p_u2" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_remove_pair"("p_business_id" "uuid", "p_u1" "uuid", "p_u2" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."match_report"("p_business_id" "uuid", "p_reported_user_id" "uuid", "p_reason" "text", "p_details" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_report"("p_business_id" "uuid", "p_reported_user_id" "uuid", "p_reason" "text", "p_details" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_report"("p_business_id" "uuid", "p_reported_user_id" "uuid", "p_reason" "text", "p_details" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."match_request_help"("p_business_id" "uuid", "p_room_id" "uuid", "p_table_label" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_request_help"("p_business_id" "uuid", "p_room_id" "uuid", "p_table_label" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_request_help"("p_business_id" "uuid", "p_room_id" "uuid", "p_table_label" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."match_resolve_report"("p_report_id" "uuid", "p_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_resolve_report"("p_report_id" "uuid", "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_resolve_report"("p_report_id" "uuid", "p_status" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."match_swipe"("p_business_id" "uuid", "p_target_id" "uuid", "p_action" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_swipe"("p_business_id" "uuid", "p_target_id" "uuid", "p_action" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_swipe"("p_business_id" "uuid", "p_target_id" "uuid", "p_action" "text") TO "service_role";


GRANT ALL ON FUNCTION "public"."match_today"() TO "anon";
GRANT ALL ON FUNCTION "public"."match_today"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_today"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."match_undo_last"("p_business_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_undo_last"("p_business_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_undo_last"("p_business_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."match_unkick"("p_business_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_unkick"("p_business_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_unkick"("p_business_id" "uuid", "p_user_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."match_wipe_expired"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_wipe_expired"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."match_wipe_user_venue"("p_user_id" "uuid", "p_business_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_wipe_user_venue"("p_user_id" "uuid", "p_business_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."match_wipe_user_venue_keep_dms"("p_user_id" "uuid", "p_business_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_wipe_user_venue_keep_dms"("p_user_id" "uuid", "p_business_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."megaphone_feed"("p_lat" double precision, "p_lng" double precision, "p_radius_miles" integer, "p_before" timestamp with time zone, "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."megaphone_feed"("p_lat" double precision, "p_lng" double precision, "p_radius_miles" integer, "p_before" timestamp with time zone, "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."megaphone_feed"("p_lat" double precision, "p_lng" double precision, "p_radius_miles" integer, "p_before" timestamp with time zone, "p_limit" integer) TO "service_role";


GRANT ALL ON FUNCTION "public"."message_filter_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."message_filter_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."message_filter_trigger"() TO "service_role";


GRANT ALL ON FUNCTION "public"."message_is_objectionable"("p_text" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."message_is_objectionable"("p_text" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."message_is_objectionable"("p_text" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."message_under_retention_hold"("p_message_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."message_under_retention_hold"("p_message_id" "uuid") TO "service_role";


GRANT ALL ON FUNCTION "public"."messages_type_guard"() TO "anon";
GRANT ALL ON FUNCTION "public"."messages_type_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."messages_type_guard"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."my_active_orders"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_active_orders"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_active_orders"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."my_block_relations"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_block_relations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_block_relations"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."normalize_item_status"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."normalize_item_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_item_status"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."notify_low_stock"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_low_stock"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."notify_on_comment"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_on_comment"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."notify_on_follow"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_on_follow"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."notify_on_follow_request"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_on_follow_request"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."notify_on_post_like"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_on_post_like"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."notify_order_status"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_order_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_order_status"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."open_tab_on_table"("p_table_id" "uuid", "p_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."open_tab_on_table"("p_table_id" "uuid", "p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."open_tab_on_table"("p_table_id" "uuid", "p_name" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."order_auto_delivered"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."order_auto_delivered"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."order_auto_delivered"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."order_notify_staff"("p_order_id" "uuid", "p_kind" "text", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."order_notify_staff"("p_order_id" "uuid", "p_kind" "text", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."order_notify_staff"("p_order_id" "uuid", "p_kind" "text", "p_note" "text") TO "service_role";


GRANT ALL ON FUNCTION "public"."orders_status_changed"() TO "anon";
GRANT ALL ON FUNCTION "public"."orders_status_changed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."orders_status_changed"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."owns_business"("p_business" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owns_business"("p_business" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."owns_business"("p_business" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."owns_business_of_table"("p_table_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owns_business_of_table"("p_table_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."owns_business_of_table"("p_table_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."owns_room_business"("p_room" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owns_room_business"("p_room" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."owns_room_business"("p_room" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."pos_apply_external_payment"("p_business_id" "uuid", "p_table_id" "uuid", "p_method" "text", "p_tip_cents" integer, "p_payment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_apply_external_payment"("p_business_id" "uuid", "p_table_id" "uuid", "p_method" "text", "p_tip_cents" integer, "p_payment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_apply_external_payment"("p_business_id" "uuid", "p_table_id" "uuid", "p_method" "text", "p_tip_cents" integer, "p_payment_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."pos_apply_payment"("p_payment_id" "uuid", "p_tip_cents" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_apply_payment"("p_payment_id" "uuid", "p_tip_cents" integer) TO "service_role";


REVOKE ALL ON FUNCTION "public"."pos_apply_stock_movement"("p_business_id" "uuid", "p_menu_item_id" "uuid", "p_mode" "text", "p_quantity" integer, "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_apply_stock_movement"("p_business_id" "uuid", "p_menu_item_id" "uuid", "p_mode" "text", "p_quantity" integer, "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_apply_stock_movement"("p_business_id" "uuid", "p_menu_item_id" "uuid", "p_mode" "text", "p_quantity" integer, "p_note" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."pos_approve_order"("p_business_id" "uuid", "p_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_approve_order"("p_business_id" "uuid", "p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_approve_order"("p_business_id" "uuid", "p_order_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."pos_awaiting_orders"("p_business_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_awaiting_orders"("p_business_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_awaiting_orders"("p_business_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."pos_business_settings"("p_business_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_business_settings"("p_business_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."pos_business_settings"("p_business_id" "uuid") TO "authenticated";


REVOKE ALL ON FUNCTION "public"."pos_can_access"("p_business_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_can_access"("p_business_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_can_access"("p_business_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."pos_claim_comanda_print"("p_business_id" "uuid", "p_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_claim_comanda_print"("p_business_id" "uuid", "p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_claim_comanda_print"("p_business_id" "uuid", "p_order_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."pos_close_table_session"("p_business_id" "uuid", "p_table_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_close_table_session"("p_business_id" "uuid", "p_table_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_close_table_session"("p_business_id" "uuid", "p_table_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."pos_combine_tables"("p_business_id" "uuid", "p_primary_table_id" "uuid", "p_secondary_table_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_combine_tables"("p_business_id" "uuid", "p_primary_table_id" "uuid", "p_secondary_table_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_combine_tables"("p_business_id" "uuid", "p_primary_table_id" "uuid", "p_secondary_table_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."pos_create_check"("p_business_id" "uuid", "p_table_id" "uuid", "p_order_item_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_create_check"("p_business_id" "uuid", "p_table_id" "uuid", "p_order_item_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_create_check"("p_business_id" "uuid", "p_table_id" "uuid", "p_order_item_ids" "uuid"[]) TO "service_role";


REVOKE ALL ON FUNCTION "public"."pos_create_order"("p_business_id" "uuid", "p_table_id" "uuid", "p_items" "jsonb", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_create_order"("p_business_id" "uuid", "p_table_id" "uuid", "p_items" "jsonb", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_create_order"("p_business_id" "uuid", "p_table_id" "uuid", "p_items" "jsonb", "p_notes" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."pos_create_split"("p_business_id" "uuid", "p_table_id" "uuid", "p_method" "text", "p_ways" integer, "p_checks" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_create_split"("p_business_id" "uuid", "p_table_id" "uuid", "p_method" "text", "p_ways" integer, "p_checks" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_create_split"("p_business_id" "uuid", "p_table_id" "uuid", "p_method" "text", "p_ways" integer, "p_checks" "jsonb") TO "service_role";


REVOKE ALL ON FUNCTION "public"."pos_daily_payment_summary"("p_business_id" "uuid", "p_day" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_daily_payment_summary"("p_business_id" "uuid", "p_day" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_daily_payment_summary"("p_business_id" "uuid", "p_day" "date") TO "service_role";


REVOKE ALL ON FUNCTION "public"."pos_guest_claim_share"("p_payment_id" "uuid", "p_guest_session_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_guest_claim_share"("p_payment_id" "uuid", "p_guest_session_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."pos_guest_even_plan"("p_business_id" "uuid", "p_table_id" "uuid", "p_ways" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_guest_even_plan"("p_business_id" "uuid", "p_table_id" "uuid", "p_ways" integer) TO "service_role";


REVOKE ALL ON FUNCTION "public"."pos_guest_table_summary"("p_business_id" "uuid", "p_table_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_guest_table_summary"("p_business_id" "uuid", "p_table_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."pos_kds_metrics"("p_business_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_kds_metrics"("p_business_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_kds_metrics"("p_business_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "service_role";


REVOKE ALL ON FUNCTION "public"."pos_kds_metrics_v2"("p_business_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_station" "text", "p_taken_by" "uuid", "p_tz" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_kds_metrics_v2"("p_business_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_station" "text", "p_taken_by" "uuid", "p_tz" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_kds_metrics_v2"("p_business_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_station" "text", "p_taken_by" "uuid", "p_tz" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."pos_kds_settings"("p_business_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_kds_settings"("p_business_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_kds_settings"("p_business_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."pos_link_barcode"("p_business_id" "uuid", "p_menu_item_id" "uuid", "p_barcode" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_link_barcode"("p_business_id" "uuid", "p_menu_item_id" "uuid", "p_barcode" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_link_barcode"("p_business_id" "uuid", "p_menu_item_id" "uuid", "p_barcode" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."pos_list_blocked_devices"("p_business_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_list_blocked_devices"("p_business_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_list_blocked_devices"("p_business_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."pos_mark_comanda_printed"("p_business_id" "uuid", "p_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_mark_comanda_printed"("p_business_id" "uuid", "p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_mark_comanda_printed"("p_business_id" "uuid", "p_order_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."pos_my_businesses"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_my_businesses"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_my_businesses"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."pos_open_table_session"("p_business_id" "uuid", "p_table_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_open_table_session"("p_business_id" "uuid", "p_table_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_open_table_session"("p_business_id" "uuid", "p_table_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."pos_payment_voucher"("p_payment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_payment_voucher"("p_payment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_payment_voucher"("p_payment_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."pos_pending_comandas"("p_business_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_pending_comandas"("p_business_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_pending_comandas"("p_business_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."pos_pickup_board"("p_business_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_pickup_board"("p_business_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_pickup_board"("p_business_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."pos_receipts_today"("p_business_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_receipts_today"("p_business_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_receipts_today"("p_business_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."pos_reject_order"("p_business_id" "uuid", "p_order_id" "uuid", "p_reason" "text", "p_mode" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_reject_order"("p_business_id" "uuid", "p_order_id" "uuid", "p_reason" "text", "p_mode" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_reject_order"("p_business_id" "uuid", "p_order_id" "uuid", "p_reason" "text", "p_mode" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."pos_release_comanda_print"("p_business_id" "uuid", "p_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_release_comanda_print"("p_business_id" "uuid", "p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_release_comanda_print"("p_business_id" "uuid", "p_order_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."pos_session_split_method"("p_business_id" "uuid", "p_table_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_session_split_method"("p_business_id" "uuid", "p_table_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."pos_set_party_size"("p_business_id" "uuid", "p_table_id" "uuid", "p_party_size" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_set_party_size"("p_business_id" "uuid", "p_table_id" "uuid", "p_party_size" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_set_party_size"("p_business_id" "uuid", "p_table_id" "uuid", "p_party_size" integer) TO "service_role";


REVOKE ALL ON FUNCTION "public"."pos_set_pin"("p_business_id" "uuid", "p_pin" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_set_pin"("p_business_id" "uuid", "p_pin" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_set_pin"("p_business_id" "uuid", "p_pin" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."pos_tab_total"("p_business_id" "uuid", "p_table_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_tab_total"("p_business_id" "uuid", "p_table_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_tab_total"("p_business_id" "uuid", "p_table_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."pos_table_balance"("p_business_id" "uuid", "p_table_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_table_balance"("p_business_id" "uuid", "p_table_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_table_balance"("p_business_id" "uuid", "p_table_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."pos_table_items"("p_business_id" "uuid", "p_table_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_table_items"("p_business_id" "uuid", "p_table_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_table_items"("p_business_id" "uuid", "p_table_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."pos_table_session"("p_business_id" "uuid", "p_table_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_table_session"("p_business_id" "uuid", "p_table_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_table_session"("p_business_id" "uuid", "p_table_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."pos_tables_overview"("p_business_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_tables_overview"("p_business_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_tables_overview"("p_business_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."pos_unblock_device"("p_business_id" "uuid", "p_block_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_unblock_device"("p_business_id" "uuid", "p_block_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_unblock_device"("p_business_id" "uuid", "p_block_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."pos_uncombine_table"("p_business_id" "uuid", "p_table_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_uncombine_table"("p_business_id" "uuid", "p_table_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_uncombine_table"("p_business_id" "uuid", "p_table_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."pos_verify_pin"("p_business_id" "uuid", "p_pin" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_verify_pin"("p_business_id" "uuid", "p_pin" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_verify_pin"("p_business_id" "uuid", "p_pin" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."pos_void_order"("p_business_id" "uuid", "p_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_void_order"("p_business_id" "uuid", "p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_void_order"("p_business_id" "uuid", "p_order_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."profile_counts"("p_user" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."profile_counts"("p_user" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."profile_counts"("p_user" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."purchase_suggestion"("p_business_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."purchase_suggestion"("p_business_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."purchase_suggestion"("p_business_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."purge_expired_messages"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."purge_expired_messages"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."purge_stale_pending_carts"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."purge_stale_pending_carts"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."push_dispatch"("p_kind" "text", "p_record" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."push_dispatch"("p_kind" "text", "p_record" "jsonb") TO "service_role";


REVOKE ALL ON FUNCTION "public"."push_on_dm_insert"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."push_on_dm_insert"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."push_on_notification_insert"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."push_on_notification_insert"() TO "service_role";


GRANT ALL ON TABLE "public"."affiliate_payouts" TO "authenticated";
GRANT ALL ON TABLE "public"."affiliate_payouts" TO "service_role";


REVOKE ALL ON FUNCTION "public"."record_affiliate_payout"("p_affiliate_id" "uuid", "p_commission_ids" "uuid"[], "p_method" "text", "p_reference" "text", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_affiliate_payout"("p_affiliate_id" "uuid", "p_commission_ids" "uuid"[], "p_method" "text", "p_reference" "text", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_affiliate_payout"("p_affiliate_id" "uuid", "p_commission_ids" "uuid"[], "p_method" "text", "p_reference" "text", "p_note" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."regenerate_room_qr_token"("_room_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."regenerate_room_qr_token"("_room_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regenerate_room_qr_token"("_room_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."regenerate_table_code"("p_table_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."regenerate_table_code"("p_table_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regenerate_table_code"("p_table_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."reject_follow_request"("p_requester" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reject_follow_request"("p_requester" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_follow_request"("p_requester" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."remove_follower"("p_follower" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."remove_follower"("p_follower" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_follower"("p_follower" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."report_content"("p_content_type" "text", "p_content_id" "uuid", "p_reason" "text", "p_details" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."report_content"("p_content_type" "text", "p_content_id" "uuid", "p_reason" "text", "p_details" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."report_content"("p_content_type" "text", "p_content_id" "uuid", "p_reason" "text", "p_details" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."reports_set_business_from_tod_message"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reports_set_business_from_tod_message"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reports_set_business_from_tod_message"() TO "service_role";


GRANT ALL ON FUNCTION "public"."reports_set_priority"() TO "anon";
GRANT ALL ON FUNCTION "public"."reports_set_priority"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reports_set_priority"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."reports_urgent_alert"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reports_urgent_alert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reports_urgent_alert"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."request_or_follow"("p_target" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_or_follow"("p_target" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_or_follow"("p_target" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."reservation_slot_load"("p_business_id" "uuid", "p_reserved_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reservation_slot_load"("p_business_id" "uuid", "p_reserved_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."reservation_slot_load"("p_business_id" "uuid", "p_reserved_at" timestamp with time zone) TO "service_role";


GRANT ALL ON FUNCTION "public"."reservations_customer_guard"() TO "anon";
GRANT ALL ON FUNCTION "public"."reservations_customer_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reservations_customer_guard"() TO "service_role";


GRANT ALL ON FUNCTION "public"."resolve_room_qr"("token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_room_qr"("token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_room_qr"("token" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."resolve_tab_payment"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_tab_payment"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_tab_payment"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_tab_payment"("p_token" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."resolve_table_qr"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_table_qr"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_table_qr"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_table_qr"("p_token" "text") TO "service_role";


GRANT ALL ON FUNCTION "public"."resolve_table_short"("p_business" "text", "p_label" "text", "p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_table_short"("p_business" "text", "p_label" "text", "p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_table_short"("p_business" "text", "p_label" "text", "p_code" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."resolve_table_waiter_for_attribution"("p_table_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_table_waiter_for_attribution"("p_table_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."resolve_venue_entry"("p_venue" "text", "p_label" "text", "p_code" "text", "p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_venue_entry"("p_venue" "text", "p_label" "text", "p_code" "text", "p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_venue_entry"("p_venue" "text", "p_label" "text", "p_code" "text", "p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_venue_entry"("p_venue" "text", "p_label" "text", "p_code" "text", "p_token" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."sbl_sync_total"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sbl_sync_total"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."search_reservation_customers"("p_business_id" "uuid", "p_query" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."search_reservation_customers"("p_business_id" "uuid", "p_query" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_reservation_customers"("p_business_id" "uuid", "p_query" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."set_item_status"("p_order_item_id" "uuid", "p_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_item_status"("p_order_item_id" "uuid", "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_item_status"("p_order_item_id" "uuid", "p_status" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."set_reservation_status"("p_reservation_id" "uuid", "p_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_reservation_status"("p_reservation_id" "uuid", "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_reservation_status"("p_reservation_id" "uuid", "p_status" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."set_room_password"("room_id" "uuid", "password" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_room_password"("room_id" "uuid", "password" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_room_password"("room_id" "uuid", "password" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."set_tab_business_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_tab_business_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_tab_business_id"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."set_table_reserved"("p_table_id" "uuid", "p_reserved" boolean, "p_note" "text", "p_until" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_table_reserved"("p_table_id" "uuid", "p_reserved" boolean, "p_note" "text", "p_until" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_table_reserved"("p_table_id" "uuid", "p_reserved" boolean, "p_note" "text", "p_until" timestamp with time zone) TO "service_role";


REVOKE ALL ON FUNCTION "public"."set_table_subchat"("p_table_id" "uuid", "p_enable" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_table_subchat"("p_table_id" "uuid", "p_enable" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_table_subchat"("p_table_id" "uuid", "p_enable" boolean) TO "service_role";


REVOKE ALL ON FUNCTION "public"."set_table_subchat"("p_table_id" "uuid", "p_enable" boolean, "p_base_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_table_subchat"("p_table_id" "uuid", "p_enable" boolean, "p_base_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_table_subchat"("p_table_id" "uuid", "p_enable" boolean, "p_base_name" "text") TO "service_role";


GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."settle_tab_payment"("p_tab_payment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."settle_tab_payment"("p_tab_payment_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."social_actor_name"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."social_actor_name"("p_user_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."staff_set_order_status"("p_order_id" "uuid", "p_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."staff_set_order_status"("p_order_id" "uuid", "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."staff_set_order_status"("p_order_id" "uuid", "p_status" "text") TO "service_role";


GRANT ALL ON FUNCTION "public"."stamp_item_status_time"() TO "anon";
GRANT ALL ON FUNCTION "public"."stamp_item_status_time"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."stamp_item_status_time"() TO "service_role";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."dm_conversations" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."dm_conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."dm_conversations" TO "service_role";


GRANT UPDATE("last_message_at") ON TABLE "public"."dm_conversations" TO "authenticated";


REVOKE ALL ON FUNCTION "public"."start_dm"("p_target_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."start_dm"("p_target_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."start_dm"("p_target_id" "uuid") TO "service_role";


GRANT ALL ON FUNCTION "public"."sync_business_coords_radius"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_business_coords_radius"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_business_coords_radius"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."sync_order_status_from_items"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_order_status_from_items"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_order_status_from_items"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."tab_amount_due"("p_tab_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tab_amount_due"("p_tab_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."tab_amount_due"("p_tab_id" "uuid") TO "service_role";


GRANT ALL ON FUNCTION "public"."tables_set_short_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."tables_set_short_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tables_set_short_code"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."tod_accept_terms"("p_version" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tod_accept_terms"("p_version" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."tod_accept_terms"("p_version" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."tod_applaud"("p_draw_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tod_applaud"("p_draw_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."tod_applaud"("p_draw_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."tod_auto_hide_on_reports"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tod_auto_hide_on_reports"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."tod_business_stats"("p_business_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tod_business_stats"("p_business_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."tod_business_stats"("p_business_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "service_role";


GRANT ALL ON FUNCTION "public"."tod_category_enabled"("p_business_id" "uuid", "p_category" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."tod_category_enabled"("p_business_id" "uuid", "p_category" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."tod_category_enabled"("p_business_id" "uuid", "p_category" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."tod_close_round"("p_round_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tod_close_round"("p_round_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."tod_close_round"("p_round_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."tod_create_round"("p_room_id" "uuid", "p_category" "text", "p_official" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tod_create_round"("p_room_id" "uuid", "p_category" "text", "p_official" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."tod_create_round"("p_room_id" "uuid", "p_category" "text", "p_official" boolean) TO "service_role";


REVOKE ALL ON FUNCTION "public"."tod_decide"("p_draw_id" "uuid", "p_publish" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tod_decide"("p_draw_id" "uuid", "p_publish" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."tod_decide"("p_draw_id" "uuid", "p_publish" boolean) TO "service_role";


REVOKE ALL ON FUNCTION "public"."tod_draw"("p_round_id" "uuid", "p_choice" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tod_draw"("p_round_id" "uuid", "p_choice" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."tod_draw"("p_round_id" "uuid", "p_choice" "text") TO "service_role";


GRANT ALL ON FUNCTION "public"."tod_enabled_for_business"("p_business_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."tod_enabled_for_business"("p_business_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."tod_enabled_for_business"("p_business_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."tod_expire"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tod_expire"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."tod_kick"("p_business_id" "uuid", "p_user_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tod_kick"("p_business_id" "uuid", "p_user_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."tod_kick"("p_business_id" "uuid", "p_user_id" "uuid", "p_reason" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."tod_patch_message"("p_message_id" "uuid", "p_patch" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tod_patch_message"("p_message_id" "uuid", "p_patch" "jsonb") TO "service_role";


REVOKE ALL ON FUNCTION "public"."tod_post_message"("p_room_id" "uuid", "p_user_id" "uuid", "p_type" "text", "p_body" "text", "p_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tod_post_message"("p_room_id" "uuid", "p_user_id" "uuid", "p_type" "text", "p_body" "text", "p_metadata" "jsonb") TO "service_role";


REVOKE ALL ON FUNCTION "public"."tod_purge"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tod_purge"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."tod_resolve_report"("p_report_id" "uuid", "p_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tod_resolve_report"("p_report_id" "uuid", "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."tod_resolve_report"("p_report_id" "uuid", "p_status" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."tod_staff_hide"("p_message_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tod_staff_hide"("p_message_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."tod_staff_hide"("p_message_id" "uuid", "p_reason" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."tod_unkick"("p_business_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tod_unkick"("p_business_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."tod_unkick"("p_business_id" "uuid", "p_user_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."trg_deactivate_table_subchat"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_deactivate_table_subchat"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."trg_fn_assign_room_qr_token"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_fn_assign_room_qr_token"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."trg_fn_assign_table_qr_token"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_fn_assign_table_qr_token"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_fn_assign_table_qr_token"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."trg_fn_tab_payment_defaults"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_fn_tab_payment_defaults"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_fn_tab_payment_defaults"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."trg_fn_table_session_autoclose"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_fn_table_session_autoclose"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."unblock_user"("p_target" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."unblock_user"("p_target" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unblock_user"("p_target" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."update_my_settings"("p_patch" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_my_settings"("p_patch" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_my_settings"("p_patch" "jsonb") TO "service_role";


REVOKE ALL ON FUNCTION "public"."update_reservation"("p_reservation_id" "uuid", "p_reserved_at" timestamp with time zone, "p_party_size" integer, "p_table_ids" "uuid"[], "p_event_type" "text", "p_phone" "text", "p_first_name" "text", "p_last_name" "text", "p_special_requests" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_reservation"("p_reservation_id" "uuid", "p_reserved_at" timestamp with time zone, "p_party_size" integer, "p_table_ids" "uuid"[], "p_event_type" "text", "p_phone" "text", "p_first_name" "text", "p_last_name" "text", "p_special_requests" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_reservation"("p_reservation_id" "uuid", "p_reserved_at" timestamp with time zone, "p_party_size" integer, "p_table_ids" "uuid"[], "p_event_type" "text", "p_phone" "text", "p_first_name" "text", "p_last_name" "text", "p_special_requests" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."user_has_tab_at_table"("p_table_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."user_has_tab_at_table"("p_table_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_has_tab_at_table"("p_table_id" "uuid") TO "service_role";


GRANT ALL ON FUNCTION "public"."username_available"("check_username" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."username_available"("check_username" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."username_available"("check_username" "text") TO "service_role";


GRANT ALL ON FUNCTION "public"."users_is_test_guard"() TO "anon";
GRANT ALL ON FUNCTION "public"."users_is_test_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."users_is_test_guard"() TO "service_role";


GRANT ALL ON FUNCTION "public"."validate_business_subdomain"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_business_subdomain"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_business_subdomain"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."validate_promo_code"("p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_promo_code"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_promo_code"("p_code" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."venue_distance_m"("p_business_id" "uuid", "p_lat" double precision, "p_lng" double precision) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."venue_distance_m"("p_business_id" "uuid", "p_lat" double precision, "p_lng" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."venue_distance_m"("p_business_id" "uuid", "p_lat" double precision, "p_lng" double precision) TO "service_role";


REVOKE ALL ON FUNCTION "public"."venue_exits_purge"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."venue_exits_purge"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."venue_inside"("p_business_id" "uuid", "p_lat" double precision, "p_lng" double precision) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."venue_inside"("p_business_id" "uuid", "p_lat" double precision, "p_lng" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."venue_inside"("p_business_id" "uuid", "p_lat" double precision, "p_lng" double precision) TO "service_role";


REVOKE ALL ON FUNCTION "public"."venue_order_access"("p_business_id" "uuid", "p_lat" double precision, "p_lng" double precision) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."venue_order_access"("p_business_id" "uuid", "p_lat" double precision, "p_lng" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."venue_order_access"("p_business_id" "uuid", "p_lat" double precision, "p_lng" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."venue_order_access"("p_business_id" "uuid", "p_lat" double precision, "p_lng" double precision) TO "service_role";


REVOKE ALL ON FUNCTION "public"."venue_people_counts"("p_business_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."venue_people_counts"("p_business_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."venue_people_counts"("p_business_ids" "uuid"[]) TO "service_role";


REVOKE ALL ON FUNCTION "public"."venue_presence_ok"("p_business_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."venue_presence_ok"("p_business_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."venue_presence_ok"("p_business_id" "uuid", "p_user_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."venue_present_users"("p_business_id" "uuid", "p_user_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."venue_present_users"("p_business_id" "uuid", "p_user_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."venue_present_users"("p_business_id" "uuid", "p_user_ids" "uuid"[]) TO "service_role";


REVOKE ALL ON FUNCTION "public"."venue_session_end"("p_business_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."venue_session_end"("p_business_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."venue_session_end"("p_business_id" "uuid", "p_reason" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."venue_session_expires_at"("p_business_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."venue_session_expires_at"("p_business_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."venue_session_resume"("p_business_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."venue_session_resume"("p_business_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."venue_session_resume"("p_business_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."venue_table_labels"("p_business_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."venue_table_labels"("p_business_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."venue_table_labels"("p_business_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."verify_room_password"("room_id" "uuid", "password" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verify_room_password"("room_id" "uuid", "password" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_room_password"("room_id" "uuid", "password" "text") TO "service_role";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."admin_roles" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."admin_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_roles" TO "service_role";


GRANT ALL ON TABLE "public"."affiliate_commissions" TO "authenticated";
GRANT ALL ON TABLE "public"."affiliate_commissions" TO "service_role";


GRANT ALL ON TABLE "public"."affiliates" TO "authenticated";
GRANT ALL ON TABLE "public"."affiliates" TO "service_role";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."announcements" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."announcements" TO "authenticated";
GRANT ALL ON TABLE "public"."announcements" TO "service_role";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."bans" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."bans" TO "authenticated";
GRANT ALL ON TABLE "public"."bans" TO "service_role";


GRANT UPDATE("banned_by") ON TABLE "public"."bans" TO "authenticated";


GRANT UPDATE("reason") ON TABLE "public"."bans" TO "authenticated";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."blocks" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."blocks" TO "authenticated";
GRANT ALL ON TABLE "public"."blocks" TO "service_role";


GRANT ALL ON TABLE "public"."business_games" TO "anon";
GRANT ALL ON TABLE "public"."business_games" TO "authenticated";
GRANT ALL ON TABLE "public"."business_games" TO "service_role";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."business_verifications" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."business_verifications" TO "authenticated";
GRANT ALL ON TABLE "public"."business_verifications" TO "service_role";


GRANT SELECT,MAINTAIN ON TABLE "public"."businesses" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN ON TABLE "public"."businesses" TO "authenticated";
GRANT ALL ON TABLE "public"."businesses" TO "service_role";


GRANT UPDATE("id") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("name") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("slug") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("description") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("category") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("address") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("city") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("state") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("country") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("lat") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("lng") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("phone") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("website") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("logo_url") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("cover_url") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("is_active") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("dashboard_theme_id") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("created_at") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("updated_at") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("icon_emoji") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("hours") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("radius_m") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("menu_enabled") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("tips_enabled") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("tip_percentages") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("payout_frequency") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("gallery_urls") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("latitude") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("longitude") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("geofence_radius_m") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("geofence_polygon") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("menu_mode") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("external_menu_url") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("menu_card_effect") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("is_temporary") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("event_starts_at") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("event_ends_at") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("menu_template_id") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("menu_palette_id") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("icon_url") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("dashboard_palette_id") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("table_subchats_enabled") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("table_subchat_base_name") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("kds_settings") ON TABLE "public"."businesses" TO "authenticated";


GRANT SELECT("brand_kit"),UPDATE("brand_kit") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("receipt_brand_color") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("receipt_template_id") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("pos_payment_mode") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("pickup_enabled") ON TABLE "public"."businesses" TO "authenticated";


GRANT UPDATE("reservation_capacity") ON TABLE "public"."businesses" TO "authenticated";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."check_ins" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."check_ins" TO "authenticated";
GRANT ALL ON TABLE "public"."check_ins" TO "service_role";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."comments" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."comments" TO "authenticated";
GRANT ALL ON TABLE "public"."comments" TO "service_role";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."custom_roles" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."custom_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."custom_roles" TO "service_role";


GRANT UPDATE("name") ON TABLE "public"."custom_roles" TO "authenticated";


GRANT UPDATE("permissions") ON TABLE "public"."custom_roles" TO "authenticated";


GRANT UPDATE("base_template") ON TABLE "public"."custom_roles" TO "authenticated";


GRANT SELECT,MAINTAIN ON TABLE "public"."disputes" TO "anon";
GRANT SELECT,INSERT,MAINTAIN ON TABLE "public"."disputes" TO "authenticated";
GRANT ALL ON TABLE "public"."disputes" TO "service_role";


GRANT UPDATE("status") ON TABLE "public"."disputes" TO "authenticated";


GRANT UPDATE("resolution") ON TABLE "public"."disputes" TO "authenticated";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."dm_messages" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."dm_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."dm_messages" TO "service_role";


GRANT UPDATE("read_at") ON TABLE "public"."dm_messages" TO "authenticated";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."employees" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."employees" TO "authenticated";
GRANT ALL ON TABLE "public"."employees" TO "service_role";


GRANT UPDATE("status") ON TABLE "public"."employees" TO "authenticated";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."follow_requests" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."follow_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."follow_requests" TO "service_role";


GRANT UPDATE("status") ON TABLE "public"."follow_requests" TO "authenticated";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."follows" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."follows" TO "authenticated";
GRANT ALL ON TABLE "public"."follows" TO "service_role";


GRANT ALL ON TABLE "public"."game_optins" TO "anon";
GRANT ALL ON TABLE "public"."game_optins" TO "authenticated";
GRANT ALL ON TABLE "public"."game_optins" TO "service_role";


GRANT ALL ON TABLE "public"."games" TO "anon";
GRANT ALL ON TABLE "public"."games" TO "authenticated";
GRANT ALL ON TABLE "public"."games" TO "service_role";


GRANT ALL ON TABLE "public"."gift_offers" TO "anon";
GRANT ALL ON TABLE "public"."gift_offers" TO "authenticated";
GRANT ALL ON TABLE "public"."gift_offers" TO "service_role";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."gifts" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."gifts" TO "authenticated";
GRANT ALL ON TABLE "public"."gifts" TO "service_role";


GRANT ALL ON TABLE "public"."guest_code_attempts" TO "service_role";


GRANT ALL ON TABLE "public"."guest_device_blocks" TO "service_role";


GRANT ALL ON TABLE "public"."guest_device_strikes" TO "service_role";


GRANT ALL ON TABLE "public"."guest_order_idempotency" TO "service_role";


GRANT ALL ON TABLE "public"."guest_service_attempts" TO "anon";
GRANT ALL ON TABLE "public"."guest_service_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."guest_service_attempts" TO "service_role";


GRANT ALL ON TABLE "public"."guest_tab_sessions" TO "service_role";


GRANT ALL ON TABLE "public"."interests" TO "anon";
GRANT ALL ON TABLE "public"."interests" TO "authenticated";
GRANT ALL ON TABLE "public"."interests" TO "service_role";


GRANT ALL ON TABLE "public"."inventory_locations" TO "anon";
GRANT ALL ON TABLE "public"."inventory_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_locations" TO "service_role";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."loyalty_points" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."loyalty_points" TO "authenticated";
GRANT ALL ON TABLE "public"."loyalty_points" TO "service_role";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."loyalty_rewards" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."loyalty_rewards" TO "authenticated";
GRANT ALL ON TABLE "public"."loyalty_rewards" TO "service_role";


GRANT UPDATE("is_active") ON TABLE "public"."loyalty_rewards" TO "authenticated";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."loyalty_rules" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."loyalty_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."loyalty_rules" TO "service_role";


GRANT UPDATE("is_active") ON TABLE "public"."loyalty_rules" TO "authenticated";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."loyalty_tiers" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."loyalty_tiers" TO "authenticated";
GRANT ALL ON TABLE "public"."loyalty_tiers" TO "service_role";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."map_reactions" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."map_reactions" TO "authenticated";
GRANT ALL ON TABLE "public"."map_reactions" TO "service_role";


GRANT ALL ON TABLE "public"."match_kicks" TO "anon";
GRANT ALL ON TABLE "public"."match_kicks" TO "authenticated";
GRANT ALL ON TABLE "public"."match_kicks" TO "service_role";


GRANT ALL ON TABLE "public"."match_photos" TO "anon";
GRANT ALL ON TABLE "public"."match_photos" TO "authenticated";
GRANT ALL ON TABLE "public"."match_photos" TO "service_role";


GRANT ALL ON TABLE "public"."match_presence" TO "anon";
GRANT ALL ON TABLE "public"."match_presence" TO "authenticated";
GRANT ALL ON TABLE "public"."match_presence" TO "service_role";


GRANT ALL ON TABLE "public"."match_relikes" TO "anon";
GRANT ALL ON TABLE "public"."match_relikes" TO "authenticated";
GRANT ALL ON TABLE "public"."match_relikes" TO "service_role";


GRANT ALL ON TABLE "public"."match_super_quota" TO "anon";
GRANT ALL ON TABLE "public"."match_super_quota" TO "authenticated";
GRANT ALL ON TABLE "public"."match_super_quota" TO "service_role";


GRANT ALL ON TABLE "public"."match_swipes" TO "anon";
GRANT ALL ON TABLE "public"."match_swipes" TO "authenticated";
GRANT ALL ON TABLE "public"."match_swipes" TO "service_role";


GRANT ALL ON TABLE "public"."matches" TO "anon";
GRANT ALL ON TABLE "public"."matches" TO "authenticated";
GRANT ALL ON TABLE "public"."matches" TO "service_role";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."menu_categories" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."menu_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."menu_categories" TO "service_role";


GRANT UPDATE("name") ON TABLE "public"."menu_categories" TO "authenticated";


GRANT UPDATE("sort") ON TABLE "public"."menu_categories" TO "authenticated";


GRANT UPDATE("icon") ON TABLE "public"."menu_categories" TO "authenticated";


GRANT UPDATE("is_published") ON TABLE "public"."menu_categories" TO "authenticated";


GRANT UPDATE("icon_url") ON TABLE "public"."menu_categories" TO "authenticated";


GRANT ALL ON TABLE "public"."menu_item_costs" TO "authenticated";
GRANT ALL ON TABLE "public"."menu_item_costs" TO "service_role";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."menu_item_modifier_groups" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."menu_item_modifier_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."menu_item_modifier_groups" TO "service_role";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."menu_item_photos" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."menu_item_photos" TO "authenticated";
GRANT ALL ON TABLE "public"."menu_item_photos" TO "service_role";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."menu_items" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."menu_items" TO "authenticated";
GRANT ALL ON TABLE "public"."menu_items" TO "service_role";


GRANT UPDATE("category_id") ON TABLE "public"."menu_items" TO "authenticated";


GRANT UPDATE("business_id") ON TABLE "public"."menu_items" TO "authenticated";


GRANT UPDATE("name") ON TABLE "public"."menu_items" TO "authenticated";


GRANT UPDATE("description") ON TABLE "public"."menu_items" TO "authenticated";


GRANT UPDATE("price_cents") ON TABLE "public"."menu_items" TO "authenticated";


GRANT UPDATE("is_available") ON TABLE "public"."menu_items" TO "authenticated";


GRANT UPDATE("photo_url") ON TABLE "public"."menu_items" TO "authenticated";


GRANT UPDATE("dietary_tags") ON TABLE "public"."menu_items" TO "authenticated";


GRANT UPDATE("id_required") ON TABLE "public"."menu_items" TO "authenticated";


GRANT UPDATE("badge") ON TABLE "public"."menu_items" TO "authenticated";


GRANT UPDATE("is_published") ON TABLE "public"."menu_items" TO "authenticated";


GRANT UPDATE("stock_count") ON TABLE "public"."menu_items" TO "authenticated";


GRANT UPDATE("low_stock_threshold") ON TABLE "public"."menu_items" TO "authenticated";


GRANT UPDATE("options") ON TABLE "public"."menu_items" TO "authenticated";


GRANT SELECT("station"),UPDATE("station") ON TABLE "public"."menu_items" TO "authenticated";
GRANT SELECT("station") ON TABLE "public"."menu_items" TO "anon";


GRANT SELECT("sla"),UPDATE("sla") ON TABLE "public"."menu_items" TO "authenticated";
GRANT SELECT("sla") ON TABLE "public"."menu_items" TO "anon";


GRANT SELECT("images"),UPDATE("images") ON TABLE "public"."menu_items" TO "authenticated";
GRANT SELECT("images") ON TABLE "public"."menu_items" TO "anon";


GRANT SELECT("barcode"),UPDATE("barcode") ON TABLE "public"."menu_items" TO "authenticated";


GRANT UPDATE("par_level") ON TABLE "public"."menu_items" TO "authenticated";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."messages" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."moderation_logs" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."moderation_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."moderation_logs" TO "service_role";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."modifier_groups" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."modifier_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."modifier_groups" TO "service_role";


GRANT UPDATE("label") ON TABLE "public"."modifier_groups" TO "authenticated";


GRANT UPDATE("type") ON TABLE "public"."modifier_groups" TO "authenticated";


GRANT UPDATE("min_select") ON TABLE "public"."modifier_groups" TO "authenticated";


GRANT UPDATE("max_select") ON TABLE "public"."modifier_groups" TO "authenticated";


GRANT UPDATE("choices") ON TABLE "public"."modifier_groups" TO "authenticated";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."notifications" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";


GRANT UPDATE("is_read") ON TABLE "public"."notifications" TO "authenticated";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."offers" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."offers" TO "authenticated";
GRANT ALL ON TABLE "public"."offers" TO "service_role";


GRANT UPDATE("status") ON TABLE "public"."offers" TO "authenticated";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."order_items" TO "anon";
GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."order_items" TO "service_role";


GRANT UPDATE("item_status") ON TABLE "public"."order_items" TO "authenticated";


GRANT SELECT,MAINTAIN ON TABLE "public"."orders" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";


GRANT UPDATE("status") ON TABLE "public"."orders" TO "authenticated";


GRANT UPDATE("status_updated_at") ON TABLE "public"."orders" TO "authenticated";


GRANT ALL ON SEQUENCE "public"."orders_order_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."orders_order_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."orders_order_number_seq" TO "service_role";


GRANT ALL ON TABLE "public"."orphan_payments" TO "service_role";
GRANT SELECT ON TABLE "public"."orphan_payments" TO "authenticated";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."pending_order_carts" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."pending_order_carts" TO "authenticated";
GRANT ALL ON TABLE "public"."pending_order_carts" TO "service_role";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."pinned_messages" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."pinned_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."pinned_messages" TO "service_role";


GRANT UPDATE("pinned_by") ON TABLE "public"."pinned_messages" TO "authenticated";


GRANT UPDATE("expires_at") ON TABLE "public"."pinned_messages" TO "authenticated";


GRANT UPDATE("notify") ON TABLE "public"."pinned_messages" TO "authenticated";


GRANT ALL ON TABLE "public"."platform_config" TO "anon";
GRANT ALL ON TABLE "public"."platform_config" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_config" TO "service_role";


GRANT ALL ON TABLE "public"."pos_payments" TO "anon";
GRANT ALL ON TABLE "public"."pos_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_payments" TO "service_role";


GRANT ALL ON TABLE "public"."pos_pins" TO "anon";
GRANT ALL ON TABLE "public"."pos_pins" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_pins" TO "service_role";


GRANT ALL ON TABLE "public"."pos_printers" TO "anon";
GRANT ALL ON TABLE "public"."pos_printers" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_printers" TO "service_role";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."post_likes" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."post_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."post_likes" TO "service_role";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."posts" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."posts" TO "authenticated";
GRANT ALL ON TABLE "public"."posts" TO "service_role";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."processed_stripe_events" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."processed_stripe_events" TO "authenticated";
GRANT ALL ON TABLE "public"."processed_stripe_events" TO "service_role";


GRANT ALL ON TABLE "public"."product_catalog" TO "anon";
GRANT ALL ON TABLE "public"."product_catalog" TO "authenticated";
GRANT ALL ON TABLE "public"."product_catalog" TO "service_role";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."public_locations" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."public_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."public_locations" TO "service_role";


GRANT UPDATE("name") ON TABLE "public"."public_locations" TO "authenticated";


GRANT UPDATE("type") ON TABLE "public"."public_locations" TO "authenticated";


GRANT UPDATE("lat") ON TABLE "public"."public_locations" TO "authenticated";


GRANT UPDATE("lng") ON TABLE "public"."public_locations" TO "authenticated";


GRANT UPDATE("radius_m") ON TABLE "public"."public_locations" TO "authenticated";


GRANT UPDATE("description") ON TABLE "public"."public_locations" TO "authenticated";


GRANT UPDATE("active_from") ON TABLE "public"."public_locations" TO "authenticated";


GRANT UPDATE("active_to") ON TABLE "public"."public_locations" TO "authenticated";


GRANT UPDATE("is_active") ON TABLE "public"."public_locations" TO "authenticated";


GRANT UPDATE("room_id") ON TABLE "public"."public_locations" TO "authenticated";


GRANT SELECT,MAINTAIN ON TABLE "public"."users" TO "anon";
GRANT SELECT,INSERT,MAINTAIN ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";


GRANT UPDATE("username") ON TABLE "public"."users" TO "authenticated";


GRANT UPDATE("display_name") ON TABLE "public"."users" TO "authenticated";


GRANT UPDATE("avatar_url") ON TABLE "public"."users" TO "authenticated";


GRANT UPDATE("bio") ON TABLE "public"."users" TO "authenticated";


GRANT UPDATE("profile_theme_id") ON TABLE "public"."users" TO "authenticated";


GRANT UPDATE("push_token") ON TABLE "public"."users" TO "authenticated";


GRANT UPDATE("language") ON TABLE "public"."users" TO "authenticated";


GRANT UPDATE("updated_at") ON TABLE "public"."users" TO "authenticated";


GRANT UPDATE("privacy_settings") ON TABLE "public"."users" TO "authenticated";


GRANT UPDATE("onboarding_completed") ON TABLE "public"."users" TO "authenticated";


GRANT UPDATE("city") ON TABLE "public"."users" TO "authenticated";


GRANT UPDATE("cover_url") ON TABLE "public"."users" TO "authenticated";


GRANT UPDATE("settings") ON TABLE "public"."users" TO "authenticated";


GRANT UPDATE("active_business_id") ON TABLE "public"."users" TO "authenticated";


GRANT SELECT,MAINTAIN ON TABLE "public"."public_profiles" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."public_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."public_profiles" TO "service_role";


GRANT ALL ON TABLE "public"."purchase_order_settings" TO "anon";
GRANT ALL ON TABLE "public"."purchase_order_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_order_settings" TO "service_role";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."radius_increase_requests" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."radius_increase_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."radius_increase_requests" TO "service_role";


GRANT UPDATE("status") ON TABLE "public"."radius_increase_requests" TO "authenticated";


GRANT UPDATE("reviewed_by") ON TABLE "public"."radius_increase_requests" TO "authenticated";


GRANT UPDATE("reviewed_at") ON TABLE "public"."radius_increase_requests" TO "authenticated";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."reports" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."reports" TO "authenticated";
GRANT ALL ON TABLE "public"."reports" TO "service_role";


GRANT UPDATE("status") ON TABLE "public"."reports" TO "authenticated";


GRANT ALL ON TABLE "public"."reservation_customers" TO "anon";
GRANT ALL ON TABLE "public"."reservation_customers" TO "authenticated";
GRANT ALL ON TABLE "public"."reservation_customers" TO "service_role";


GRANT ALL ON TABLE "public"."reservation_tables" TO "anon";
GRANT ALL ON TABLE "public"."reservation_tables" TO "authenticated";
GRANT ALL ON TABLE "public"."reservation_tables" TO "service_role";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."reservations" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."reservations" TO "authenticated";
GRANT ALL ON TABLE "public"."reservations" TO "service_role";


GRANT UPDATE("status") ON TABLE "public"."reservations" TO "authenticated";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."reviews" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."reviews" TO "service_role";


GRANT UPDATE("response") ON TABLE "public"."reviews" TO "authenticated";


GRANT UPDATE("responded_at") ON TABLE "public"."reviews" TO "authenticated";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."room_access_attempts" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."room_access_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."room_access_attempts" TO "service_role";


GRANT ALL ON TABLE "public"."room_geo_presence" TO "anon";
GRANT ALL ON TABLE "public"."room_geo_presence" TO "authenticated";
GRANT ALL ON TABLE "public"."room_geo_presence" TO "service_role";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."room_members" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."room_members" TO "authenticated";
GRANT ALL ON TABLE "public"."room_members" TO "service_role";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."room_mutes" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."room_mutes" TO "authenticated";
GRANT ALL ON TABLE "public"."room_mutes" TO "service_role";


GRANT UPDATE("muted_by") ON TABLE "public"."room_mutes" TO "authenticated";


GRANT UPDATE("expires_at") ON TABLE "public"."room_mutes" TO "authenticated";


GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."rooms" TO "anon";
GRANT REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."rooms" TO "service_role";


GRANT SELECT("id") ON TABLE "public"."rooms" TO "anon";
GRANT SELECT("id"),INSERT("id"),UPDATE("id") ON TABLE "public"."rooms" TO "authenticated";


GRANT SELECT("business_id") ON TABLE "public"."rooms" TO "anon";
GRANT SELECT("business_id"),INSERT("business_id"),UPDATE("business_id") ON TABLE "public"."rooms" TO "authenticated";


GRANT SELECT("parent_room_id") ON TABLE "public"."rooms" TO "anon";
GRANT SELECT("parent_room_id"),INSERT("parent_room_id"),UPDATE("parent_room_id") ON TABLE "public"."rooms" TO "authenticated";


GRANT SELECT("name") ON TABLE "public"."rooms" TO "anon";
GRANT SELECT("name"),INSERT("name"),UPDATE("name") ON TABLE "public"."rooms" TO "authenticated";


GRANT SELECT("description") ON TABLE "public"."rooms" TO "anon";
GRANT SELECT("description"),INSERT("description"),UPDATE("description") ON TABLE "public"."rooms" TO "authenticated";


GRANT SELECT("chat_theme_id") ON TABLE "public"."rooms" TO "anon";
GRANT SELECT("chat_theme_id"),INSERT("chat_theme_id"),UPDATE("chat_theme_id") ON TABLE "public"."rooms" TO "authenticated";


GRANT SELECT("is_password_protected") ON TABLE "public"."rooms" TO "anon";
GRANT SELECT("is_password_protected"),INSERT("is_password_protected"),UPDATE("is_password_protected") ON TABLE "public"."rooms" TO "authenticated";


GRANT SELECT("max_occupancy") ON TABLE "public"."rooms" TO "anon";
GRANT SELECT("max_occupancy"),INSERT("max_occupancy"),UPDATE("max_occupancy") ON TABLE "public"."rooms" TO "authenticated";


GRANT SELECT("is_active") ON TABLE "public"."rooms" TO "anon";
GRANT SELECT("is_active"),INSERT("is_active"),UPDATE("is_active") ON TABLE "public"."rooms" TO "authenticated";


GRANT SELECT("created_at") ON TABLE "public"."rooms" TO "anon";
GRANT SELECT("created_at"),INSERT("created_at"),UPDATE("created_at") ON TABLE "public"."rooms" TO "authenticated";


GRANT SELECT("updated_at") ON TABLE "public"."rooms" TO "anon";
GRANT SELECT("updated_at"),INSERT("updated_at"),UPDATE("updated_at") ON TABLE "public"."rooms" TO "authenticated";


GRANT SELECT("icon") ON TABLE "public"."rooms" TO "anon";
GRANT SELECT("icon"),INSERT("icon"),UPDATE("icon") ON TABLE "public"."rooms" TO "authenticated";


GRANT SELECT("color") ON TABLE "public"."rooms" TO "anon";
GRANT SELECT("color"),INSERT("color"),UPDATE("color") ON TABLE "public"."rooms" TO "authenticated";


GRANT SELECT("slug") ON TABLE "public"."rooms" TO "anon";
GRANT SELECT("slug"),INSERT("slug"),UPDATE("slug") ON TABLE "public"."rooms" TO "authenticated";


GRANT SELECT("ttl_hours") ON TABLE "public"."rooms" TO "anon";
GRANT SELECT("ttl_hours"),INSERT("ttl_hours"),UPDATE("ttl_hours") ON TABLE "public"."rooms" TO "authenticated";


GRANT SELECT("notify_enabled") ON TABLE "public"."rooms" TO "anon";
GRANT SELECT("notify_enabled"),INSERT("notify_enabled"),UPDATE("notify_enabled") ON TABLE "public"."rooms" TO "authenticated";


GRANT SELECT("sort") ON TABLE "public"."rooms" TO "anon";
GRANT SELECT("sort"),INSERT("sort"),UPDATE("sort") ON TABLE "public"."rooms" TO "authenticated";


GRANT SELECT("is_main") ON TABLE "public"."rooms" TO "anon";
GRANT SELECT("is_main"),INSERT("is_main"),UPDATE("is_main") ON TABLE "public"."rooms" TO "authenticated";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."security_logs" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."security_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."security_logs" TO "service_role";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."service_calls" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."service_calls" TO "authenticated";
GRANT ALL ON TABLE "public"."service_calls" TO "service_role";


GRANT UPDATE("status") ON TABLE "public"."service_calls" TO "authenticated";


GRANT ALL ON TABLE "public"."stock_by_location" TO "anon";
GRANT ALL ON TABLE "public"."stock_by_location" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_by_location" TO "service_role";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."stock_movements" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."stock_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_movements" TO "service_role";


GRANT SELECT("created_by") ON TABLE "public"."stock_movements" TO "authenticated";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."stories" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."stories" TO "authenticated";
GRANT ALL ON TABLE "public"."stories" TO "service_role";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."story_views" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."story_views" TO "authenticated";
GRANT ALL ON TABLE "public"."story_views" TO "service_role";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."subscriptions" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";


GRANT ALL ON TABLE "public"."suppliers" TO "anon";
GRANT ALL ON TABLE "public"."suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."suppliers" TO "service_role";


GRANT ALL ON TABLE "public"."tab_payments" TO "service_role";
GRANT SELECT ON TABLE "public"."tab_payments" TO "authenticated";


GRANT ALL ON TABLE "public"."table_reservation_log" TO "anon";
GRANT ALL ON TABLE "public"."table_reservation_log" TO "authenticated";
GRANT ALL ON TABLE "public"."table_reservation_log" TO "service_role";


GRANT ALL ON TABLE "public"."table_tabs" TO "service_role";
GRANT SELECT,DELETE ON TABLE "public"."table_tabs" TO "authenticated";


GRANT INSERT("table_id") ON TABLE "public"."table_tabs" TO "authenticated";


GRANT INSERT("name"),UPDATE("name") ON TABLE "public"."table_tabs" TO "authenticated";


GRANT INSERT("owner_uid") ON TABLE "public"."table_tabs" TO "authenticated";


GRANT INSERT("created_by") ON TABLE "public"."table_tabs" TO "authenticated";


GRANT INSERT("kind") ON TABLE "public"."table_tabs" TO "authenticated";


GRANT UPDATE("status") ON TABLE "public"."table_tabs" TO "authenticated";


GRANT UPDATE("paid_at") ON TABLE "public"."table_tabs" TO "authenticated";


GRANT UPDATE("closed_at") ON TABLE "public"."table_tabs" TO "authenticated";


GRANT UPDATE("closed_by") ON TABLE "public"."table_tabs" TO "authenticated";


GRANT ALL ON TABLE "public"."table_waiters" TO "service_role";
GRANT SELECT,DELETE ON TABLE "public"."table_waiters" TO "authenticated";


GRANT INSERT("table_id") ON TABLE "public"."table_waiters" TO "authenticated";


GRANT INSERT("employee_id") ON TABLE "public"."table_waiters" TO "authenticated";


GRANT ALL ON TABLE "public"."tables" TO "service_role";
GRANT SELECT,DELETE ON TABLE "public"."tables" TO "authenticated";


GRANT INSERT("business_id") ON TABLE "public"."tables" TO "authenticated";


GRANT INSERT("label"),UPDATE("label") ON TABLE "public"."tables" TO "authenticated";


GRANT INSERT("floor"),UPDATE("floor") ON TABLE "public"."tables" TO "authenticated";


GRANT INSERT("seats"),UPDATE("seats") ON TABLE "public"."tables" TO "authenticated";


GRANT INSERT("sort"),UPDATE("sort") ON TABLE "public"."tables" TO "authenticated";


GRANT INSERT("is_active"),UPDATE("is_active") ON TABLE "public"."tables" TO "authenticated";


GRANT UPDATE("is_reserved") ON TABLE "public"."tables" TO "authenticated";


GRANT UPDATE("reserved_note") ON TABLE "public"."tables" TO "authenticated";


GRANT UPDATE("reserved_until") ON TABLE "public"."tables" TO "authenticated";


GRANT ALL ON TABLE "public"."tod_cards" TO "anon";
GRANT ALL ON TABLE "public"."tod_cards" TO "authenticated";
GRANT ALL ON TABLE "public"."tod_cards" TO "service_role";


GRANT ALL ON TABLE "public"."tod_draws" TO "anon";
GRANT ALL ON TABLE "public"."tod_draws" TO "authenticated";
GRANT ALL ON TABLE "public"."tod_draws" TO "service_role";


GRANT ALL ON TABLE "public"."tod_kicks" TO "anon";
GRANT ALL ON TABLE "public"."tod_kicks" TO "authenticated";
GRANT ALL ON TABLE "public"."tod_kicks" TO "service_role";


GRANT ALL ON TABLE "public"."tod_moderation_log" TO "anon";
GRANT ALL ON TABLE "public"."tod_moderation_log" TO "authenticated";
GRANT ALL ON TABLE "public"."tod_moderation_log" TO "service_role";


GRANT ALL ON TABLE "public"."tod_rounds" TO "anon";
GRANT ALL ON TABLE "public"."tod_rounds" TO "authenticated";
GRANT ALL ON TABLE "public"."tod_rounds" TO "service_role";


GRANT ALL ON TABLE "public"."tod_settings" TO "anon";
GRANT ALL ON TABLE "public"."tod_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."tod_settings" TO "service_role";


GRANT ALL ON TABLE "public"."tod_terms" TO "anon";
GRANT ALL ON TABLE "public"."tod_terms" TO "authenticated";
GRANT ALL ON TABLE "public"."tod_terms" TO "service_role";


GRANT ALL ON TABLE "public"."tod_votes" TO "anon";
GRANT ALL ON TABLE "public"."tod_votes" TO "authenticated";
GRANT ALL ON TABLE "public"."tod_votes" TO "service_role";


GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."trials" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."trials" TO "authenticated";
GRANT ALL ON TABLE "public"."trials" TO "service_role";


GRANT ALL ON TABLE "public"."us_sales_tax_rates" TO "anon";
GRANT ALL ON TABLE "public"."us_sales_tax_rates" TO "authenticated";
GRANT ALL ON TABLE "public"."us_sales_tax_rates" TO "service_role";


GRANT ALL ON TABLE "public"."user_interests" TO "anon";
GRANT ALL ON TABLE "public"."user_interests" TO "authenticated";
GRANT ALL ON TABLE "public"."user_interests" TO "service_role";


GRANT ALL ON TABLE "public"."venue_exits" TO "service_role";


ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



