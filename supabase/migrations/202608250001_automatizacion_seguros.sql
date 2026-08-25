-- Automatización de seguros: revisión obligatoria antes de adjuntar un PDF al caso.
-- Las credenciales de Gmail viven cifradas en Stage; esta base conserva únicamente
-- la revisión, el PDF temporal privado y, tras aprobar, el PDF definitivo del caso.

create table if not exists revisiones_seguro (
  id uuid primary key default gen_random_uuid(),
  source_message_id text not null unique,
  source_account text,
  remitente text,
  asunto text,
  recibido_en timestamptz,
  caso_id uuid references casos(id) on delete set null,
  cotizacion_id uuid references cotizaciones(id) on delete set null,
  chasis_detectado text,
  placa_detectada text,
  aseguradora text,
  autorizado_remitente boolean not null default false,
  confianza numeric(5,4),
  estado text not null default 'revision' check (estado in ('revision','aprobado','rechazado','error')),
  motivo_revision text,
  resumen text,
  extraccion jsonb not null default '{}'::jsonb,
  comparacion jsonb,
  alerta_enviada boolean not null default false,
  aprobado_en timestamptz,
  rechazado_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists revisiones_seguro_archivos (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references revisiones_seguro(id) on delete cascade,
  nombre_archivo text not null,
  storage_path text not null unique,
  sha256 text not null,
  tamano bigint not null check (tamano > 0 and tamano <= 15728640),
  documento_caso_id uuid references documentos_caso(id) on delete set null,
  creado_en timestamptz not null default now(),
  unique (revision_id, sha256)
);

create index if not exists idx_revisiones_seguro_estado_fecha on revisiones_seguro (estado, creado_en desc);
create index if not exists idx_revisiones_seguro_caso on revisiones_seguro (caso_id, creado_en desc);
create index if not exists idx_revisiones_seguro_identificadores on revisiones_seguro (chasis_detectado, placa_detectada);

alter table revisiones_seguro enable row level security;
alter table revisiones_seguro_archivos enable row level security;
-- Sin políticas para anon/authenticated: solo las APIs con service_role acceden.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('seguros-pendientes', 'seguros-pendientes', false, 15728640, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 15728640, allowed_mime_types = array['application/pdf'];

alter table suplidores add column if not exists email text;
create index if not exists idx_suplidores_email on suplidores (lower(email)) where email is not null;

