-- 183: funciones SECURITY DEFINER que no deben poder llamarse sin sesión.
-- Se quita EXECUTE a PUBLIC y anon, y se concede explícitamente a authenticated y service_role
-- (el permiso venía de PUBLIC, por eso no bastaba con quitárselo a anon).
-- Se MANTIENEN abiertas a anon (páginas públicas / políticas): get_public_receipt, get_table_order_status,
-- resolve_room_qr, resolve_table_qr, resolve_tab_payment, username_available, is_platform_admin.

do $$
declare
  f text;
  fns text[] := array[
    'public.affiliate_summary()',
    'public.affiliate_yearly_payouts(integer)',
    'public.can_access_room(uuid)',
    'public.can_view_profile(uuid, uuid)',
    'public.can_view_user_content(uuid, uuid, text)',
    'public.check_geofence_and_join_room(uuid, double precision, double precision)',
    'public.inv_can_manage(uuid)',
    'public.is_blocked(uuid, uuid)',
    'public.join_room_via_qr(text)',
    'public.pos_can_access(uuid)',
    'public.pos_combine_tables(uuid, uuid, uuid)',
    'public.pos_create_check(uuid, uuid, uuid[])',
    'public.pos_create_order(uuid, uuid, jsonb, text)',
    'public.pos_create_split(uuid, uuid, text, integer, jsonb)',
    'public.pos_kds_settings(uuid)',
    'public.pos_my_businesses()',
    'public.pos_set_party_size(uuid, uuid, integer)',
    'public.pos_set_pin(uuid, text)',
    'public.pos_uncombine_table(uuid, uuid)',
    'public.pos_verify_pin(uuid, text)',
    'public.pos_void_order(uuid, uuid)',
    'public.record_affiliate_payout(uuid, uuid[], text, text, text)',
    'public.verify_room_password(uuid, text)'
  ];
  trg text[] := array[
    'public.auto_uncombine_on_tab_close()',
    'public.notify_low_stock()',
    'public.sbl_sync_total()',
    'public.trg_deactivate_table_subchat()',
    'public.trg_fn_table_session_autoclose()'
  ];
begin
  foreach f in array fns loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  -- Funciones de trigger: nadie necesita llamarlas directo (los triggers se disparan igual)
  foreach f in array trg loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
