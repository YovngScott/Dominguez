-- =========================================================
-- 11_caso_suplidor.sql
-- Suplidor de las piezas del caso (útil sobre todo cuando pasa a
-- "Listos para trabajar"). Ejecutar UNA vez en el SQL Editor.
-- =========================================================

alter table casos add column if not exists suplidor text;
