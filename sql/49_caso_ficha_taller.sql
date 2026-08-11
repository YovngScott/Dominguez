-- =========================================================
-- 49_caso_ficha_taller.sql
-- Guarda cómo quedó armada la ficha de taller de cada vehículo: qué
-- cotizaciones se dejaron fuera, qué líneas se quitaron y qué piezas y
-- trabajos se escribieron a mano. Así al reimprimir la ficha no hay que
-- volver a escribir todo.
--
-- Se guarda como jsonb en el propio caso (es un dato del vehículo, no una
-- tabla aparte):
--   { "desmarcadas": [uuid...], "quitadas": ["clave"...],
--     "piezas": [{"nombre":"...","cantidad":1}],
--     "mano":   [{"descripcion":"...","cantidad":1}] }
--
-- Se guardan las cotizaciones DESMARCADAS (no las marcadas) a propósito:
-- así una cotización nueva entra sola en la ficha sin tener que marcarla.
-- ▶ Ejecuta TODO este archivo UNA vez en el SQL Editor de Supabase.
-- =========================================================

alter table casos add column if not exists ficha_taller jsonb;
