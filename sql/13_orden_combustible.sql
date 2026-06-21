-- =========================================================
-- 13_orden_combustible.sql
-- Tipo de combustible en la orden de reparación (Gasolina/Diesel/Gas).
-- Ejecutar UNA vez en el SQL Editor.
-- =========================================================

alter table ordenes_reparacion add column if not exists tipo_combustible text;
