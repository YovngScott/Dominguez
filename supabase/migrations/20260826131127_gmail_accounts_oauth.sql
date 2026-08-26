-- Cuentas Gmail de solo lectura. Los refresh tokens se cifran en la API antes
-- de persistirse y nunca son accesibles mediante el Data API.
create table public.asistente_correo_cuentas (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  etiqueta text not null default 'Correo del taller',
  refresh_token_cifrado text not null,
  activa boolean not null default true,
  ultimo_message_id text,
  ultima_revision timestamptz,
  ultimo_error text,
  conectada_en timestamptz not null default now(),
  actualizada_en timestamptz not null default now()
);

create index asistente_correo_cuentas_revision_idx
  on public.asistente_correo_cuentas (activa, ultima_revision);

alter table public.asistente_correo_cuentas enable row level security;
revoke all on table public.asistente_correo_cuentas from anon, authenticated;
-- Deliberadamente sin políticas: solo la API con service_role puede acceder.
