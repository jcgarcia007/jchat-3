-- 120_product_catalog.sql
-- Product catalog — global beverage reference catalog seeded via ETL (scripts/etl/import-off-beverages.ts).
-- Stores normalised Open Food Facts data; businesses link their menu items to these rows.
--
-- Idempotent: uses CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- Assumes: set_updated_at() function already exists (migration 001_initial_schema.sql).

-- ─── Table ────────────────────────────────────────────────────────────────────

create table if not exists public.product_catalog (
  id          uuid        primary key default gen_random_uuid(),

  -- Classification
  category    text        not null,               -- mapped value: aguas/refrescos/jugos/energéticas/cervezas/vinos/licores/cafés/tés/lácteos/bebidas
  subcategory text,                               -- optional: ron/vodka/whisky/tequila/ginebra/brandy/mezcal/sidra/cocktail

  -- Product identity
  brand       text,
  name        text        not null,

  -- Packaging / size
  size_value  numeric,                            -- numeric part of quantity (e.g. 330, 1.5)
  size_unit   text,                               -- normalised unit (ml / l / fl oz / oz / cl / gal)
  packaging   text,                               -- free-form OFF packaging string

  -- References
  barcode     text,                               -- UPC/EAN barcode (= source_id for OFF)
  image_url   text,                               -- product image (NULL in v1; populated in v2)

  -- Provenance
  country     text        default 'US',           -- market the product was sourced for
  source      text        not null default 'off', -- 'off' | 'manual' | future sources
  source_id   text,                               -- external key within source (OFF = barcode)

  -- Status
  verified    boolean     default false,          -- manually reviewed / curated
  is_active   boolean     default true,

  -- Timestamps
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

comment on table public.product_catalog is
  'Global beverage reference catalog. Seeded from Open Food Facts (ETL). '
  'Businesses can link menu items to verified rows or create their own entries (source=manual).';

-- ─── Indexes ──────────────────────────────────────────────────────────────────

-- Unique per external source record — enables idempotent upsert from ETL.
-- Partial: only when source_id is not null (manual entries may omit it).
create unique index if not exists product_catalog_source_ux
  on public.product_catalog (source, source_id)
  where source_id is not null;

-- Unique per barcode — prevents duplicate products regardless of source.
-- Partial: only when barcode is not null.
create unique index if not exists product_catalog_barcode_ux
  on public.product_catalog (barcode)
  where barcode is not null;

-- Common query pattern: filter by category + brand (menu search, curate page).
create index if not exists product_catalog_cat_brand_ix
  on public.product_catalog (category, brand);

-- Common query pattern: filter active products for a specific market.
create index if not exists product_catalog_country_active_ix
  on public.product_catalog (country)
  where is_active;

-- ─── RLS ─────────────────────────────────────────────────────────────────────

alter table public.product_catalog enable row level security;

-- Authenticated users can browse active catalog entries (read-only).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'product_catalog'
      and policyname = 'authenticated users can read active products'
  ) then
    execute $policy$
      create policy "authenticated users can read active products"
        on public.product_catalog
        for select
        to authenticated
        using (is_active = true)
    $policy$;
  end if;
end;
$$;

-- Super-admins (service role) can manage the catalog (insert/update/delete).
-- The service role bypasses RLS entirely, so no explicit policy is needed.
-- If a future admin role is created, add an UPDATE/INSERT policy here.

-- ─── ETL helper RPC ──────────────────────────────────────────────────────────
-- upsert_catalog_batch: accepts a JSON array of product rows and performs an
-- idempotent INSERT … ON CONFLICT DO UPDATE respecting the partial unique index.
-- Called by scripts/etl/import-off-beverages.ts (service-role key bypasses RLS).
-- Also exposed to authenticated users if an admin UI needs server-side upsert.
--
-- Note: PostgREST cannot reference partial indexes (WHERE-clause indexes) in its
-- built-in upsert, so this function is needed for correct conflict resolution.

create or replace function public.upsert_catalog_batch(rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  insert into public.product_catalog (
    barcode, source_id, source, country,
    name, brand,
    size_value, size_unit, packaging,
    category, subcategory,
    image_url, verified, is_active, updated_at
  )
  select
    r->>'barcode',
    r->>'source_id',
    coalesce(r->>'source',  'off'),
    coalesce(r->>'country', 'US'),
    r->>'name',
    r->>'brand',
    nullif(r->>'size_value', '')::numeric,
    nullif(r->>'size_unit',  ''),
    nullif(r->>'packaging',  ''),
    r->>'category',
    nullif(r->>'subcategory',''),
    nullif(r->>'image_url',  ''),
    coalesce((r->>'verified')::boolean,  false),
    coalesce((r->>'is_active')::boolean, true),
    coalesce((r->>'updated_at')::timestamptz, now())
  from jsonb_array_elements(rows) as r
  on conflict (source, source_id) where source_id is not null
  do update set
    barcode     = excluded.barcode,
    name        = excluded.name,
    brand       = excluded.brand,
    size_value  = excluded.size_value,
    size_unit   = excluded.size_unit,
    packaging   = excluded.packaging,
    category    = excluded.category,
    subcategory = excluded.subcategory,
    image_url   = excluded.image_url,
    updated_at  = excluded.updated_at;

  get diagnostics n = row_count;
  return n;
end;
$$;

-- Grant to authenticated so a future admin panel can call this without service role.
grant execute on function public.upsert_catalog_batch(jsonb) to authenticated;

-- ─── updated_at trigger ───────────────────────────────────────────────────────
-- set_updated_at() was defined in 001_initial_schema.sql; just attach the trigger.

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname    = 'trg_product_catalog_updated_at'
      and tgrelid   = 'public.product_catalog'::regclass
  ) then
    create trigger trg_product_catalog_updated_at
      before update on public.product_catalog
      for each row execute function set_updated_at();
  end if;
end;
$$;
