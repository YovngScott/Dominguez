-- =========================================================
-- 51_nevera_descuentos.sql
-- Registro de productos de la nevera y descuentos quincenales.
-- Ejecutar UNA vez en Supabase SQL Editor.
-- =========================================================

create table if not exists nevera_empleados (
  id uuid primary key default gen_random_uuid(),
  nombre_completo text not null unique,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists nevera_productos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  precio numeric(12,2) not null check (precio >= 0),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists nevera_consumos (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references nevera_empleados(id) on delete restrict,
  producto_id uuid not null references nevera_productos(id) on delete restrict,
  empleado_nombre text not null,
  producto_nombre text not null,
  fecha date not null default current_date,
  cantidad numeric(12,2) not null check (cantidad > 0),
  precio_unitario numeric(12,2) not null check (precio_unitario >= 0),
  total numeric(12,2) generated always as (cantidad * precio_unitario) stored,
  descontado_at timestamptz,
  descontado_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id) on delete set null
);

create index if not exists idx_nevera_consumos_fecha on nevera_consumos (fecha desc);
create index if not exists idx_nevera_consumos_empleado_fecha on nevera_consumos (empleado_id, fecha desc);
create index if not exists idx_nevera_consumos_pendientes on nevera_consumos (fecha desc) where descontado_at is null;

create or replace function nevera_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_nevera_empleados_updated_at on nevera_empleados;
create trigger trg_nevera_empleados_updated_at before update on nevera_empleados
for each row execute function nevera_set_updated_at();

drop trigger if exists trg_nevera_productos_updated_at on nevera_productos;
create trigger trg_nevera_productos_updated_at before update on nevera_productos
for each row execute function nevera_set_updated_at();

alter table nevera_empleados enable row level security;
alter table nevera_productos enable row level security;
alter table nevera_consumos enable row level security;

grant select, insert, update, delete on nevera_empleados, nevera_productos, nevera_consumos to authenticated;

drop policy if exists "nevera_empleados_gestion" on nevera_empleados;
create policy "nevera_empleados_gestion" on nevera_empleados
  for all to authenticated using (not es_kiosk()) with check (not es_kiosk());

drop policy if exists "nevera_productos_gestion" on nevera_productos;
create policy "nevera_productos_gestion" on nevera_productos
  for all to authenticated using (not es_kiosk()) with check (not es_kiosk());

drop policy if exists "nevera_consumos_gestion" on nevera_consumos;
create policy "nevera_consumos_gestion" on nevera_consumos
  for all to authenticated using (not es_kiosk()) with check (not es_kiosk());

-- Catálogo y personal del Excel actual.
insert into nevera_productos (nombre, precio) values
  ('AGUA', 20), ('COCA-COLA', 40), ('UVA', 25), ('ROJO', 25),
  ('SPRITE', 25), ('MERENGUE', 25), ('JUGO ROJO', 25),
  ('JUGO NARANJA', 25), ('SODA AMARGA', 40), ('POWER AZUL', 50), ('POWER ROJO', 50)
on conflict (nombre) do update set precio = excluded.precio;

insert into nevera_empleados (nombre_completo) values
  ('JOSEPH ANTONIO PERALTA ESPINAL'), ('JUAN RENE DOMINGUEZ'),
  ('LORENZA ALTAG POLANCO'), ('ORDALY DE JS DOMINGUEZ POLANCO'),
  ('Zuleyka Hidalgo'), ('EDWIN JOSE ESTEVEZ SEVERINO'), ('KELISON FACILE'),
  ('MAIREN DE LA ROSA BUENO'), ('DIANA DOMINGUEZ POLANCO'),
  ('MARLENY ALTAGRACIA PEÑA LUNA'), ('JOSE DAVID LOZADA MUJICA'),
  ('MILTON GONZALEZ BIDO'), ('WENDY LUXANA'), ('WILFRED JOSE MORILLO RODRIGUEZ'),
  ('CARLOS MANUEL SALCEDO MARTINEZ'), ('FELIX RAMIREZ'), ('NOEL JAMES ALY'),
  ('DANNY RAFAEL PAREDES LEONARDO'), ('FRANCISCO ANTONIO VERAS'),
  ('VICTOR RAMON BEATO TEJADA'), ('DOMINGO ALBERTO RODRIGUEZ'),
  ('OSVALDO RADHAMES RODRIGUEZ'), ('ELIS MANUEL DOMINGUEZ REYES'),
  ('JUAN CARLOS DOMINGUEZ'), ('MIGUEL EDUARDO PERALTA CHECO'),
  ('JOSE AGUSTIN MARTINEZ MORAN')
on conflict (nombre_completo) do nothing;

-- Conserva los cuatro consumos que ya estaban anotados el 15/08/2026.
insert into nevera_consumos (empleado_id, producto_id, empleado_nombre, producto_nombre, fecha, cantidad, precio_unitario)
select e.id, p.id, x.empleado, x.producto, x.fecha, x.cantidad, x.precio
from (values
  ('JOSE DAVID LOZADA MUJICA', 'SPRITE', date '2026-08-15', 3::numeric, 25::numeric),
  ('WILFRED JOSE MORILLO RODRIGUEZ', 'MERENGUE', date '2026-08-15', 2::numeric, 25::numeric),
  ('CARLOS MANUEL SALCEDO MARTINEZ', 'JUGO NARANJA', date '2026-08-15', 1::numeric, 25::numeric),
  ('ELIS MANUEL DOMINGUEZ REYES', 'MERENGUE', date '2026-08-15', 1::numeric, 25::numeric)
) as x(empleado, producto, fecha, cantidad, precio)
join nevera_empleados e on e.nombre_completo = x.empleado
join nevera_productos p on p.nombre = x.producto
where not exists (
  select 1 from nevera_consumos c
  where c.empleado_id = e.id and c.producto_id = p.id and c.fecha = x.fecha
    and c.cantidad = x.cantidad and c.precio_unitario = x.precio
);
