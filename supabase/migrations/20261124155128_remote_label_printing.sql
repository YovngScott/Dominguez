-- Cola privada de etiquetas. Ejecutar completa en el proyecto de Dominguez.
-- Las páginas existentes usan la sesión del taller. Solo el receptor de la
-- impresora posee el secreto de 256 bits, cuyo hash se instala por separado.
begin;
create schema if not exists impresion_privada;
revoke all on schema impresion_privada from public;
grant usage on schema impresion_privada to anon, authenticated;

create table if not exists impresion_privada.central (
  id text primary key check (id = 'principal'),
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  nombre text not null default 'PC del taller',
  impresora text not null,
  activa boolean not null default true,
  ultima_conexion timestamptz
);
create table if not exists impresion_privada.trabajos (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null unique,
  solicitado_por uuid references auth.users(id) on delete set null,
  titulo text not null default 'Etiquetas',
  zpl text not null check (octet_length(zpl) <= 262144),
  estado text not null default 'pendiente'
    check (estado in ('pendiente','procesando','enviado','revisar','expirado')),
  recogida_id uuid unique,
  creado_en timestamptz not null default now(),
  iniciado_en timestamptz,
  terminado_en timestamptz,
  detalle text
);
create index if not exists trabajos_impresion_pendientes
  on impresion_privada.trabajos (creado_en, id) where estado = 'pendiente';
create index if not exists trabajos_impresion_usuario
  on impresion_privada.trabajos (solicitado_por, creado_en desc);
alter table impresion_privada.central enable row level security;
alter table impresion_privada.trabajos enable row level security;
revoke all on all tables in schema impresion_privada from public, anon, authenticated;

create or replace function impresion_privada.usuario_permitido()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    not exists (select 1 from public.perfiles where user_id = auth.uid())
    or exists (select 1 from public.perfiles where user_id = auth.uid()
      and activo and rol in ('administrativo_general','suministros','administracion_taller'))
  );
$$;

create or replace function impresion_privada.validar_receptor(p_token text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- Autorización por capacidad limitada a la impresora, sin una service_role
  -- instalada en Windows. Este receptor no consulta datos de los casos.
  if p_token is null or length(p_token) < 40 or not exists (
    select 1 from impresion_privada.central where id='principal' and activa
      and token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  ) then raise exception 'Receptor de impresión no autorizado.' using errcode='42501'; end if;
end;
$$;

create or replace function impresion_privada.estado_central()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c impresion_privada.central;
begin
  if not impresion_privada.usuario_permitido() then
    raise exception 'Inicia sesión para imprimir.' using errcode='42501';
  end if;
  select * into c from impresion_privada.central where id='principal';
  if not found then return jsonb_build_object('configurada',false,'en_linea',false); end if;
  return jsonb_build_object('configurada',true,'en_linea',
    c.activa and c.ultima_conexion > now()-interval '45 seconds',
    'nombre',c.nombre,'impresora',c.impresora,'ultima_conexion',c.ultima_conexion);
end;
$$;

create or replace function impresion_privada.enviar(p_solicitud uuid, p_zpl text, p_titulo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare j impresion_privada.trabajos; c impresion_privada.central;
begin
  if not impresion_privada.usuario_permitido() then
    raise exception 'Inicia sesión para imprimir.' using errcode='42501';
  end if;
  if p_solicitud is null or p_zpl is null or octet_length(p_zpl)>262144
     or p_zpl not like '^XA%' or right(rtrim(p_zpl),3) <> '^XZ'
     or (length(p_zpl)-length(replace(p_zpl,'^XA','')))/3 > 100 then
    raise exception 'El contenido de las etiquetas no es válido.';
  end if;
  -- Reutilizar una solicitud incierta no crea otra impresión.
  select * into j from impresion_privada.trabajos where solicitud_id=p_solicitud;
  if found then
    if j.solicitado_por is distinct from auth.uid() or j.zpl<>p_zpl then
      raise exception 'La solicitud de impresión no coincide.' using errcode='42501';
    end if;
    return jsonb_build_object('id',j.id,'estado',j.estado,'detalle',j.detalle);
  end if;
  select * into c from impresion_privada.central where id='principal' for share;
  if not found or not c.activa or c.ultima_conexion is null
     or c.ultima_conexion < now()-interval '45 seconds' then
    raise exception 'La PC de etiquetas está desconectada. Enciéndela y abre Print Server.';
  end if;
  if (select count(*) from impresion_privada.trabajos where solicitado_por=auth.uid()
      and creado_en>now()-interval '10 minutes') >= 60 then
    raise exception 'Hay demasiadas solicitudes. Espera unos minutos.';
  end if;
  insert into impresion_privada.trabajos(solicitud_id,solicitado_por,titulo,zpl)
    values (p_solicitud,auth.uid(),left(coalesce(p_titulo,'Etiquetas'),120),p_zpl)
    on conflict(solicitud_id) do nothing returning * into j;
  if not found then
    select * into j from impresion_privada.trabajos where solicitud_id=p_solicitud;
    if j.solicitado_por is distinct from auth.uid() or j.zpl<>p_zpl then
      raise exception 'La solicitud de impresión no coincide.' using errcode='42501';
    end if;
  end if;
  return jsonb_build_object('id',j.id,'estado',j.estado,'impresora',c.impresora);
end;
$$;

create or replace function impresion_privada.estado_trabajo(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare j impresion_privada.trabajos;
begin
  if not impresion_privada.usuario_permitido() then
    raise exception 'Inicia sesión para imprimir.' using errcode='42501';
  end if;
  select * into j from impresion_privada.trabajos
    where id=p_id and solicitado_por=auth.uid();
  if not found then raise exception 'No se encontró la impresión.' using errcode='42501'; end if;
  return jsonb_build_object('id',j.id,'estado',j.estado,'detalle',j.detalle);
end;
$$;

create or replace function impresion_privada.recoger(p_token text, p_recogida uuid, p_impresora text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare j impresion_privada.trabajos;
begin
  perform impresion_privada.validar_receptor(p_token);
  if p_recogida is null or coalesce(btrim(p_impresora),'')='' then
    raise exception 'Falta seleccionar la impresora del receptor.';
  end if;
  update impresion_privada.central set ultima_conexion=now(),impresora=left(p_impresora,160)
    where id='principal';
  -- Un trabajo que quedó sin confirmar requiere revisión. Nunca se vuelve
  -- a imprimir automáticamente: Windows pudo haberlo recibido antes del corte.
  update impresion_privada.trabajos set estado='revisar',terminado_en=now(),
    detalle='Se interrumpió la confirmación. Revisa la impresora antes de reimprimir.'
    where estado='procesando' and iniciado_en<now()-interval '2 minutes';
  update impresion_privada.trabajos set estado='expirado',terminado_en=now(),
    detalle='La solicitud venció sin imprimirse. Vuelve a enviarla.'
    where estado='pendiente' and creado_en<now()-interval '5 minutes';
  select * into j from impresion_privada.trabajos where recogida_id=p_recogida;
  if not found then
    select * into j from impresion_privada.trabajos where estado='pendiente'
      order by creado_en,id limit 1 for update skip locked;
    if not found then return null; end if;
    update impresion_privada.trabajos set estado='procesando',iniciado_en=now(),
      recogida_id=p_recogida where id=j.id returning * into j;
  end if;
  return jsonb_build_object('id',j.id,'recogida_id',j.recogida_id,'estado',j.estado,
    'zpl',case when j.estado='procesando' then j.zpl else null end);
end;
$$;

create or replace function impresion_privada.confirmar(p_token text,p_id uuid,p_recogida uuid,p_estado text,p_detalle text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform impresion_privada.validar_receptor(p_token);
  if p_estado is null or p_estado not in ('enviado','revisar') then raise exception 'Estado no válido.'; end if;
  update impresion_privada.trabajos set estado=p_estado,terminado_en=now(),detalle=left(p_detalle,300)
    where id=p_id and recogida_id=p_recogida and estado in ('procesando','revisar',p_estado);
  return found;
end;
$$;

-- Wrappers de PostgREST sin privilegios elevados. Las operaciones privilegiadas
-- quedan en un esquema no expuesto y verifican usuario o capacidad del receptor.
create or replace function public.estado_impresora_central() returns jsonb
language sql security invoker set search_path='' as $$ select impresion_privada.estado_central(); $$;
create or replace function public.enviar_etiqueta_central(p_solicitud uuid,p_zpl text,p_titulo text default 'Etiquetas') returns jsonb
language sql security invoker set search_path='' as $$ select impresion_privada.enviar(p_solicitud,p_zpl,p_titulo); $$;
create or replace function public.estado_impresion_central(p_id uuid) returns jsonb
language sql security invoker set search_path='' as $$ select impresion_privada.estado_trabajo(p_id); $$;
create or replace function public.recoger_impresion_central(p_token text,p_recogida uuid,p_impresora text) returns jsonb
language sql security invoker set search_path='' as $$ select impresion_privada.recoger(p_token,p_recogida,p_impresora); $$;
create or replace function public.confirmar_impresion_central(p_token text,p_id uuid,p_recogida uuid,p_estado text,p_detalle text default null) returns boolean
language sql security invoker set search_path='' as $$ select impresion_privada.confirmar(p_token,p_id,p_recogida,p_estado,p_detalle); $$;

revoke all on all functions in schema impresion_privada from public,anon,authenticated;
revoke all on function public.estado_impresora_central() from public,anon;
revoke all on function public.enviar_etiqueta_central(uuid,text,text) from public,anon;
revoke all on function public.estado_impresion_central(uuid) from public,anon;
revoke all on function public.recoger_impresion_central(text,uuid,text) from public,anon,authenticated;
revoke all on function public.confirmar_impresion_central(text,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function impresion_privada.estado_central(), impresion_privada.enviar(uuid,text,text), impresion_privada.estado_trabajo(uuid)
  to authenticated;
grant execute on function public.estado_impresora_central(),public.enviar_etiqueta_central(uuid,text,text),public.estado_impresion_central(uuid)
  to authenticated;
grant execute on function impresion_privada.recoger(text,uuid,text),impresion_privada.confirmar(text,uuid,uuid,text,text)
  to anon;
grant execute on function public.recoger_impresion_central(text,uuid,text),public.confirmar_impresion_central(text,uuid,uuid,text,text)
  to anon;
notify pgrst,'reload schema';
commit;
