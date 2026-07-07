-- Marca de dónde vino la cita: "interno" (creada por el taller) o "web"
-- (solicitud del cliente desde la página pública). Ejecutar una vez en Supabase.
alter table citas add column if not exists origen text not null default 'interno';
