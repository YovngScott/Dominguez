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
  ('Daños', 1),                 -- fotos al cotizar (daños del choque)
  ('Ingreso', 2),               -- fotos cuando llegan las piezas y entra al taller
  ('Entrega / Finalizado', 3)
on conflict (nombre) do nothing;

insert into tipos_documento (nombre, orden) values
  ('Cotización del taller', 1),
  ('Cotización del seguro', 2),
  ('Otro', 3)
on conflict (nombre) do nothing;
