-- =========================================================
-- 37_servicios_catalogo.sql
-- Catálogo de servicios / mano de obra para autocompletar al escribir el
-- nombre del servicio en una cotización. Funciona igual que piezas_catalogo:
-- al usar un servicio nuevo, se guarda solo para sugerirlo la próxima vez.
-- ▶ Ejecuta TODO este archivo UNA vez en el SQL Editor de Supabase.
-- =========================================================

create table if not exists servicios_catalogo (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique
);

create index if not exists idx_servicios_catalogo_trgm
  on servicios_catalogo using gin (nombre gin_trgm_ops);

alter table servicios_catalogo enable row level security;

drop policy if exists "admin_total_servicios_catalogo" on servicios_catalogo;
create policy "admin_total_servicios_catalogo" on servicios_catalogo
  for all to authenticated using (true) with check (true);

insert into servicios_catalogo (nombre) values
  ('Pintura completa'),
  ('Pintura parcial'),
  ('Desabolladura'),
  ('Enderezado de chasis'),
  ('Mano de obra de latonería'),
  ('Pulido y brillado'),
  ('Detailing'),
  ('Preparación y masillado'),
  ('Reemplazo de pieza'),
  ('Alineación'),
  ('Desmonte y montaje'),
  ('Cambio de parabrisas'),
  ('Polarizado')
on conflict (nombre) do nothing;
