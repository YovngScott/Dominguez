-- =========================================================
-- 27_piezas_tramo.sql
-- Ubicación física (tramo/anaquel) de cada pieza recibida. El anaquel es por
-- aseguradora (la del caso) y tiene 12 espacios: A1..A3 / B1..B3 / C1..C3 /
-- D1..D3. Aquí solo se guarda el espacio (ej. "B2"); la aseguradora se deduce
-- del caso.
-- ▶ Ejecuta UNA vez en el SQL Editor de Supabase.
-- =========================================================

alter table piezas_recibidas add column if not exists tramo text;
