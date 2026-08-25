-- Centro de mensajes del taller para sustituir alertas operativas por WhatsApp.
-- Las notificaciones se generan dentro de la misma transacción que la revisión,
-- por lo que no pueden perderse aunque el navegador esté cerrado.

create table public.mensajes_dashboard (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null unique references public.revisiones_seguro(id) on delete cascade,
  tipo text not null check (tipo in (
    'diferencia_cotizacion', 'caso_no_encontrado', 'correo_sin_pdf',
    'remitente_no_autorizado', 'baja_confianza', 'aprobacion_pendiente', 'error'
  )),
  prioridad text not null default 'normal' check (prioridad in ('normal', 'media', 'alta', 'critica')),
  titulo text not null,
  cuerpo text not null,
  estado text not null default 'nuevo' check (estado in ('nuevo', 'leido', 'resuelto')),
  metadata jsonb not null default '{}'::jsonb,
  leido_en timestamptz,
  leido_por uuid references auth.users(id) on delete set null,
  resuelto_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index mensajes_dashboard_estado_fecha_idx
  on public.mensajes_dashboard (estado, creado_en desc);
create index mensajes_dashboard_prioridad_fecha_idx
  on public.mensajes_dashboard (prioridad, creado_en desc);

alter table public.mensajes_dashboard enable row level security;
revoke all on table public.mensajes_dashboard from anon, authenticated;
grant select on table public.mensajes_dashboard to authenticated;
grant update (estado, leido_en, leido_por, resuelto_en, actualizado_en)
  on table public.mensajes_dashboard to authenticated;

create policy "administracion_lee_mensajes"
  on public.mensajes_dashboard for select to authenticated
  using ((select public.es_administrativo_general()));

create policy "administracion_actualiza_mensajes"
  on public.mensajes_dashboard for update to authenticated
  using ((select public.es_administrativo_general()))
  with check ((select public.es_administrativo_general()));

create or replace function public.sincronizar_mensaje_revision_seguro()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_tipo text;
  v_prioridad text;
  v_titulo text;
  v_cuerpo text;
begin
  if new.estado in ('aprobado', 'rechazado') then
    update public.mensajes_dashboard
       set estado = 'resuelto',
           resuelto_en = coalesce(resuelto_en, now()),
           actualizado_en = now()
     where revision_id = new.id;
    return new;
  end if;

  v_tipo := case
    when coalesce(new.motivo_revision, '') like '%diferencias_detectadas%' then 'diferencia_cotizacion'
    when coalesce(new.motivo_revision, '') like '%caso_no_vinculado%' then 'caso_no_encontrado'
    when coalesce(new.motivo_revision, '') like '%correo_sin_pdf%' then 'correo_sin_pdf'
    when coalesce(new.motivo_revision, '') like '%remitente_no_autorizado%' then 'remitente_no_autorizado'
    when coalesce(new.motivo_revision, '') like '%extraccion_baja_confianza%' then 'baja_confianza'
    when new.estado = 'error' then 'error'
    else 'aprobacion_pendiente'
  end;

  v_prioridad := case
    when new.estado = 'error' then 'critica'
    when v_tipo in ('diferencia_cotizacion', 'caso_no_encontrado', 'remitente_no_autorizado') then 'alta'
    when v_tipo in ('correo_sin_pdf', 'baja_confianza') then 'media'
    else 'normal'
  end;

  v_titulo := case v_tipo
    when 'diferencia_cotizacion' then 'La aseguradora modificó la cotización'
    when 'caso_no_encontrado' then 'No se encontró el caso'
    when 'correo_sin_pdf' then 'Llegó un correo sin PDF'
    when 'remitente_no_autorizado' then 'Remitente no autorizado'
    when 'baja_confianza' then 'Documento difícil de interpretar'
    when 'error' then 'Falló el análisis del correo'
    else 'Documento listo para revisión'
  end;

  v_cuerpo := concat_ws(' · ',
    nullif(new.aseguradora, ''),
    nullif(new.placa_detectada, ''),
    nullif(new.chasis_detectado, ''),
    nullif(new.resumen, '')
  );
  if v_cuerpo = '' then v_cuerpo := coalesce(new.asunto, 'Revisión de seguro pendiente'); end if;

  insert into public.mensajes_dashboard (
    revision_id, tipo, prioridad, titulo, cuerpo, metadata
  ) values (
    new.id,
    v_tipo,
    v_prioridad,
    v_titulo,
    v_cuerpo,
    jsonb_build_object(
      'remitente', new.remitente,
      'asunto', new.asunto,
      'cuenta', new.source_account,
      'caso_id', new.caso_id,
      'placa', new.placa_detectada,
      'chasis', new.chasis_detectado,
      'aseguradora', new.aseguradora,
      'motivo', new.motivo_revision
    )
  )
  on conflict (revision_id) do update set
    tipo = excluded.tipo,
    prioridad = excluded.prioridad,
    titulo = excluded.titulo,
    cuerpo = excluded.cuerpo,
    metadata = excluded.metadata,
    actualizado_en = now();
  return new;
end;
$$;

drop trigger if exists revisiones_seguro_mensaje_dashboard on public.revisiones_seguro;
create trigger revisiones_seguro_mensaje_dashboard
after insert or update of estado, motivo_revision, resumen, comparacion
on public.revisiones_seguro
for each row execute function public.sincronizar_mensaje_revision_seguro();

-- Genera mensajes para revisiones que ya existían antes de esta migración.
insert into public.mensajes_dashboard (revision_id, tipo, prioridad, titulo, cuerpo, estado, metadata, resuelto_en)
select
  r.id,
  case
    when coalesce(r.motivo_revision, '') like '%diferencias_detectadas%' then 'diferencia_cotizacion'
    when coalesce(r.motivo_revision, '') like '%caso_no_vinculado%' then 'caso_no_encontrado'
    when coalesce(r.motivo_revision, '') like '%correo_sin_pdf%' then 'correo_sin_pdf'
    when coalesce(r.motivo_revision, '') like '%extraccion_baja_confianza%' then 'baja_confianza'
    when r.estado = 'error' then 'error'
    else 'aprobacion_pendiente'
  end,
  case
    when r.estado = 'error' then 'critica'
    when coalesce(r.motivo_revision, '') ~ '(diferencias_detectadas|caso_no_vinculado|remitente_no_autorizado)' then 'alta'
    when coalesce(r.motivo_revision, '') ~ '(correo_sin_pdf|extraccion_baja_confianza)' then 'media'
    else 'normal'
  end,
  coalesce(nullif(r.asunto, ''), 'Revisión de seguro'),
  coalesce(nullif(r.resumen, ''), 'Revisión de seguro pendiente'),
  case when r.estado in ('aprobado', 'rechazado') then 'resuelto' else 'nuevo' end,
  jsonb_build_object('remitente', r.remitente, 'asunto', r.asunto, 'cuenta', r.source_account,
    'caso_id', r.caso_id, 'placa', r.placa_detectada, 'chasis', r.chasis_detectado,
    'aseguradora', r.aseguradora, 'motivo', r.motivo_revision),
  case when r.estado in ('aprobado', 'rechazado') then coalesce(r.aprobado_en, r.rechazado_en, now()) end
from public.revisiones_seguro r
on conflict (revision_id) do nothing;

do $$
begin
  alter publication supabase_realtime add table public.mensajes_dashboard;
exception when duplicate_object then null;
end $$;
