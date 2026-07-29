-- =========================================================
-- 47_trabajo_nota.sql
-- Nota del trabajo realizado: al marcar un vehículo como completado, el
-- trabajador (o quien registra) anota QUÉ le hizo. Así el reporte no solo
-- dice cuántos vehículos reparó, sino qué trabajo hizo en cada uno.
-- ▶ Ejecuta UNA vez en el SQL Editor de Supabase.
-- =========================================================

alter table casos_trabajadores add column if not exists nota text;

-- Para poder filtrar el reporte por rango de fechas sin escanear toda la tabla.
create index if not exists idx_casos_trabajadores_completado
  on casos_trabajadores (completado_at desc)
  where estado = 'completado';
