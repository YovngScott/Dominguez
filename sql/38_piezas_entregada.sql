-- Marca cuándo una pieza recibida fue ENTREGADA (a un reparador). Una pieza
-- entregada sigue apareciendo tachada en la lista, pero ya no ocupa un espacio
-- en el anaquel (deja de mostrarse en Tramos). Ejecutar una vez en Supabase.
alter table piezas_recibidas add column if not exists entregada_at timestamptz;
