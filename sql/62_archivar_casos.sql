-- =========================================================
-- 62_archivar_casos.sql
-- Guarda casos fuera de la operación diaria sin eliminarlos.
-- ▶ Ejecutar UNA vez en el SQL Editor de Supabase.
-- =========================================================

alter table casos add column if not exists archivado_en timestamptz;

-- Listar archivados y omitirlos de la operación son consultas muy comunes.
create index if not exists idx_casos_archivados_en
  on casos (archivado_en desc)
  where archivado_en is not null;

create index if not exists idx_casos_operativos_sin_archivar
  on casos (estado, aseguradora_id, fecha_ingreso)
  where archivado_en is null
    and estado <> 'entregado';

-- Actualiza las funciones ligeras del tablero y buscador. SECURITY INVOKER
-- mantiene las mismas políticas RLS de cada usuario autenticado.
create or replace function buscar_casos_operativos(p_termino text, p_limite integer default 15)
returns table (
  id uuid,
  placa text,
  chasis text,
  numero_reclamo text,
  numero_poliza text,
  fecha_ingreso date,
  estado text,
  anio integer,
  color text,
  cliente_nombre text,
  marca_nombre text,
  modelo_nombre text,
  aseguradora_nombre text
)
language sql
stable
security invoker
set search_path = public
as $$
  with termino as (
    select nullif(trim(p_termino), '') as valor
  )
  select
    c.id, c.placa, c.chasis, c.numero_reclamo, c.numero_poliza,
    c.fecha_ingreso, c.estado, c.anio, c.color,
    cl.nombre_completo as cliente_nombre,
    ma.nombre as marca_nombre,
    mo.nombre as modelo_nombre,
    a.nombre as aseguradora_nombre
  from casos c
  left join clientes cl on cl.id = c.cliente_id
  left join marcas ma on ma.id = c.marca_id
  left join modelos mo on mo.id = c.modelo_id
  left join aseguradoras a on a.id = c.aseguradora_id
  cross join termino t
  where t.valor is not null
    and char_length(t.valor) >= 2
    and c.estado <> 'entregado'
    and c.archivado_en is null
    and (
      c.placa ilike '%' || t.valor || '%'
      or c.chasis ilike '%' || t.valor || '%'
      or c.numero_reclamo ilike '%' || t.valor || '%'
      or c.numero_poliza ilike '%' || t.valor || '%'
      or cl.nombre_completo ilike '%' || t.valor || '%'
      or ma.nombre ilike '%' || t.valor || '%'
      or mo.nombre ilike '%' || t.valor || '%'
    )
  order by
    case when lower(coalesce(c.placa, '')) = lower(t.valor)
           or lower(coalesce(c.chasis, '')) = lower(t.valor)
           or lower(coalesce(c.numero_reclamo, '')) = lower(t.valor)
           or lower(coalesce(c.numero_poliza, '')) = lower(t.valor)
         then 0 else 1 end,
    c.fecha_ingreso desc nulls last,
    c.created_at desc
  limit greatest(1, least(coalesce(p_limite, 15), 50));
$$;

grant execute on function buscar_casos_operativos(text, integer) to authenticated;

create or replace function resumen_tablero_operativo()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with aseguradoras_activas as (
    select id, nombre, logo_url, es_personal, orden
    from aseguradoras
    where activo = true
  ),
  casos_operativos as (
    select c.*
    from casos c
    join aseguradoras_activas a on a.id = c.aseguradora_id
    where coalesce(a.es_personal, false) = false
      and c.archivado_en is null
      and c.estado <> 'entregado'
  ),
  tarjetas_fila as (
    select
      a.id, a.nombre, a.logo_url, a.es_personal, a.orden,
      count(c.id) filter (
        where c.estado <> 'entregado'
      ) as conteo
    from aseguradoras_activas a
    left join casos c on c.aseguradora_id = a.id and c.archivado_en is null
    where a.nombre !~* 'dominguez[[:space:]]*auto[[:space:]]*pintura'
    group by a.id, a.nombre, a.logo_url, a.es_personal, a.orden
  ),
  tarjetas as (
    select jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'nombre', a.nombre,
        'logo_url', a.logo_url,
        'es_personal', a.es_personal,
        'conteo', a.conteo
      ) order by a.orden nulls last, a.nombre
    ) as datos
    from tarjetas_fila a
  ),
  llaves as (
    select numero_llave
    from casos_operativos
    where numero_llave is not null
    order by numero_llave
  )
  select jsonb_build_object(
    'metricas', jsonb_build_object(
      'espera', (select count(*) from casos_operativos where estado not in ('vehiculo_en_taller', 'listo_para_trabajar')),
      'listos', (select count(*) from casos_operativos where estado = 'listo_para_trabajar'),
      'enTaller', (select count(*) from casos_operativos where estado = 'vehiculo_en_taller')
    ),
    'aseguradoras', coalesce((select datos from tarjetas), '[]'::jsonb),
    'llaves_asignadas', (select count(*) from llaves),
    'llaves_preview', coalesce((select jsonb_agg(numero_llave) from (select numero_llave from llaves limit 6) preview), '[]'::jsonb)
  );
$$;

grant execute on function resumen_tablero_operativo() to authenticated;

create or replace function casos_tablero_por_estado(p_categoria text)
returns table (
  id uuid,
  estado text,
  fecha_ingreso date,
  created_at timestamptz,
  numero_reclamo text,
  numero_poliza text,
  placa text,
  aseguradora_nombre text,
  marca_nombre text,
  modelo_nombre text,
  cliente_nombre text
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    c.id, c.estado, c.fecha_ingreso, c.created_at, c.numero_reclamo,
    c.numero_poliza, c.placa,
    a.nombre as aseguradora_nombre,
    ma.nombre as marca_nombre,
    mo.nombre as modelo_nombre,
    cl.nombre_completo as cliente_nombre
  from casos c
  join aseguradoras a on a.id = c.aseguradora_id
  left join clientes cl on cl.id = c.cliente_id
  left join marcas ma on ma.id = c.marca_id
  left join modelos mo on mo.id = c.modelo_id
  where coalesce(a.es_personal, false) = false
    and c.archivado_en is null
    and c.estado <> 'entregado'
    and case p_categoria
      when 'espera' then c.estado not in ('vehiculo_en_taller', 'listo_para_trabajar')
      when 'listos' then c.estado = 'listo_para_trabajar'
      when 'enTaller' then c.estado = 'vehiculo_en_taller'
      else false
    end
  order by c.fecha_ingreso asc nulls last, c.created_at asc;
$$;

grant execute on function casos_tablero_por_estado(text) to authenticated;
