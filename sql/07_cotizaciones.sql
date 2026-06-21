-- =========================================================
-- 07_cotizaciones.sql
-- Módulo de cotizaciones (valoración de piezas + mano de obra).
-- ▶ Ejecuta TODO este archivo UNA vez en el SQL Editor de Supabase.
-- =========================================================

-- ----- Contador para la numeración automática COT-AAAA-#### -----
create table if not exists cotizacion_contador (
  anio int primary key,
  ultimo int not null default 0
);

create or replace function siguiente_numero_cotizacion()
returns text
language plpgsql
security definer
as $$
declare
  a int := extract(year from now())::int;
  n int;
begin
  insert into cotizacion_contador (anio, ultimo)
  values (a, 1)
  on conflict (anio) do update set ultimo = cotizacion_contador.ultimo + 1
  returning ultimo into n;

  return 'COT-' || a || '-' || lpad(n::text, 4, '0');
end;
$$;

-- ----- Tabla de cotizaciones -----
create table if not exists cotizaciones (
  id uuid primary key default gen_random_uuid(),
  numero text unique,
  estado text not null default 'borrador' check (estado in ('borrador', 'generada')),

  -- Si el chasis coincide con un caso, se enlaza para mostrar el PDF en su apartado.
  caso_id uuid references casos(id) on delete set null,

  -- Cliente
  cliente_nombre text not null,
  cliente_email text,
  tipo_identificacion text,
  identificacion text,
  telefonos text[] default '{}',

  -- Vehículo
  marca text,
  modelo text,
  anio int,
  color text,
  placa text,
  chasis text,
  tipo_vehiculo text,

  -- Seguro
  aseguradora_id uuid references aseguradoras(id),
  aseguradora_nombre text,
  numero_reclamo text,
  numero_poliza text,

  -- Ítems (se guardan como snapshot en JSON)
  items_piezas jsonb not null default '[]',
  items_mano_obra jsonb not null default '[]',

  -- Totales calculados
  subtotal numeric(12, 2) not null default 0,
  itbis numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,

  pdf_path text,

  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index if not exists idx_cotizaciones_caso on cotizaciones (caso_id);
create index if not exists idx_cotizaciones_chasis_trgm on cotizaciones using gin (chasis gin_trgm_ops);
create index if not exists idx_cotizaciones_numero on cotizaciones (numero);

alter table cotizaciones enable row level security;

drop policy if exists "admin_total_cotizaciones" on cotizaciones;
create policy "admin_total_cotizaciones" on cotizaciones
  for all to authenticated using (true) with check (true);

-- ----- Evidencias de la cotización (fotos del choque) -----
create table if not exists cotizacion_evidencias (
  id uuid primary key default gen_random_uuid(),
  cotizacion_id uuid not null references cotizaciones(id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_cot_evidencias on cotizacion_evidencias (cotizacion_id);

alter table cotizacion_evidencias enable row level security;

drop policy if exists "admin_total_cot_evidencias" on cotizacion_evidencias;
create policy "admin_total_cot_evidencias" on cotizacion_evidencias
  for all to authenticated using (true) with check (true);

-- ----- Bucket de Storage para PDFs y evidencias de cotizaciones -----
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cotizaciones', 'cotizaciones', false, 52428800,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "cotizaciones_admin_rw" on storage.objects;
create policy "cotizaciones_admin_rw"
on storage.objects for all
to authenticated
using (bucket_id = 'cotizaciones')
with check (bucket_id = 'cotizaciones');
