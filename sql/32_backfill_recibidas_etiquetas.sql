-- Marca como recibidas todas las piezas de las etiquetas YA creadas (las
-- anteriores a que el marcado fuera automático). De ahí en adelante, cada
-- etiqueta nueva marca sus piezas como recibidas sola.
-- Ejecutar una sola vez en el SQL Editor de Supabase.
insert into piezas_recibidas (caso_id, pieza_clave, pieza_nombre)
select e.caso_id,
       lower(trim(p->>'nombre')) as pieza_clave,
       trim(p->>'nombre')        as pieza_nombre
from etiquetas_piezas e,
     lateral jsonb_array_elements(e.piezas) as p
where e.caso_id is not null
  and coalesce(trim(p->>'nombre'), '') <> ''
on conflict (caso_id, pieza_clave) do nothing;
