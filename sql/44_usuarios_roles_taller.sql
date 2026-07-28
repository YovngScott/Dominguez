-- =========================================================
-- 44_usuarios_roles_taller.sql
-- Usuarios con PIN, roles y asignaciones de trabajos del taller.
-- Ejecutar UNA sola vez en el SQL Editor de Supabase.
-- =========================================================

create extension if not exists pgcrypto;

-- Se conservan los perfiles que ya existen. "admin" y "almacen_kiosk"
-- se convierten a los nombres de roles nuevos.
alter table perfiles add column if not exists nombre_completo text;
alter table perfiles add column if not exists especialidad text;
alter table perfiles add column if not exists activo boolean not null default true;
alter table perfiles add column if not exists pin_hash text;
alter table perfiles add column if not exists pin_fingerprint text;
alter table perfiles add column if not exists login_email text;
alter table perfiles add column if not exists updated_at timestamptz not null default now();

-- Primero se permiten ambos nombres de roles. Si se actualizara antes, el
-- perfil viejo de la tablet chocaría con su check constraint anterior.
alter table perfiles drop constraint if exists perfiles_rol_check;
alter table perfiles add constraint perfiles_rol_check check (
  rol in ('admin', 'almacen_kiosk', 'administrativo_general', 'suministros', 'administracion_taller')
);

update perfiles
set nombre_completo = coalesce(nullif(nombre_completo, ''), nullif(nombre, ''), 'Usuario'),
    rol = case rol
      when 'admin' then 'administrativo_general'
      when 'almacen_kiosk' then 'suministros'
      else rol
    end;

alter table perfiles drop constraint if exists perfiles_rol_check;
alter table perfiles add constraint perfiles_rol_check check (
  rol in ('administrativo_general', 'suministros', 'administracion_taller')
);

create unique index if not exists perfiles_login_email_unico
  on perfiles (login_email) where login_email is not null;
-- El hash bcrypt protege el PIN al validarlo. Esta huella determinística solo
-- sirve para impedir que dos personas tengan el mismo PIN de 4 dígitos.
create unique index if not exists perfiles_pin_unico
  on perfiles (pin_fingerprint) where pin_fingerprint is not null;

create or replace function perfiles_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_perfiles_updated_at on perfiles;
create trigger trg_perfiles_updated_at
  before update on perfiles
  for each row execute function perfiles_set_updated_at();

-- Las políticas de suministros existentes consultan es_kiosk(). Mantener ese
-- nombre evita tener que reescribir todo el módulo y ahora también reconoce
-- el rol nuevo "suministros".
create or replace function es_kiosk()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from perfiles
     where user_id = auth.uid()
       and rol = 'suministros'
       and activo = true
  );
$$;

create or replace function es_administrativo_general()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Una cuenta vieja sin perfil conserva el acceso completo hasta que se le
  -- cree su ficha desde la nueva pantalla de usuarios.
  select coalesce((
    select rol = 'administrativo_general' and activo
      from perfiles where user_id = auth.uid()
  ), true);
$$;

create or replace function es_administracion_taller()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select rol = 'administracion_taller' and activo
      from perfiles where user_id = auth.uid()
  ), false);
$$;

revoke execute on function es_kiosk() from public;
revoke execute on function es_administrativo_general() from public;
revoke execute on function es_administracion_taller() from public;
grant execute on function es_kiosk() to authenticated;
grant execute on function es_administrativo_general() to authenticated;
grant execute on function es_administracion_taller() to authenticated;

drop policy if exists "perfiles_admin_total" on perfiles;
create policy "perfiles_admin_total" on perfiles
  for all to authenticated
  using (es_administrativo_general())
  with check (es_administrativo_general());

-- Vista sin hashes ni correo interno para las tarjetas del personal.
create or replace view trabajadores_taller as
select user_id, nombre_completo, especialidad, rol, activo, created_at
from perfiles
where activo = true
  and rol <> 'suministros'
  and nullif(trim(coalesce(especialidad, '')), '') is not null;

grant select on trabajadores_taller to authenticated;

-- La validación del PIN solo se ejecuta desde la función serverless con
-- service_role. Nunca se expone el hash al navegador.
create or replace function validar_pin_usuario(p_pin text)
returns table (
  user_id uuid,
  login_email text,
  nombre_completo text,
  rol text,
  especialidad text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.user_id, p.login_email, p.nombre_completo, p.rol, p.especialidad
    from perfiles p
   where p.activo = true
     and p.login_email is not null
     and p.pin_hash is not null
     and p.pin_hash = extensions.crypt(p_pin, p.pin_hash)
   limit 1;
$$;

-- Inserta o actualiza el perfil guardando únicamente el hash del PIN.
-- La API también actualiza el password equivalente del usuario en Auth para
-- obtener una sesión Supabase real por cada trabajador.
create or replace function guardar_perfil_usuario(
  p_user_id uuid,
  p_nombre_completo text,
  p_rol text,
  p_especialidad text,
  p_activo boolean,
  p_login_email text,
  p_pin text default null
)
returns perfiles
language plpgsql
security definer
set search_path = public
as $$
declare resultado perfiles;
begin
  if p_rol not in ('administrativo_general', 'suministros', 'administracion_taller') then
    raise exception 'Rol no válido';
  end if;
  if p_pin is not null and p_pin !~ '^[0-9]{4}$' then
    raise exception 'El PIN debe tener 4 dígitos';
  end if;

  insert into perfiles (user_id, nombre_completo, nombre, rol, especialidad, activo, login_email, pin_hash, pin_fingerprint)
  values (
    p_user_id,
    nullif(trim(p_nombre_completo), ''),
    nullif(trim(p_nombre_completo), ''),
    p_rol,
    nullif(trim(coalesce(p_especialidad, '')), ''),
    coalesce(p_activo, true),
    p_login_email,
    case when p_pin is null then null else extensions.crypt(p_pin, extensions.gen_salt('bf')) end,
    case when p_pin is null then null else encode(extensions.digest(p_pin, 'sha256'), 'hex') end
  )
  on conflict (user_id) do update set
    nombre_completo = excluded.nombre_completo,
    nombre = excluded.nombre,
    rol = excluded.rol,
    especialidad = excluded.especialidad,
    activo = excluded.activo,
    login_email = excluded.login_email,
    pin_hash = case when p_pin is null then perfiles.pin_hash else extensions.crypt(p_pin, extensions.gen_salt('bf')) end,
    pin_fingerprint = case when p_pin is null then perfiles.pin_fingerprint else encode(extensions.digest(p_pin, 'sha256'), 'hex') end
  returning * into resultado;
  return resultado;
end;
$$;

revoke all on function validar_pin_usuario(text) from public, anon, authenticated;
revoke all on function guardar_perfil_usuario(uuid, text, text, text, boolean, text, text) from public, anon, authenticated;
grant execute on function validar_pin_usuario(text) to service_role;
grant execute on function guardar_perfil_usuario(uuid, text, text, text, boolean, text, text) to service_role;

-- Trabajos asignados: un mismo vehículo puede estar asignado a varios
-- operarios. Al entregarse el vehículo, todos sus trabajos se completan.
create table if not exists casos_trabajadores (
  id uuid primary key default gen_random_uuid(),
  caso_id uuid not null references casos(id) on delete cascade,
  trabajador_id uuid not null references perfiles(user_id) on delete restrict,
  estado text not null default 'asignado' check (estado in ('asignado', 'completado')),
  asignado_at timestamptz not null default now(),
  completado_at timestamptz,
  asignado_por uuid references auth.users(id) on delete set null,
  unique (caso_id, trabajador_id)
);

create index if not exists idx_casos_trabajadores_trabajador_activo
  on casos_trabajadores (trabajador_id, estado);
create index if not exists idx_casos_trabajadores_caso on casos_trabajadores (caso_id);

alter table casos_trabajadores enable row level security;

drop policy if exists "casos_trabajadores_lectura" on casos_trabajadores;
create policy "casos_trabajadores_lectura" on casos_trabajadores
  for select to authenticated using (not es_kiosk());

drop policy if exists "casos_trabajadores_gestion" on casos_trabajadores;
create policy "casos_trabajadores_gestion" on casos_trabajadores
  for all to authenticated
  using (es_administrativo_general() or es_administracion_taller())
  with check (es_administrativo_general() or es_administracion_taller());

create or replace function completar_trabajos_al_cerrar_caso()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'entregado' and old.estado is distinct from 'entregado' then
    update casos_trabajadores
       set estado = 'completado', completado_at = now()
     where caso_id = new.id and estado = 'asignado';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_completar_trabajos_al_cerrar_caso on casos;
create trigger trg_completar_trabajos_al_cerrar_caso
  after update of estado on casos
  for each row execute function completar_trabajos_al_cerrar_caso();
