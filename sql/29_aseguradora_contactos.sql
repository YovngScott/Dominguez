-- =========================================================
-- 29_aseguradora_contactos.sql
-- Contactos (correos) de cada aseguradora, para enviarles la cotización.
-- ▶ Ejecuta TODO este archivo UNA vez en el SQL Editor de Supabase.
-- =========================================================

create table if not exists aseguradora_contactos (
  id uuid primary key default gen_random_uuid(),
  aseguradora_id uuid not null references aseguradoras(id) on delete cascade,
  nombre text,
  email text not null,
  cargo text,
  created_at timestamptz not null default now()
);

create index if not exists idx_aseg_contactos on aseguradora_contactos (aseguradora_id);

alter table aseguradora_contactos enable row level security;

drop policy if exists "admin_total_aseg_contactos" on aseguradora_contactos;
create policy "admin_total_aseg_contactos" on aseguradora_contactos
  for all to authenticated using (true) with check (true);
