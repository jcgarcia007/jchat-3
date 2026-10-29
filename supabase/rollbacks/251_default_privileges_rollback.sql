-- 251 — REVERSIÓN: quita el event trigger y su función. La aplica Juan Carlos solo si hay que deshacer la 251.
-- No devuelve ningún permiso: las tablas que el trigger ya limpió se quedan limpias (si algún día hiciera falta, un `grant` explícito).
drop event trigger if exists revoke_dangerous_table_grants;
drop function if exists public.revoke_dangerous_table_grants();
