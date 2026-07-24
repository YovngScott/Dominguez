-- Guarda la evidencia fotográfica cuando una pieza se entrega a un reparador.
-- La imagen vive en Storage; esta columna solo conserva su ruta liviana.
-- Ejecutar una vez en el SQL Editor de Supabase.
alter table piezas_recibidas
  add column if not exists foto_entrega_path text;
