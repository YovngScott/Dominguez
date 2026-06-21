-- =========================================================
-- 17_categorias_danos_ingreso.sql
-- Reorganiza las categorías de foto del caso. Estado final:
--   1. Daños    → fotos al cotizar el vehículo (daños del choque)
--   2. Ingreso  → fotos cuando llegan las piezas y el vehículo
--                 se queda en el taller
--   3. Entrega / Finalizado
-- Se eliminan "Cotización de piezas" y "Proceso".
-- Las fotos existentes se conservan (las de "Daños / Ingreso" pasan a
-- "Daños"; si alguna estaba en las categorías eliminadas, se reasigna a
-- "Daños" para no perderla).
-- ▶ Ejecuta TODO este archivo UNA vez en el SQL Editor de Supabase.
-- =========================================================

-- 1) La categoría combinada pasa a ser solo "Daños".
update categorias_foto set nombre = 'Daños', orden = 1 where nombre = 'Daños / Ingreso';

-- 2) Reasigna a "Daños" cualquier foto que estuviera en las categorías a eliminar.
update fotos_caso
   set categoria_id = (select id from categorias_foto where nombre = 'Daños' limit 1)
 where categoria_id in (
   select id from categorias_foto where nombre in ('Cotización de piezas', 'Proceso')
 );

-- 3) Elimina las categorías que ya no se usan.
delete from categorias_foto where nombre in ('Cotización de piezas', 'Proceso');

-- 4) Crea "Ingreso" y deja el orden final (Daños, Ingreso, Entrega/Finalizado).
insert into categorias_foto (nombre, orden) values ('Ingreso', 2)
on conflict (nombre) do nothing;
update categorias_foto set orden = 2 where nombre = 'Ingreso';
update categorias_foto set orden = 3 where nombre = 'Entrega / Finalizado';
