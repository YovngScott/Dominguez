-- =========================================================
-- 53_completar_generales_antiguos.sql
-- Organiza los expedientes creados al cotizar bajo GENERAL.
-- Los casos generales con más de un mes se conservan, pero pasan a
-- "completado" para que no se mezclen con el trabajo operativo.
-- ▶ Ejecutar UNA vez en el SQL Editor de Supabase.
-- =========================================================

update casos as c
set estado = 'completado'
from aseguradoras as a
where a.id = c.aseguradora_id
  and a.es_personal = true
  and c.fecha_ingreso < current_date - interval '1 month'
  and c.estado not in ('completado', 'entregado');
