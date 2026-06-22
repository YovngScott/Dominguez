-- =========================================================
-- 14_estado_en_taller.sql
-- Agrega "vehiculo_en_taller" a los valores permitidos en casos.estado
-- (nueva categoría: el vehículo ya está físicamente en el taller).
-- Ejecutar una vez.
-- =========================================================

alter table casos drop constraint if exists casos_estado_check;
alter table casos add constraint casos_estado_check
  check (estado in ('en_espera_piezas', 'listo_para_trabajar', 'vehiculo_en_taller', 'entregado'));
