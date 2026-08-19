-- =========================================================
-- 52_catalogo_piezas_canonico.sql
-- Limpia el catálogo de autocompletado de piezas.
--
-- Conserva las cotizaciones y etiquetas históricas: solo cambia el catálogo
-- usado para buscar/agregar piezas nuevas. Normaliza abreviaturas y elimina
-- únicamente filas que quedan idénticas después de normalizarlas.
-- Ejecutar UNA vez en el SQL Editor de Supabase.
-- =========================================================

begin;

-- No hay valor útil que conservar si alguna pieza quedó vacía.
delete from piezas_catalogo where btrim(coalesce(nombre, '')) = '';

-- Primero se eliminan duplicados por su futuro nombre; esto evita chocar con
-- la restricción unique al actualizar la fila que se conserva.
with normalizados as (
  select
    id,
    btrim(regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(
                      regexp_replace(
                        regexp_replace(
                          regexp_replace(
                            regexp_replace(upper(btrim(nombre)), '\mPARACHOQUES?\M', 'BUMPER', 'g'),
                          '\mBOMPER\M', 'BUMPER', 'g'),
                        '\mGUARDALODOS\M', 'GUARDALODO', 'g'),
                      '\mDELANTERO\M', 'DELT', 'g'),
                    '\mTRASERO\M', 'TRAS', 'g'),
                  '\mIZQUIERDO\M', 'LH', 'g'),
                '\mIZQUIERDA\M', 'LH', 'g'),
              '\mDERECHO\M', 'RH', 'g'),
            '\mDERECHA\M', 'RH', 'g'),
                          '\mSUPERIOR\M', 'SUP', 'g'),
        '\mINFERIOR\M', 'INF', 'g'),
      '\s+', ' ', 'g')) as canon
  from piezas_catalogo
), repetidas as (
  select id, row_number() over (partition by canon order by id) as fila
  from normalizados
)
delete from piezas_catalogo p
using repetidas r
where p.id = r.id and r.fila > 1;

-- Ahora actualiza las sobrevivientes al mismo formato corto del formulario.
with normalizados as (
  select
    id,
    btrim(regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(
                      regexp_replace(
                        regexp_replace(
                          regexp_replace(
                            regexp_replace(upper(btrim(nombre)), '\mPARACHOQUES?\M', 'BUMPER', 'g'),
                          '\mBOMPER\M', 'BUMPER', 'g'),
                        '\mGUARDALODOS\M', 'GUARDALODO', 'g'),
                      '\mDELANTERO\M', 'DELT', 'g'),
                    '\mTRASERO\M', 'TRAS', 'g'),
                  '\mIZQUIERDO\M', 'LH', 'g'),
                '\mIZQUIERDA\M', 'LH', 'g'),
              '\mDERECHO\M', 'RH', 'g'),
            '\mDERECHA\M', 'RH', 'g'),
                          '\mSUPERIOR\M', 'SUP', 'g'),
        '\mINFERIOR\M', 'INF', 'g'),
      '\s+', ' ', 'g')) as canon
  from piezas_catalogo
)
update piezas_catalogo p
set nombre = n.canon
from normalizados n
where p.id = n.id and p.nombre is distinct from n.canon;

commit;

-- Verificación: debe devolver 0 filas. Si sale alguna, hay un duplicado que
-- no es idéntico al normalizarlo y se puede revisar manualmente sin riesgo.
select upper(btrim(nombre)) as nombre_normalizado, count(*) as repetidas
from piezas_catalogo
group by upper(btrim(nombre))
having count(*) > 1
order by repetidas desc, nombre_normalizado;

select count(*) as piezas_en_catalogo from piezas_catalogo;
