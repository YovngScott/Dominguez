-- =========================================================
-- 40_suministros.sql
-- Módulo de Requisición y Despacho de Suministros (Almacén).
--
-- Incluye:
--   1. Roles (perfiles) para aislar la tablet del resto del sistema.
--   2. Catálogo de suministros (insumos del taller) + bucket de imágenes.
--   3. Pedidos de la tablet, con despacho ATÓMICO que descuenta el stock.
--
-- ▶ Ejecuta TODO este archivo UNA vez en el SQL Editor de Supabase.
-- =========================================================

-- ---------------------------------------------------------
-- 1. ROLES
-- Los usuarios existentes NO necesitan fila aquí: si no tienen perfil se
-- consideran admin (así nada de lo que ya funciona se rompe). Solo el usuario
-- de la tablet se marca explícitamente como 'almacen_kiosk' y queda aislado.
-- ---------------------------------------------------------
create table if not exists perfiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rol text not null default 'admin' check (rol in ('admin', 'almacen_kiosk')),
  nombre text,
  created_at timestamptz not null default now()
);

alter table perfiles enable row level security;

-- Cada usuario puede leer su propio perfil (lo necesita la app para saber
-- qué vista mostrar). Solo los admin pueden crear/modificar perfiles.
drop policy if exists "perfiles_lectura_propia" on perfiles;
create policy "perfiles_lectura_propia" on perfiles
  for select to authenticated using (user_id = auth.uid());

-- ¿El usuario actual es el de la tablet? security definer para poder leer
-- perfiles sin depender de las políticas de la propia tabla.
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
       and rol = 'almacen_kiosk'
  );
$$;

revoke execute on function es_kiosk() from public;
grant execute on function es_kiosk() to authenticated;

drop policy if exists "perfiles_admin_total" on perfiles;
create policy "perfiles_admin_total" on perfiles
  for all to authenticated using (not es_kiosk()) with check (not es_kiosk());

-- ---------------------------------------------------------
-- 2. AISLAMIENTO DE LA TABLET
-- Políticas RESTRICTIVAS: se suman (AND) a las que ya existen, así no hay que
-- tocar ninguna política actual. El usuario de la tablet queda sin acceso a
-- casos, clientes, cotizaciones, finanzas ni ningún otro dato del negocio.
-- ---------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'casos', 'clientes', 'cotizaciones', 'cotizacion_evidencias', 'ordenes_reparacion',
    'citas', 'documentos_caso', 'fotos_caso', 'historial_caso', 'piezas_recibidas',
    'etiquetas_piezas', 'aseguradora_contactos', 'aseguradoras', 'marcas', 'modelos',
    'categorias_foto', 'piezas_catalogo', 'servicios_catalogo', 'tipos_documento'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "bloquea_kiosk_%1$s" on public.%1$I', t);
      execute format(
        'create policy "bloquea_kiosk_%1$s" on public.%1$I as restrictive for all to authenticated
           using (not es_kiosk()) with check (not es_kiosk())', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------
-- 3. CATÁLOGO DE SUMINISTROS
-- ---------------------------------------------------------
create table if not exists suministros (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  categoria text,                                  -- Lijas, Pinturas, Cintas, Químicos…
  unidad text not null default 'unidad',           -- unidad, galón, litro, rollo, caja…
  stock numeric(12, 2) not null default 0 check (stock >= 0),
  stock_minimo numeric(12, 2) not null default 0,  -- para avisar "quedan pocas"
  imagen_url text,
  imagen_path text,                                -- ruta en el bucket (para poder borrarla)
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_suministros_nombre on suministros (nombre);
create index if not exists idx_suministros_activo on suministros (activo) where activo;

drop trigger if exists trg_suministros_updated_at on suministros;
create trigger trg_suministros_updated_at
  before update on suministros
  for each row execute function set_updated_at();

alter table suministros enable row level security;

-- Admin: control total. Tablet: SOLO lectura (nunca puede tocar el stock).
drop policy if exists "suministros_admin_total" on suministros;
create policy "suministros_admin_total" on suministros
  for all to authenticated using (not es_kiosk()) with check (not es_kiosk());

drop policy if exists "suministros_kiosk_lectura" on suministros;
create policy "suministros_kiosk_lectura" on suministros
  for select to authenticated using (true);

-- ---------------------------------------------------------
-- 4. PEDIDOS (requisiciones hechas desde la tablet)
-- ---------------------------------------------------------
create table if not exists suministros_pedidos (
  id uuid primary key default gen_random_uuid(),
  suministro_id uuid not null references suministros(id) on delete restrict,
  suministro_nombre text not null,                 -- copia, para el historial
  cantidad numeric(12, 2) not null check (cantidad > 0),
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'entregado', 'cancelado')),
  solicitante text,                                -- quién lo pide (la tablet es compartida)
  nota text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  entregado_at timestamptz,
  entregado_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_sum_pedidos_estado on suministros_pedidos (estado, created_at desc);
create index if not exists idx_sum_pedidos_suministro on suministros_pedidos (suministro_id);

alter table suministros_pedidos enable row level security;

-- Admin (almacén): control total sobre los pedidos.
drop policy if exists "sum_pedidos_admin_total" on suministros_pedidos;
create policy "sum_pedidos_admin_total" on suministros_pedidos
  for all to authenticated using (not es_kiosk()) with check (not es_kiosk());

-- Tablet: solo puede CREAR pedidos pendientes a su nombre (no puede entregar,
-- ni editar, ni marcar como entregado algo que ella misma pidió).
drop policy if exists "sum_pedidos_kiosk_crear" on suministros_pedidos;
create policy "sum_pedidos_kiosk_crear" on suministros_pedidos
  for insert to authenticated
  with check (estado = 'pendiente' and created_by = auth.uid());

-- Tablet: puede ver los pedidos que ella misma creó (para el "ya lo pediste").
drop policy if exists "sum_pedidos_kiosk_ver_propios" on suministros_pedidos;
create policy "sum_pedidos_kiosk_ver_propios" on suministros_pedidos
  for select to authenticated using (created_by = auth.uid() or not es_kiosk());

-- ---------------------------------------------------------
-- 5. DESPACHO ATÓMICO
-- Todo ocurre dentro de una sola transacción con la fila bloqueada
-- (FOR UPDATE): se valida el estado, se valida el stock, se descuenta y se
-- marca como entregado. Si algo falla, no se aplica nada.
-- ---------------------------------------------------------
create or replace function despachar_pedido_suministro(p_pedido_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_suministro_id uuid;
  v_cantidad numeric(12, 2);
  v_estado text;
  v_stock numeric(12, 2);
begin
  -- security definer se salta RLS: la autorización se valida aquí.
  if es_kiosk() then
    raise exception 'No autorizado para despachar pedidos';
  end if;

  -- Bloquea el pedido para que dos personas no puedan despacharlo a la vez.
  select suministro_id, cantidad, estado
    into v_suministro_id, v_cantidad, v_estado
    from suministros_pedidos
   where id = p_pedido_id
     for update;

  if not found then
    raise exception 'El pedido no existe';
  end if;

  if v_estado <> 'pendiente' then
    raise exception 'Este pedido ya fue procesado (estado: %)', v_estado;
  end if;

  -- Bloquea también el suministro para que el stock no cambie en el proceso.
  select stock into v_stock
    from suministros
   where id = v_suministro_id
     for update;

  if not found then
    raise exception 'El suministro ya no existe';
  end if;

  if v_stock < v_cantidad then
    raise exception 'Stock insuficiente: quedan % y se piden %', v_stock, v_cantidad;
  end if;

  update suministros
     set stock = stock - v_cantidad
   where id = v_suministro_id;

  update suministros_pedidos
     set estado = 'entregado',
         entregado_at = now(),
         entregado_by = auth.uid()
   where id = p_pedido_id;

  return v_stock - v_cantidad;  -- stock que queda, para refrescar la pantalla
end;
$$;

revoke execute on function despachar_pedido_suministro(uuid) from public;
grant execute on function despachar_pedido_suministro(uuid) to authenticated;

-- ---------------------------------------------------------
-- 6. TIEMPO REAL
-- Permite que el panel del almacén reciba los pedidos al instante.
-- ---------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table suministros_pedidos;
exception
  when duplicate_object then null;  -- ya estaba publicada
  when undefined_object then null;  -- no existe la publicación (self-hosted)
end $$;

-- ---------------------------------------------------------
-- 7. BUCKET DE IMÁGENES DE LOS PRODUCTOS
-- Público de lectura: son fotos de insumos (lijas, pinturas), no datos
-- sensibles, y así la tablet las carga rápido y sin URLs que expiren.
-- ---------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('suministros', 'suministros', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "suministros_img_lectura" on storage.objects;
create policy "suministros_img_lectura" on storage.objects
  for select to public using (bucket_id = 'suministros');

drop policy if exists "suministros_img_escritura" on storage.objects;
create policy "suministros_img_escritura" on storage.objects
  for insert to authenticated with check (bucket_id = 'suministros' and not es_kiosk());

drop policy if exists "suministros_img_borrado" on storage.objects;
create policy "suministros_img_borrado" on storage.objects
  for delete to authenticated using (bucket_id = 'suministros' and not es_kiosk());

-- La tablet tampoco puede entrar a los buckets privados del negocio.
drop policy if exists "bloquea_kiosk_storage" on storage.objects;
create policy "bloquea_kiosk_storage" on storage.objects
  as restrictive for all to authenticated
  using (bucket_id = 'suministros' or not es_kiosk())
  with check (bucket_id = 'suministros' or not es_kiosk());

-- =========================================================
-- CÓMO CREAR EL USUARIO DE LA TABLET
--   1. Authentication → Users → Add user  (ej. tablet@dominguezapintura.com)
--   2. Copia su UUID y ejecuta aquí:
--        insert into perfiles (user_id, rol, nombre)
--        values ('PEGA-EL-UUID-AQUI', 'almacen_kiosk', 'Tablet taller');
--   3. Inicia sesión con ese usuario en la tablet: la app lo llevará
--      automáticamente a /kiosk/suministros y no podrá salir de ahí.
-- =========================================================
