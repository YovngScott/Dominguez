-- =========================================================
-- 59_organizar_casos_antiguos_y_piezas.sql
-- Limpieza segura: conserva datos, pero cierra los casos sin seguimiento.
-- ▶ Ejecutar UNA vez en el SQL Editor de Supabase.
-- =========================================================

-- Un caso en espera por más de un mes sin ninguna cotización enviada no
-- representa trabajo activo. Sigue disponible en buscadores y entregados.
update casos as c
set estado = 'entregado'
where c.estado = 'en_espera_piezas'
  and c.fecha_ingreso < current_date - interval '1 month'
  and not exists (
    select 1
    from cotizaciones as q
    where q.caso_id = c.id
      and q.enviada_at is not null
  );
