insert into public.tipos_documento (nombre, orden) values
  ('ORDEN DE PIEZAS DAP', 3),
  ('ORDEN DE PIEZAS SUPLIDOR', 4),
  ('ORDEN DE MANO DE OBRA DAP', 5),
  ('Otro', 6)
on conflict (nombre) do update set orden = excluded.orden;
