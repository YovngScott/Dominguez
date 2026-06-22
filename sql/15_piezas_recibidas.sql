-- =========================================================
-- 15_piezas_recibidas.sql
-- Seguimiento de piezas pendientes / recibidas por caso.
--
-- Las piezas se siguen tomando de la cotización (items_piezas en JSON);
-- esta tabla solo guarda CUÁLES ya llegaron, sin tocar la cotización ni
-- su PDF. Una pieza marcada = existe una fila aquí; al desmarcarla se borra.
-- ▶ Ejecuta TODO este archivo UNA vez en el SQL Editor de Supabase.
-- =========================================================

create table if not exists piezas_recibidas (
  id uuid primary key default gen_random_uuid(),
  caso_id uuid not null references casos(id) on delete cascade,
  pieza_clave text not null,   -- nombre normalizado de la pieza (clave estable)
  pieza_nombre text not null,  -- nombre legible para mostrar/imprimir
  recibida_at timestamptz not null default now(),
  recibida_by uuid references auth.users(id),
  unique (caso_id, pieza_clave)
);

create index if not exists idx_piezas_recibidas_caso on piezas_recibidas (caso_id);

alter table piezas_recibidas enable row level security;

drop policy if exists "admin_total_piezas_recibidas" on piezas_recibidas;
create policy "admin_total_piezas_recibidas" on piezas_recibidas
  for all to authenticated using (true) with check (true);
