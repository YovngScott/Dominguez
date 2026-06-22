-- =========================================================
-- 21_firma_cliente_caso.sql
-- Guarda la firma que el cliente hace con el dedo en la tablet al crear
-- la cotización. Esa firma no se usa en el PDF de la cotización: se
-- reutiliza después en el PDF del recibo (orden de reparación), igual que
-- el sello del taller.
-- ▶ Ejecuta UNA vez en el SQL Editor de Supabase.
-- =========================================================

alter table casos add column if not exists firma_cliente_url text;
