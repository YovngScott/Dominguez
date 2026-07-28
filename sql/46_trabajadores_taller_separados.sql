-- Separa los trabajadores del taller de los usuarios que inician sesión.
-- Ejecutar UNA vez después de las migraciones 44 y 45.

-- Puede haber quedado una vista del modelo anterior o una tabla creada en un
-- intento previo. Solo se elimina si realmente es una vista.
do $$
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'trabajadores_taller'
      and c.relkind = 'v'
  ) then
    execute 'drop view public.trabajadores_taller';
  end if;
end;
$$;

create table if not exists trabajadores_taller (
  id uuid primary key default gen_random_uuid(),
  nombre_completo text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Si ya existían asignaciones hechas con el modelo anterior, conserva a esos
-- trabajadores convirtiendo su perfil previo en un registro independiente.
insert into trabajadores_taller (id, nombre_completo, activo)
select p.user_id, coalesce(nullif(p.nombre_completo, ''), nullif(p.nombre, ''), 'Trabajador'), p.activo
from perfiles p
join casos_trabajadores ct on ct.trabajador_id = p.user_id
on conflict (id) do nothing;

alter table casos_trabajadores
  drop constraint if exists casos_trabajadores_trabajador_id_fkey;

alter table casos_trabajadores
  add constraint casos_trabajadores_trabajador_id_fkey
  foreign key (trabajador_id) references trabajadores_taller(id) on delete restrict;

create or replace function trabajadores_taller_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_trabajadores_taller_updated_at on trabajadores_taller;
create trigger trg_trabajadores_taller_updated_at
  before update on trabajadores_taller
  for each row execute function trabajadores_taller_set_updated_at();

alter table trabajadores_taller enable row level security;

drop policy if exists "trabajadores_taller_lectura" on trabajadores_taller;
create policy "trabajadores_taller_lectura" on trabajadores_taller
  for select to authenticated using (not es_kiosk());

drop policy if exists "trabajadores_taller_gestion" on trabajadores_taller;
create policy "trabajadores_taller_gestion" on trabajadores_taller
  for all to authenticated
  using (es_administrativo_general() or es_administracion_taller())
  with check (es_administrativo_general() or es_administracion_taller());
