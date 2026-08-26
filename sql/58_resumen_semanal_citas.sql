-- Tabla de números del taller (incluida aquí para instalaciones nuevas).
create table if not exists telefonos_notificacion (
  id uuid primary key default gen_random_uuid(),
  nombre_empleado text not null,
  telefono text not null,
  rol text default 'Recepción',
  activo boolean not null default true,
  resumen_semanal boolean not null default false,
  created_at timestamptz not null default now()
);
alter table telefonos_notificacion add column if not exists resumen_semanal boolean not null default false;
alter table telefonos_notificacion enable row level security;
drop policy if exists "admin_telefonos_notificacion" on telefonos_notificacion;
create policy "admin_telefonos_notificacion" on telefonos_notificacion for all to authenticated
  using (exists (select 1 from perfiles p where p.user_id = (select auth.uid()) and p.rol = 'administrativo_general' and p.activo = true))
  with check (exists (select 1 from perfiles p where p.user_id = (select auth.uid()) and p.rol = 'administrativo_general' and p.activo = true));
grant select, insert, update on telefonos_notificacion to authenticated;

-- Idempotencia de avisos semanales y cambios posteriores de la misma semana.
create table if not exists citas_resumen_semanal (
  semana_inicio date primary key,
  citas_ids jsonb not null default '[]'::jsonb,
  enviado_at timestamptz not null default now()
);
alter table citas_resumen_semanal enable row level security;

create table if not exists citas_avisos_enviados (
  cita_id uuid not null references citas(id) on delete cascade,
  tipo text not null check (tipo in ('nueva_semana')),
  enviado_at timestamptz not null default now(),
  primary key (cita_id, tipo)
);
alter table citas_avisos_enviados enable row level security;
-- La tabla solo la usa el cron con service_role; no se expone al navegador.
