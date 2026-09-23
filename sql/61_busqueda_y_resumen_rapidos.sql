-- =========================================================
-- 61_busqueda_y_resumen_rapidos.sql
-- Búsqueda operativa y tablero optimizados para que el navegador
-- descargue únicamente lo que necesita en cada momento.
-- ▶ Ejecutar UNA vez en el SQL Editor de Supabase.
-- =========================================================

-- Los índices trigram aceleran las coincidencias parciales (placa, chasis,
-- reclamo, póliza y asegurado) aunque se escriba solo una parte del dato.
create extension if not exists pg_trgm with schema extensions;

-- El proyecto puede tener pg_trgm instalado en public (versión antigua) o en
-- extensions (versión actual de Supabase); se detecta para reutilizarlo bien.
do $$
declare
  esquema_trgm text;
begin
  select n.nspname into esquema_trgm
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pg_trgm';

  execute format('create index if not exists idx_casos_placa_trgm on casos using gin (placa %I.gin_trgm_ops)', esquema_trgm);
  execute format('create index if not exists idx_casos_chasis_trgm on casos using gin (chasis %I.gin_trgm_ops)', esquema_trgm);
  execute format('create index if not exists idx_casos_reclamo_trgm on casos using gin (numero_reclamo %I.gin_trgm_ops)', esquema_trgm);
  execute format('create index if not exists idx_casos_poliza_trgm on casos using gin (numero_poliza %I.gin_trgm_ops)', esquema_trgm);
  execute format('create index if not exists idx_clientes_nombre_trgm on clientes using gin (nombre_completo %I.gin_trgm_ops)', esquema_trgm);
end
$$;

create index if not exists idx_casos_operativos_tablero
  on casos (estado, aseguradora_id, fecha_ingreso)
  where estado not in ('entregado', 'completado');

-- Una sola llamada reemplaza las búsquedas separadas por vehículo, cliente,
-- marca y modelo. SECURITY INVOKER conserva las políticas RLS del usuario.
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

-- El tablero recibe tarjetas, conteos y llaves en una sola respuesta pequeña.
-- No trae vehículos, clientes ni piezas hasta que se abre una tarjeta.
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
      and c.estado not in ('entregado', 'completado')
  ),
  tarjetas_fila as (
    select
      a.id, a.nombre, a.logo_url, a.es_personal, a.orden,
      count(c.id) filter (
        where not coalesce(a.es_personal, false)
           or c.estado not in ('entregado', 'completado')
      ) as conteo
    from aseguradoras_activas a
    left join casos c on c.aseguradora_id = a.id
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

-- Los detalles se descargan únicamente cuando el usuario abre una tarjeta.
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
    and c.estado not in ('entregado', 'completado')
    and case p_categoria
      when 'espera' then c.estado not in ('vehiculo_en_taller', 'listo_para_trabajar')
      when 'listos' then c.estado = 'listo_para_trabajar'
      when 'enTaller' then c.estado = 'vehiculo_en_taller'
      else false
    end
  order by c.fecha_ingreso asc nulls last, c.created_at asc;
$$;

grant execute on function casos_tablero_por_estado(text) to authenticated;
