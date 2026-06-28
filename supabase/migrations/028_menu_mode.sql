-- Migration 028: menu_mode + external_menu_url on businesses
-- menu_mode: how the owner's menu is served
--   'none'     = no menu configured (default)
--   'external' = owner pastes a link to their own menu (e.g. PDF, Linktree, etc.)
--   'web'      = owner built a menu with the JChat template editor (future)
-- external_menu_url: the URL pasted by the owner when menu_mode = 'external'
-- NOTE: menu_enabled (boolean) is a separate field that controls whether the
--       menu icon appears in the chat room. This migration does NOT touch it.

alter table public.businesses
  add column if not exists menu_mode text not null default 'none'
    check (menu_mode in ('none', 'external', 'web')),
  add column if not exists external_menu_url text;

comment on column public.businesses.menu_mode is
  'How the owner''s menu is served: none | external (link) | web (template editor, future)';

comment on column public.businesses.external_menu_url is
  'URL of the owner''s external menu. Only used when menu_mode = ''external''. Must start with http:// or https://.';
