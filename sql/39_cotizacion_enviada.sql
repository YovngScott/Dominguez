-- Marca cuándo se envió por correo una cotización (y a cuántos destinatarios),
-- para mostrar el indicador "Enviada" en la lista sin tener que abrirla.
-- Ejecutar una vez en el SQL Editor de Supabase.
alter table cotizaciones add column if not exists enviada_at timestamptz;
alter table cotizaciones add column if not exists enviada_a int;
