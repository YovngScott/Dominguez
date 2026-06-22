-- =========================================================
-- 24_etiquetas_cajas.sql
-- Una etiqueta puede tener VARIAS cajas (cada una con sus piezas). Antes
-- guardaba una sola lista de piezas; ahora se guarda la lista de cajas.
-- ▶ Ejecuta UNA vez en el SQL Editor de Supabase.
-- =========================================================

-- cajas = [{ "piezas": [{ "nombre": "...", "cantidad": 1 }] }, ...]
alter table etiquetas_piezas add column if not exists cajas jsonb not null default '[]';

-- Migra las etiquetas viejas (una sola lista de piezas) al nuevo formato:
-- cada una pasa a ser una etiqueta de una sola caja.
update etiquetas_piezas
   set cajas = jsonb_build_array(jsonb_build_object('piezas', coalesce(piezas, '[]'::jsonb)))
 where (cajas is null or cajas = '[]'::jsonb)
   and piezas is not null
   and piezas <> '[]'::jsonb;
