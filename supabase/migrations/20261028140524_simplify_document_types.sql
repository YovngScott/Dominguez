-- Los tipos heredados se conservan para no romper documentos ya cargados,
-- pero la interfaz solo muestra el catálogo específico definido abajo.
insert into public.tipos_documento (nombre, orden) values
  ('Cotización del taller', 1),
  ('AJUSTE TÉCNICO', 2),
  ('ORDEN DE PIEZAS DAP', 3),
  ('ORDEN DE PIEZAS SUPLIDOR', 4),
  ('ORDEN DE MANO DE OBRA DAP', 5),
  ('CONDUCE', 6)
on conflict (nombre) do update set orden = excluded.orden;

update public.tipos_documento
set orden = case
  when nombre = 'Cotización del seguro' then 90
  when nombre = 'Otro' then 91
  else orden
end
where nombre in ('Cotización del seguro', 'Otro');
