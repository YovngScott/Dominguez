-- =========================================================
-- 52_catalogo_piezas_canonico.sql
-- Limpia el catálogo de autocompletado de piezas.
--
-- Conserva las cotizaciones y etiquetas históricas: solo cambia el catálogo
-- usado para buscar/agregar piezas nuevas. Ejecutar UNA vez en Supabase.
-- =========================================================

begin;

-- No hay valor útil que conservar si alguna pieza quedó vacía.
delete from piezas_catalogo where btrim(coalesce(nombre, '')) = '';

-- Función temporal: desaparece al cerrar esta sesión y no cambia el esquema.
-- Los pasos separados evitan errores de sintaxis y hacen la limpieza auditable.
create or replace function pg_temp.normalizar_pieza(valor text)
returns text
language sql
immutable
as $$
  with paso_1 as (
    select regexp_replace(upper(btrim(valor)), '\mPARACHOQUES?\M', 'BUMPER', 'g') as v
  ), paso_2 as (
    select regexp_replace(v, '\mBOMPER\M', 'BUMPER', 'g') as v from paso_1
  ), paso_3 as (
    select regexp_replace(v, '\mGUARDALODOS\M', 'GUARDALODO', 'g') as v from paso_2
  ), paso_4 as (
    select regexp_replace(v, '\mDELANTERO\M', 'DELT', 'g') as v from paso_3
  ), paso_5 as (
    select regexp_replace(v, '\mTRASERO\M', 'TRAS', 'g') as v from paso_4
  ), paso_6 as (
    select regexp_replace(v, '\mIZQUIERDO\M', 'LH', 'g') as v from paso_5
  ), paso_7 as (
    select regexp_replace(v, '\mIZQUIERDA\M', 'LH', 'g') as v from paso_6
  ), paso_8 as (
    select regexp_replace(v, '\mDERECHO\M', 'RH', 'g') as v from paso_7
  ), paso_9 as (
    select regexp_replace(v, '\mDERECHA\M', 'RH', 'g') as v from paso_8
  ), paso_10 as (
    select regexp_replace(v, '\mSUPERIOR\M', 'SUP', 'g') as v from paso_9
  ), paso_11 as (
    select regexp_replace(v, '\mINFERIOR\M', 'INF', 'g') as v from paso_10
  )
  select btrim(regexp_replace(v, '\s+', ' ', 'g')) from paso_11;
$$;

-- Se conservan las filas más antiguas. Las duplicadas se borran solo cuando
-- ambas quedan exactamente iguales después de normalizarse.
with normalizados as (
  select id, pg_temp.normalizar_pieza(nombre) as canon
  from piezas_catalogo
), repetidas as (
  select id, row_number() over (partition by canon order by id) as fila
  from normalizados
)
delete from piezas_catalogo p
using repetidas r
where p.id = r.id and r.fila > 1;

-- Ahora que ya no hay colisiones, se actualizan los nombres sobrevivientes.
update piezas_catalogo
set nombre = pg_temp.normalizar_pieza(nombre)
where nombre is distinct from pg_temp.normalizar_pieza(nombre);

drop function pg_temp.normalizar_pieza(text);

commit;

-- Verificación: debe devolver 0 filas.
select upper(btrim(nombre)) as nombre_normalizado, count(*) as repetidas
from piezas_catalogo
group by upper(btrim(nombre))
having count(*) > 1
order by repetidas desc, nombre_normalizado;

select count(*) as piezas_en_catalogo from piezas_catalogo;
