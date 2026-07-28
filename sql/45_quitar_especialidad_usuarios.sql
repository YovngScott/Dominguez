-- Quita por completo Especialidad / puesto del módulo de usuarios.
-- Ejecutar UNA vez después de 44_usuarios_roles_taller.sql.

drop view if exists trabajadores_taller;
drop function if exists validar_pin_usuario(text);
drop function if exists guardar_perfil_usuario(uuid, text, text, text, boolean, text, text);
drop function if exists guardar_perfil_usuario(uuid, text, text, boolean, text, text);

alter table perfiles drop column if exists especialidad;

create view trabajadores_taller as
select user_id, nombre_completo, rol, activo, created_at
from perfiles
where activo = true
  and rol <> 'suministros';

grant select on trabajadores_taller to authenticated;

create or replace function validar_pin_usuario(p_pin text)
returns table (
  user_id uuid,
  login_email text,
  nombre_completo text,
  rol text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.user_id, p.login_email, p.nombre_completo, p.rol
    from perfiles p
   where p.activo = true
     and p.login_email is not null
     and p.pin_hash is not null
     and p.pin_hash = extensions.crypt(p_pin, p.pin_hash)
   limit 1;
$$;

create or replace function guardar_perfil_usuario(
  p_user_id uuid,
  p_nombre_completo text,
  p_rol text,
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
    raise exception 'Rol no valido';
  end if;
  if p_pin is not null and p_pin !~ '^[0-9]{4}$' then
    raise exception 'El PIN debe tener 4 digitos';
  end if;

  insert into perfiles (user_id, nombre_completo, nombre, rol, activo, login_email, pin_hash, pin_fingerprint)
  values (
    p_user_id,
    nullif(trim(p_nombre_completo), ''),
    nullif(trim(p_nombre_completo), ''),
    p_rol,
    coalesce(p_activo, true),
    p_login_email,
    case when p_pin is null then null else extensions.crypt(p_pin, extensions.gen_salt('bf')) end,
    case when p_pin is null then null else encode(extensions.digest(p_pin, 'sha256'), 'hex') end
  )
  on conflict (user_id) do update set
    nombre_completo = excluded.nombre_completo,
    nombre = excluded.nombre,
    rol = excluded.rol,
    activo = excluded.activo,
    login_email = excluded.login_email,
    pin_hash = case when p_pin is null then perfiles.pin_hash else extensions.crypt(p_pin, extensions.gen_salt('bf')) end,
    pin_fingerprint = case when p_pin is null then perfiles.pin_fingerprint else encode(extensions.digest(p_pin, 'sha256'), 'hex') end
  returning * into resultado;
  return resultado;
end;
$$;

revoke all on function validar_pin_usuario(text) from public, anon, authenticated;
revoke all on function guardar_perfil_usuario(uuid, text, text, boolean, text, text) from public, anon, authenticated;
grant execute on function validar_pin_usuario(text) to service_role;
grant execute on function guardar_perfil_usuario(uuid, text, text, boolean, text, text) to service_role;
