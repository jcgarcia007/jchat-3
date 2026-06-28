-- Migration 029: menu_item_photos — multiple photos per menu item
-- Adds a separate table so each item can have 1-N photos stored in Storage bucket 'menu-photos'.
-- menu_items.photo_url is kept for backwards compatibility and is kept in sync with sort=0 photo.
-- RLS pattern mirrors menu_items/menu_categories exactly:
--   SELECT: true (fully public — menu photos are not sensitive)
--   ALL:    business owner only (EXISTS check via businesses.owner_id)

create table if not exists public.menu_item_photos (
  id            uuid        primary key default gen_random_uuid(),
  menu_item_id  uuid        not null references public.menu_items(id) on delete cascade,
  business_id   uuid        not null references public.businesses(id) on delete cascade,
  url           text        not null,
  storage_path  text,
  sort          integer     not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists menu_item_photos_item_sort_idx on public.menu_item_photos(menu_item_id, sort);
create index if not exists menu_item_photos_business_idx  on public.menu_item_photos(business_id);

alter table public.menu_item_photos enable row level security;

-- Public can read all photos (same as menu_items: public read)
create policy "menu_item_photos: public read"
  on public.menu_item_photos for select
  using (true);

-- Business owner can insert/update/delete their own item photos
create policy "menu_item_photos: business owner manage"
  on public.menu_item_photos for all
  using (
    exists (
      select 1 from public.businesses b
      where b.id = menu_item_photos.business_id
        and b.owner_id = auth.uid()
    )
  );
