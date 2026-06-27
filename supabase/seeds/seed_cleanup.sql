-- ============================================================
-- JChat 3.0 — Seed cleanup (MIRROR of seed_demo.sql)
--
-- Deletes ALL demo/seed data in correct FK order.
-- Criteria: email domain @seed.jchat.test + slug prefix seed-
-- NEVER touches real data. Safe to re-run (idempotent).
--
-- Dry-run (see what would be deleted WITHOUT deleting):
--   Set DRY_RUN = true below, then run.
-- Execute (actually delete):
--   Set DRY_RUN = false (default), then run.
-- ============================================================

DO $$
DECLARE
  dry_run CONSTANT boolean := false;  -- SET TO true FOR DRY-RUN
  cnt integer;
BEGIN

  -- ── Counts before deletion ─────────────────────────────────────────────────
  SELECT count(*) INTO cnt FROM public.messages m
    JOIN public.rooms r ON r.id = m.room_id
    JOIN public.businesses b ON b.id = r.business_id
    WHERE b.slug LIKE 'seed-%';
  RAISE NOTICE '[SEED CLEANUP] messages to delete: %', cnt;

  SELECT count(*) INTO cnt FROM public.room_members rm
    JOIN public.rooms r ON r.id = rm.room_id
    JOIN public.businesses b ON b.id = r.business_id
    WHERE b.slug LIKE 'seed-%';
  RAISE NOTICE '[SEED CLEANUP] room_members to delete: %', cnt;

  SELECT count(*) INTO cnt FROM public.rooms r
    JOIN public.businesses b ON b.id = r.business_id
    WHERE b.slug LIKE 'seed-%';
  RAISE NOTICE '[SEED CLEANUP] rooms to delete: %', cnt;

  SELECT count(*) INTO cnt FROM public.businesses WHERE slug LIKE 'seed-%';
  RAISE NOTICE '[SEED CLEANUP] businesses to delete: %', cnt;

  SELECT count(*) INTO cnt FROM auth.users WHERE email LIKE '%@seed.jchat.test';
  RAISE NOTICE '[SEED CLEANUP] auth.users to delete: %', cnt;

  IF dry_run THEN
    RAISE NOTICE '[SEED CLEANUP] DRY RUN — nothing deleted. Set dry_run=false to execute.';
    RETURN;
  END IF;

  -- ── 1. Messages ────────────────────────────────────────────────────────────
  DELETE FROM public.messages
  WHERE room_id IN (
    SELECT r.id FROM public.rooms r
    JOIN public.businesses b ON b.id = r.business_id
    WHERE b.slug LIKE 'seed-%'
  );
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RAISE NOTICE '[SEED CLEANUP] deleted % messages', cnt;

  -- ── 2. Room members ────────────────────────────────────────────────────────
  DELETE FROM public.room_members
  WHERE room_id IN (
    SELECT r.id FROM public.rooms r
    JOIN public.businesses b ON b.id = r.business_id
    WHERE b.slug LIKE 'seed-%'
  );
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RAISE NOTICE '[SEED CLEANUP] deleted % room_members', cnt;

  -- ── 3. Sub-rooms (parent_room_id NOT NULL) first, then main rooms ──────────
  DELETE FROM public.rooms
  WHERE business_id IN (SELECT id FROM public.businesses WHERE slug LIKE 'seed-%')
    AND parent_room_id IS NOT NULL;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RAISE NOTICE '[SEED CLEANUP] deleted % sub-rooms', cnt;

  DELETE FROM public.rooms
  WHERE business_id IN (SELECT id FROM public.businesses WHERE slug LIKE 'seed-%');
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RAISE NOTICE '[SEED CLEANUP] deleted % main rooms', cnt;

  -- ── 4. Businesses ──────────────────────────────────────────────────────────
  DELETE FROM public.businesses WHERE slug LIKE 'seed-%';
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RAISE NOTICE '[SEED CLEANUP] deleted % businesses', cnt;

  -- ── 5. public.users ────────────────────────────────────────────────────────
  DELETE FROM public.users
  WHERE id IN (
    SELECT id FROM auth.users WHERE email LIKE '%@seed.jchat.test'
  );
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RAISE NOTICE '[SEED CLEANUP] deleted % public.users', cnt;

  -- ── 6. auth.users ─────────────────────────────────────────────────────────
  DELETE FROM auth.users WHERE email LIKE '%@seed.jchat.test';
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RAISE NOTICE '[SEED CLEANUP] deleted % auth.users', cnt;

  RAISE NOTICE '[SEED CLEANUP] DONE — all seed data removed.';
END $$;
