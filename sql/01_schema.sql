-- =========================================================
-- 01_schema.sql
-- Sistema de Digitalización de Taller Automotriz
-- Tablas, relaciones, índices y políticas RLS
-- Ejecutar completo en el SQL Editor de Supabase
-- =========================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists pg_trgm;    -- búsqueda difusa (placa, chasis, reclamo, nombre)

-- =========================================================
-- ASEGURADORAS (incluye la categoría "Personal")
-- =========================================================
create table if not exists aseguradoras (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  logo_url text,
  es_personal boolean not null default false, -- true solo para la categoría "Personal"
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now()
);

-- =========================================================
-- MARCAS Y MODELOS DE VEHÍCULOS
-- =========================================================
create table if not exists marcas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique
);

create table if not exists modelos (
  id uuid primary key default gen_random_uuid(),
  marca_id uuid not null references marcas(id) on delete cascade,
  nombre text not null,
  unique (marca_id, nombre)
);

create index if not exists idx_modelos_marca on modelos (marca_id);

-- =========================================================
-- CLIENTES / ASEGURADOS
-- =========================================================
create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  nombre_completo text not null,
  documento_identidad text,
  telefono text,
  email text,
  direccion text,
  created_at timestamptz not null default now()
);

create index if not exists idx_clientes_nombre_trgm
  on clientes using gin (nombre_completo gin_trgm_ops);

-- =========================================================
-- CATEGORÍAS DE FOTO Y TIPOS DE DOCUMENTO (catálogos editables)
-- =========================================================
create table if not exists categorias_foto (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  orden int not null default 0
);

create table if not exists tipos_documento (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  orden int not null default 0
);

-- =========================================================
-- CASOS (vehículo + expediente de reparación)
-- =========================================================
create table if not exists casos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete restrict,
  aseguradora_id uuid not null references aseguradoras(id) on delete restrict,
  marca_id uuid references marcas(id),
  modelo_id uuid references modelos(id),
  anio int,
  color text,
  chasis text,
  placa text,
  numero_reclamo text,
  numero_poliza text,
  estado text not null default 'en_espera_piezas'
    check (estado in ('en_espera_piezas', 'listo_para_trabajar', 'entregado')),
  fecha_ingreso date not null default current_date,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index if not exists idx_casos_aseguradora on casos (aseguradora_id);
create index if not exists idx_casos_cliente on casos (cliente_id);
create index if not exists idx_casos_placa_trgm on casos using gin (placa gin_trgm_ops);
create index if not exists idx_casos_chasis_trgm on casos using gin (chasis gin_trgm_ops);
create index if not exists idx_casos_reclamo_trgm on casos using gin (numero_reclamo gin_trgm_ops);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_casos_updated_at on casos;
create trigger trg_casos_updated_at
  before update on casos
  for each row execute function set_updated_at();

-- =========================================================
-- FOTOS DEL CASO (máximo 50 por caso)
-- =========================================================
create table if not exists fotos_caso (
  id uuid primary key default gen_random_uuid(),
  caso_id uuid not null references casos(id) on delete cascade,
  categoria_id uuid references categorias_foto(id),
  storage_path text not null,
  url text not null,
  descripcion text,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references auth.users(id)
);

create index if not exists idx_fotos_caso on fotos_caso (caso_id);

create or replace function check_max_fotos()
returns trigger as $$
begin
  if (select count(*) from fotos_caso where caso_id = new.caso_id) >= 50 then
    raise exception 'Este caso ya alcanzó el máximo de 50 fotos permitidas';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_max_fotos on fotos_caso;
create trigger trg_max_fotos
  before insert on fotos_caso
  for each row execute function check_max_fotos();

-- =========================================================
-- DOCUMENTOS PDF DEL CASO (cotizaciones taller / seguro / otros)
-- =========================================================
create table if not exists documentos_caso (
  id uuid primary key default gen_random_uuid(),
  caso_id uuid not null references casos(id) on delete cascade,
  tipo_id uuid references tipos_documento(id),
  nombre_archivo text not null,
  storage_path text not null,
  url text not null,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references auth.users(id)
);

create index if not exists idx_documentos_caso on documentos_caso (caso_id);

-- =========================================================
-- ROW LEVEL SECURITY
-- Uso exclusivo de administradores autenticados.
-- Cualquier usuario autenticado en Supabase Auth tiene acceso total;
-- los usuarios anónimos no tienen ningún acceso.
-- Si en el futuro se necesitan roles (ej. admin vs. solo lectura),
-- crear una tabla "perfiles" ligada a auth.users y ajustar las
-- condiciones "using"/"with check" de estas políticas.
-- =========================================================

alter table aseguradoras      enable row level security;
alter table marcas            enable row level security;
alter table modelos           enable row level security;
alter table clientes          enable row level security;
alter table categorias_foto   enable row level security;
alter table tipos_documento   enable row level security;
alter table casos             enable row level security;
alter table fotos_caso        enable row level security;
alter table documentos_caso   enable row level security;

create policy "admin_total_aseguradoras" on aseguradoras
  for all to authenticated using (true) with check (true);

create policy "admin_total_marcas" on marcas
  for all to authenticated using (true) with check (true);

create policy "admin_total_modelos" on modelos
  for all to authenticated using (true) with check (true);

create policy "admin_total_clientes" on clientes
  for all to authenticated using (true) with check (true);

create policy "admin_total_categorias_foto" on categorias_foto
  for all to authenticated using (true) with check (true);

create policy "admin_total_tipos_documento" on tipos_documento
  for all to authenticated using (true) with check (true);

create policy "admin_total_casos" on casos
  for all to authenticated using (true) with check (true);

create policy "admin_total_fotos_caso" on fotos_caso
  for all to authenticated using (true) with check (true);

create policy "admin_total_documentos_caso" on documentos_caso
  for all to authenticated using (true) with check (true);
