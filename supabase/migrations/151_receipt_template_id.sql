alter table public.businesses
  add column if not exists receipt_template_id text not null default 'modern';
