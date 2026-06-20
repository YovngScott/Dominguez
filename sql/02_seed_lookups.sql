-- =========================================================
-- 02_seed_lookups.sql
-- Datos iniciales: aseguradoras, categorías de foto y tipos de documento
-- =========================================================

insert into aseguradoras (nombre, es_personal, orden) values
  ('Reservas', false, 1),
  ('Colonial', false, 2),
  ('Atlántica', false, 3),
  ('Coop-Seguro', false, 4),
  ('Sura', false, 5),
  ('Internacional', false, 6),
  ('Personal', true, 7)
on conflict (nombre) do nothing;

insert into categorias_foto (nombre, orden) values
  ('Daños / Ingreso', 1),
  ('Cotización de piezas', 2),
  ('Proceso', 3),
  ('Entrega / Finalizado', 4)
on conflict (nombre) do nothing;

insert into tipos_documento (nombre, orden) values
  ('Cotización del taller', 1),
  ('Cotización del seguro', 2),
  ('Otro', 3)
on conflict (nombre) do nothing;
