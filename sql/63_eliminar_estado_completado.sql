-- =========================================================
-- 63_eliminar_estado_completado.sql
-- El flujo de CASOS no usa "completado": solo trabajo activo,
-- entregado o archivado. "Completado" de tareas de trabajadores
-- es independiente y no se modifica aquí.
-- ▶ Ejecutar UNA vez en el SQL Editor de Supabase.
-- =========================================================

-- Conserva los expedientes que todavía tengan el valor antiguo y los deja
-- como entregados; no se borra ningún dato, foto, documento ni cotización.
update casos
set estado = 'entregado',
    fecha_entrega = coalesce(fecha_entrega, updated_at, now()),
    numero_llave = null
where estado = 'completado';

alter table casos drop constraint if exists casos_estado_check;
alter table casos add constraint casos_estado_check
  check (estado in (
    'en_espera_piezas',
    'listo_para_trabajar',
    'vehiculo_en_taller',
    'entregado'
  ));

-- Verificación: el resultado debe mostrar cero casos "completado".
select count(*) as casos_completados_restantes
from casos
where estado = 'completado';
