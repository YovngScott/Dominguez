-- =========================================================
-- 50_piezas_caso_manuales.sql
-- Ajustes a mano del checklist de piezas de un caso.
--
-- Las piezas del caso NO son una tabla: se arman leyendo las cotizaciones
-- (items_piezas) y las etiquetas (piezas). Esta tabla guarda los ajustes que
-- se hacen a mano encima de esa lista, sin tocar la cotización ni su PDF (lo
-- que se le envió al seguro tiene que seguir coincidiendo con lo que el seguro
-- tiene).
--
-- Cómo se leen las filas:
--   oculta = false → pieza AGREGADA a mano (no está en ninguna cotización)
--   oculta = true  → pieza que sí existe en una cotización o etiqueta pero se
--                    QUITÓ del listado del caso (entró por error)
--
-- Editar una pieza que viene de una cotización se resuelve combinando las dos:
-- se oculta la original y se agrega una nueva con el nombre corregido.
-- ▶ Ejecuta TODO este archivo UNA vez en el SQL Editor de Supabase.
-- =========================================================

create table if not exists piezas_caso_manuales (
  id uuid primary key default gen_random_uuid(),
  caso_id uuid not null references casos(id) on delete cascade,
  pieza_clave text not null,   -- nombre normalizado (ver src/lib/piezas.js)
  pieza_nombre text not null,  -- nombre como se muestra
  cantidad int not null default 1,
  oculta boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique (caso_id, pieza_clave)
);

create index if not exists idx_piezas_manuales_caso on piezas_caso_manuales (caso_id);

alter table piezas_caso_manuales enable row level security;

drop policy if exists "admin_total_piezas_manuales" on piezas_caso_manuales;
create policy "admin_total_piezas_manuales" on piezas_caso_manuales
  for all to authenticated using (true) with check (true);
