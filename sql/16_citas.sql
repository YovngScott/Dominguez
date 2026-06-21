-- =========================================================
-- 16_citas.sql
-- Agenda de citas del taller. Cada cita puede enlazarse
-- (opcionalmente) a un cliente y/o a un caso existente.
-- ▶ Ejecuta TODO este archivo UNA vez en el SQL Editor de Supabase.
-- =========================================================

create table if not exists citas (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  hora text,
  nombre text not null,            -- nombre de quien viene (snapshot)
  telefono text,
  motivo text,
  nota text,
  cliente_id uuid references clientes(id) on delete set null,
  caso_id uuid references casos(id) on delete set null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'confirmada', 'atendida', 'cancelada')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index if not exists idx_citas_fecha on citas (fecha);
create index if not exists idx_citas_nombre_trgm on citas using gin (nombre gin_trgm_ops);

alter table citas enable row level security;

drop policy if exists "admin_total_citas" on citas;
create policy "admin_total_citas" on citas
  for all to authenticated using (true) with check (true);
