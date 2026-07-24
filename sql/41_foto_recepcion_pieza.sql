-- Evidencia fotográfica de la pieza cuando llega al almacén y se marca
-- con el check de recibida. La imagen vive en Storage; aquí solo se guarda
-- su ruta liviana.
-- Ejecutar una vez en el SQL Editor de Supabase.
alter table piezas_recibidas
  add column if not exists foto_recibida_path text;
