-- =========================================================
-- 28_etiqueta_caso.sql
-- Vincula cada etiqueta de piezas al caso (vehículo) que crea/usa. Así el QR
-- de la etiqueta puede llevar al caso, y al reimprimir desde el historial el
-- QR sigue apuntando al mismo caso.
-- ▶ Ejecuta UNA vez en el SQL Editor de Supabase.
-- =========================================================

alter table etiquetas_piezas add column if not exists caso_id uuid references casos(id) on delete set null;
alter table etiquetas_piezas add column if not exists cliente_nombre text;
alter table etiquetas_piezas add column if not exists telefono text;
