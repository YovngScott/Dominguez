-- =========================================================
-- 23_etiquetas_piezas.sql
-- Guarda las etiquetas de piezas que se generan/imprimen desde
-- /piezas/etiquetas, para poder verlas después en un historial y
-- modificar sus piezas o reimprimirlas.
-- ▶ Ejecuta TODO este archivo UNA vez en el SQL Editor de Supabase.
-- =========================================================

create table if not exists etiquetas_piezas (
  id uuid primary key default gen_random_uuid(),
  marca text,
  modelo text,
  anio text,
  aseguradora_nombre text,
  numero_reclamo text,
  piezas jsonb not null default '[]',  -- [{ nombre, cantidad }]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_etiquetas_piezas_created on etiquetas_piezas (created_at desc);

-- Mantiene updated_at al día (reutiliza la función creada en 01_schema.sql)
drop trigger if exists trg_etiquetas_piezas_updated_at on etiquetas_piezas;
create trigger trg_etiquetas_piezas_updated_at
  before update on etiquetas_piezas
  for each row execute function set_updated_at();

alter table etiquetas_piezas enable row level security;

drop policy if exists "admin_total_etiquetas_piezas" on etiquetas_piezas;
create policy "admin_total_etiquetas_piezas" on etiquetas_piezas
  for all to authenticated using (true) with check (true);
