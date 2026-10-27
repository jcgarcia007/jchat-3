-- ============================================================
-- JChat 3.0 — i18n foundation (Tanda 1A) — BD
-- Reusa users.language (ya existe, default 'en'); solo añade un CHECK (en/es).
-- Añade las columnas que Tanda 1B (traducción de menú, web) usará. No toca datos
-- ni el default de users.language. Verificado: users.language ∈ {en(34), es(25)}.
--
-- Las columnas de menú (menu_language_mode / menu_primary_language / *_alt) se
-- crean aquí pero se CABLEAN en Tanda 1B — defaults conservadores y ajustables.
-- ============================================================

-- users.language: solo CHECK (datos ya válidos)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'users_language_check' and conrelid = 'public.users'::regclass
  ) then
    alter table public.users add constraint users_language_check check (language in ('en', 'es'));
  end if;
end $$;

-- businesses: modo de idioma del menú + idioma primario (Tanda 1B)
alter table public.businesses add column if not exists menu_language_mode   text not null default 'single';
alter table public.businesses add column if not exists menu_primary_language text not null default 'en';
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'businesses_menu_language_mode_check' and conrelid = 'public.businesses'::regclass
  ) then
    alter table public.businesses add constraint businesses_menu_language_mode_check
      check (menu_language_mode in ('single', 'dual'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'businesses_menu_primary_language_check' and conrelid = 'public.businesses'::regclass
  ) then
    alter table public.businesses add constraint businesses_menu_primary_language_check
      check (menu_primary_language in ('en', 'es'));
  end if;
end $$;

-- Contenido en idioma alterno (Tanda 1B — traducción de menú). Nullable.
alter table public.menu_items      add column if not exists name_alt        text;
alter table public.menu_items      add column if not exists description_alt text;
alter table public.menu_categories add column if not exists name_alt        text;
alter table public.modifier_groups add column if not exists label_alt       text;
