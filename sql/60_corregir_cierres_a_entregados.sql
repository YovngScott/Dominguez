-- =========================================================
-- 60_corregir_cierres_a_entregados.sql
-- Corrige la clasificación anterior de cierres administrativos.
-- "Completado" se reserva para un trabajo ya realizado/colocado.
-- Los expedientes antiguos sin seguimiento pasan a "entregado".
-- ▶ Ejecutar UNA vez en el SQL Editor de Supabase.
-- =========================================================

-- Generales antiguos: son cotizaciones conservadas, no trabajos terminados.
update casos as c
set estado = 'entregado'
from aseguradoras as a
where a.id = c.aseguradora_id
  and a.es_personal = true
  and c.estado = 'completado'
  and c.fecha_ingreso < current_date - interval '1 month';

-- Casos que la regla anterior cerró por tener más de un mes, sin cotización
-- enviada y sin haber ingresado al taller. Se mantiene intacto cualquier caso
-- que sí pasó por el taller, porque puede ser un trabajo realmente terminado.
update casos as c
set estado = 'entregado'
where c.estado = 'completado'
  and c.fecha_ingreso < current_date - interval '1 month'
  and not exists (
    select 1
    from cotizaciones as q
    where q.caso_id = c.id
      and q.enviada_at is not null
  )
  and not exists (
    select 1
    from historial_caso as h
    where h.caso_id = c.id
      and h.estado_nuevo = 'vehiculo_en_taller'
  );
