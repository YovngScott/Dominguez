-- =========================================================
-- 05_migracion_estados.sql  (versión definitiva)
-- Convierte la columna "estado" de enum a TEXTO libre y la normaliza a las
-- dos categorías del taller. Es más simple y robusto que un enum: cualquier
-- valor nuevo funciona sin volver a tocar la base de datos.
--
-- ▶ Ejecuta TODO este archivo UNA sola vez en el SQL Editor de Supabase.
-- =========================================================

-- 1) Quita el valor por defecto que dependía del enum.
alter table casos alter column estado drop default;

-- 2) Convierte la columna a texto.
alter table casos alter column estado type text using estado::text;

-- 3) Normaliza: todo lo que no sea "listo" o "entregado" pasa a "en espera".
update casos set estado = 'en_espera_piezas'
  where estado is null
     or estado not in ('listo_para_trabajar', 'entregado');

-- 4) Nuevo valor por defecto y validación de valores permitidos.
alter table casos alter column estado set default 'en_espera_piezas';

alter table casos drop constraint if exists casos_estado_check;
alter table casos add constraint casos_estado_check
  check (estado in ('en_espera_piezas', 'listo_para_trabajar', 'entregado'));
