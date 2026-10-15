insert into public.tipos_documento (nombre, orden) values
  ('CONDUCE', 6),
  ('Otro', 7)
on conflict (nombre) do update set orden = excluded.orden;
