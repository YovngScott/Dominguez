-- =========================================================
-- 10_ordenes_reparacion.sql
-- Orden de reparación / recibo de entrada del vehículo.
-- Numeración automática que CONTINÚA desde las de papel (empieza en 4599).
-- ▶ Ejecuta UNA vez en el SQL Editor de Supabase.
-- =========================================================

-- Secuencia de número de orden (continúa después del último recibo de papel: 4598)
create sequence if not exists orden_reparacion_seq start with 4599;

create or replace function siguiente_numero_orden()
returns text
language sql
security definer
as $$
  select nextval('orden_reparacion_seq')::text;
$$;

create table if not exists ordenes_reparacion (
  id uuid primary key default gen_random_uuid(),
  numero text unique,
  caso_id uuid references casos(id) on delete set null,

  fecha date not null default current_date,
  hora text,

  -- Cliente
  cliente text,
  direccion text,
  tel text,
  cel text,
  fax text,
  email text,

  -- Seguro
  cia_seguro text,
  poliza text,
  ficha text,

  -- Vehículo
  marca text,
  modelo text,
  anio text,
  color text,
  placa text,
  km text,
  chasis text,

  -- Recepción
  costo text,
  observaciones text,
  trabajos text,

  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index if not exists idx_ordenes_caso on ordenes_reparacion (caso_id);
create index if not exists idx_ordenes_numero on ordenes_reparacion (numero);

alter table ordenes_reparacion enable row level security;

drop policy if exists "admin_total_ordenes" on ordenes_reparacion;
create policy "admin_total_ordenes" on ordenes_reparacion
  for all to authenticated using (true) with check (true);
