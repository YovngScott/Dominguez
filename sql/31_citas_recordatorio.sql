-- Marca cuándo se envió el recordatorio de WhatsApp del día antes, para no
-- reenviarlo. Ejecutar una sola vez en Supabase.
alter table citas add column if not exists recordatorio_enviado_at timestamptz;
