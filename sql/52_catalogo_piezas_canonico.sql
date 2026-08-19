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
    select regexp_replace(v, '\mCENSOR\M', 'SENSOR', 'g') as v from paso_2
  ), paso_4 as (
    select regexp_replace(v, '\mGUARDALODOS\M', 'GUARDALODO', 'g') as v from paso_3
  ), paso_5 as (
    select regexp_replace(v, '\m(DELANT+ER[OA]|FRONTAL)\M', 'DELT', 'g') as v from paso_4
  ), paso_6 as (
    select regexp_replace(v, '\m(TRASER[OA]|POSTERIOR)\M', 'TRAS', 'g') as v from paso_5
  ), paso_7 as (
    select regexp_replace(v, '\mIZQUIERD[OA]\M', 'LH', 'g') as v from paso_6
  ), paso_8 as (
    select regexp_replace(v, '\mIZQ\M', 'LH', 'g') as v from paso_7
  ), paso_9 as (
    select regexp_replace(v, '\mDERECH[OA]\M', 'RH', 'g') as v from paso_8
  ), paso_10 as (
    select regexp_replace(v, '\mDER\M', 'RH', 'g') as v from paso_9
  ), paso_11 as (
    select regexp_replace(v, '\mSUPERIOR\M', 'SUP', 'g') as v from paso_10
  ), paso_12 as (
    select regexp_replace(v, '\mINFERIOR\M', 'INF', 'g') as v from paso_11
  )
  select btrim(regexp_replace(v, '\s+', ' ', 'g')) from paso_12;
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

-- Variantes frecuentes, todas con el formato corto único. No genera
-- combinaciones inútiles: al escribir una pieza no habrá una lista eterna.
insert into piezas_catalogo (nombre, categoria) values
  ('BUMPER DELT', 'BUMPER'),
  ('BUMPER DELT LH', 'BUMPER'),
  ('BUMPER DELT RH', 'BUMPER'),
  ('BUMPER DELT CENT', 'BUMPER'),
  ('BUMPER DELT SUP', 'BUMPER'),
  ('BUMPER DELT INF', 'BUMPER'),
  ('BUMPER TRAS', 'BUMPER'),
  ('BUMPER TRAS LH', 'BUMPER'),
  ('BUMPER TRAS RH', 'BUMPER'),
  ('BUMPER TRAS CENT', 'BUMPER'),
  ('BUMPER TRAS SUP', 'BUMPER'),
  ('BUMPER TRAS INF', 'BUMPER'),
  ('PUERTA DELT LH', 'PUERTA'),
  ('PUERTA DELT RH', 'PUERTA'),
  ('PUERTA TRAS LH', 'PUERTA'),
  ('PUERTA TRAS RH', 'PUERTA'),
  ('GUARDALODO DELT LH', 'CARROCERIA'),
  ('GUARDALODO DELT RH', 'CARROCERIA'),
  ('GUARDALODO TRAS LH', 'CARROCERIA'),
  ('GUARDALODO TRAS RH', 'CARROCERIA'),
  ('FLEAR GUARDALODO DELT LH', 'CARROCERIA'),
  ('FLEAR GUARDALODO DELT RH', 'CARROCERIA'),
  ('FLEAR GUARDALODO TRAS LH', 'CARROCERIA'),
  ('FLEAR GUARDALODO TRAS RH', 'CARROCERIA'),
  ('FARO DELT LH', 'LUCES'),
  ('FARO DELT RH', 'LUCES'),
  ('HALOGENO DELT LH', 'LUCES'),
  ('HALOGENO DELT RH', 'LUCES'),
  ('STOP TRAS LH', 'LUCES'),
  ('STOP TRAS RH', 'LUCES'),
  ('PANTALLA DELT LH', 'CARROCERIA'),
  ('PANTALLA DELT RH', 'CARROCERIA'),
  ('DESLIZADOR BUMPER DELT LH', 'BUMPER'),
  ('DESLIZADOR BUMPER DELT RH', 'BUMPER'),
  ('SPOILER BUMPER DELT', 'BUMPER'),
  ('SPOILER BUMPER TRAS', 'BUMPER'),
  ('RIBETE PUERTA DELT LH', 'PUERTA'),
  ('RIBETE PUERTA DELT RH', 'PUERTA'),
  ('RIBETE PUERTA TRAS LH', 'PUERTA'),
  ('RIBETE PUERTA TRAS RH', 'PUERTA'),
  ('GOMA PUERTA DELT LH', 'PUERTA'),
  ('GOMA PUERTA DELT RH', 'PUERTA'),
  ('GOMA PUERTA TRAS LH', 'PUERTA'),
  ('GOMA PUERTA TRAS RH', 'PUERTA'),
  ('VIDRIO PUERTA DELT LH', 'CRISTALES'),
  ('VIDRIO PUERTA DELT RH', 'CRISTALES'),
  ('VIDRIO PUERTA TRAS LH', 'CRISTALES'),
  ('VIDRIO PUERTA TRAS RH', 'CRISTALES'),
  ('ESPEJO LH', 'ESPEJOS'),
  ('ESPEJO RH', 'ESPEJOS'),
  ('TAPA ESPEJO LH', 'ESPEJOS'),
  ('TAPA ESPEJO RH', 'ESPEJOS'),
  ('BASE ESPEJO LH', 'ESPEJOS'),
  ('BASE ESPEJO RH', 'ESPEJOS'),
  ('BONETE', 'FRENTE'),
  ('BISAGRA BONETE LH', 'FRENTE'),
  ('BISAGRA BONETE RH', 'FRENTE'),
  ('TAPA BAUL', 'TRASERA'),
  ('COMPUERTA TRAS', 'TRASERA'),
  ('PARRILLA DELT', 'FRENTE'),
  ('REFUERZO BUMPER DELT', 'BUMPER'),
  ('REFUERZO BUMPER TRAS', 'BUMPER')
on conflict (nombre) do nothing;

drop function pg_temp.normalizar_pieza(text);

commit;

-- Verificación: debe devolver 0 filas.
select upper(btrim(nombre)) as nombre_normalizado, count(*) as repetidas
from piezas_catalogo
group by upper(btrim(nombre))
having count(*) > 1
order by repetidas desc, nombre_normalizado;

select count(*) as piezas_en_catalogo from piezas_catalogo;
