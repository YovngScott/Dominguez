-- =========================================================
-- 14_aseguradoras_ochoa_viamar.sql
-- Agrega Ochoa y Viamar como aseguradoras, manteniendo la
-- categoría "Personal" al final del listado.
-- ▶ Ejecuta TODO este archivo UNA vez en el SQL Editor de Supabase.
-- =========================================================

-- "Personal" pasa al final para que las dos nuevas queden antes.
update aseguradoras set orden = 10 where nombre = 'Personal';

insert into aseguradoras (nombre, es_personal, orden) values
  ('Ochoa', false, 8),
  ('Viamar', false, 9)
on conflict (nombre) do nothing;
