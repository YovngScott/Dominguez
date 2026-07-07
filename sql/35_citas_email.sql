-- Guarda el correo del cliente en la cita (lo usa el aviso de confirmación de
-- las solicitudes web). Ejecutar una vez en el SQL Editor de Supabase.
alter table citas add column if not exists email text;
