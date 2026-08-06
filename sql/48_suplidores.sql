-- =========================================================
-- 48_suplidores.sql
-- Suplidores de piezas: a quienes se les pide precio por WhatsApp cuando ya
-- está lista la cotización. Viven en el módulo Contactos, pestaña "Suplidores".
-- ▶ Ejecuta TODO este archivo UNA vez en el SQL Editor de Supabase.
-- =========================================================

create table if not exists suplidores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text not null,
  descripcion text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_suplidores_nombre on suplidores (nombre);

alter table suplidores enable row level security;

drop policy if exists "admin_total_suplidores" on suplidores;
create policy "admin_total_suplidores" on suplidores
  for all to authenticated using (true) with check (true);
