-- =========================================================
-- 53_completar_generales_antiguos.sql
-- Organiza los expedientes creados al cotizar bajo GENERAL.
-- Los casos generales con más de un mes se conservan, pero pasan a
-- "entregado" para que no se mezclen con el trabajo operativo ni con los
-- trabajos realmente terminados en el taller.
-- ▶ Ejecutar UNA vez en el SQL Editor de Supabase.
-- =========================================================

update casos as c
set estado = 'entregado'
from aseguradoras as a
where a.id = c.aseguradora_id
  and a.es_personal = true
  and c.fecha_ingreso < current_date - interval '1 month'
  and c.estado not in ('completado', 'entregado');
