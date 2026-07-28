-- =========================================================
-- 42_suministros_movimientos.sql
-- Control completo de inventario: entradas, kardex, consumo por vehículo,
-- conteo físico y devoluciones.
--
-- IDEA CENTRAL: todo lo que mueve el stock queda registrado como un
-- "movimiento". El stock del producto es solo el saldo corriente de esos
-- movimientos, y cada uno guarda el saldo antes/después para poder auditar.
--
--   entrada     → llegó mercancía del suplidor        (+)
--   salida      → se despachó un pedido al taller     (−)
--   devolucion  → sobró material y volvió al almacén  (+)
--   ajuste      → conteo físico: se corrige el saldo  (±)
--
-- ▶ Ejecuta TODO este archivo UNA vez en el SQL Editor de Supabase.
--   (Requiere sql/40_suministros.sql y sql/41_suministros_pedido_grupo.sql)
-- =========================================================

-- ---------------------------------------------------------
-- 1. Costo del insumo (lo alimenta cada entrada de mercancía)
-- ---------------------------------------------------------
alter table suministros add column if not exists costo_ultimo numeric(12, 2);
alter table suministros add column if not exists suplidor text;

-- ---------------------------------------------------------
-- 2. Consumo por vehículo: el pedido puede apuntar a un caso
-- ---------------------------------------------------------
alter table suministros_pedidos
  add column if not exists caso_id uuid references casos(id) on delete set null;

create index if not exists idx_sum_pedidos_caso on suministros_pedidos (caso_id);

-- ---------------------------------------------------------
-- 3. KARDEX: todos los movimientos de inventario
-- ---------------------------------------------------------
create table if not exists suministros_movimientos (
  id uuid primary key default gen_random_uuid(),
  suministro_id uuid not null references suministros(id) on delete cascade,
  suministro_nombre text not null,                  -- copia para el historial
  tipo text not null check (tipo in ('entrada', 'salida', 'devolucion', 'ajuste')),
  cantidad numeric(12, 2) not null,                 -- cuánto se movió (siempre positivo)
  stock_antes numeric(12, 2) not null,
  stock_despues numeric(12, 2) not null,

  -- De dónde viene el movimiento
  pedido_id uuid references suministros_pedidos(id) on delete set null,
  caso_id uuid references casos(id) on delete set null,   -- consumo por vehículo
  solicitante text,                                        -- quién lo pidió

  -- Datos de la compra (solo en las entradas)
  suplidor text,
  factura text,
  costo_unitario numeric(12, 2),

  nota text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id) on delete set null
);

create index if not exists idx_sum_mov_suministro on suministros_movimientos (suministro_id, created_at desc);
create index if not exists idx_sum_mov_fecha on suministros_movimientos (created_at desc);
create index if not exists idx_sum_mov_tipo on suministros_movimientos (tipo, created_at desc);
create index if not exists idx_sum_mov_caso on suministros_movimientos (caso_id);

alter table suministros_movimientos enable row level security;

-- Solo el personal del taller ve el kardex. La tablet no.
drop policy if exists "sum_mov_admin_total" on suministros_movimientos;
create policy "sum_mov_admin_total" on suministros_movimientos
  for all to authenticated using (not es_kiosk()) with check (not es_kiosk());

-- ---------------------------------------------------------
-- 4. REGISTRAR UN MOVIMIENTO (atómico)
-- Bloquea el producto, calcula el saldo, valida y guarda todo junto.
--
--   p_cantidad significa:
--     entrada / devolucion / salida → cuánto sumar o restar
--     ajuste                        → el saldo REAL contado en el estante
-- ---------------------------------------------------------
create or replace function registrar_movimiento_suministro(
  p_suministro_id uuid,
  p_tipo text,
  p_cantidad numeric,
  p_nota text default null,
  p_suplidor text default null,
  p_factura text default null,
  p_costo_unitario numeric default null,
  p_caso_id uuid default null,
  p_solicitante text default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
  v_antes numeric(12, 2);
  v_despues numeric(12, 2);
  v_movido numeric(12, 2);
begin
  if es_kiosk() then
    raise exception 'No autorizado para mover el inventario';
  end if;

  if p_tipo not in ('entrada', 'salida', 'devolucion', 'ajuste') then
    raise exception 'Tipo de movimiento no válido: %', p_tipo;
  end if;

  if p_cantidad is null or p_cantidad < 0 then
    raise exception 'La cantidad debe ser un número positivo';
  end if;

  select nombre, stock into v_nombre, v_antes
    from suministros
   where id = p_suministro_id
     for update;

  if not found then
    raise exception 'El suministro no existe';
  end if;

  if p_tipo = 'ajuste' then
    v_despues := p_cantidad;                 -- lo que realmente hay
    v_movido := abs(p_cantidad - v_antes);   -- la diferencia encontrada
  elsif p_tipo in ('entrada', 'devolucion') then
    if p_cantidad = 0 then
      raise exception 'La cantidad no puede ser cero';
    end if;
    v_despues := v_antes + p_cantidad;
    v_movido := p_cantidad;
  else -- salida
    if p_cantidad = 0 then
      raise exception 'La cantidad no puede ser cero';
    end if;
    if v_antes < p_cantidad then
      raise exception 'Stock insuficiente de "%": quedan % y se sacan %',
        v_nombre, v_antes, p_cantidad;
    end if;
    v_despues := v_antes - p_cantidad;
    v_movido := p_cantidad;
  end if;

  update suministros
     set stock = v_despues,
         -- cada compra actualiza el costo y el suplidor de referencia
         costo_ultimo = case
           when p_tipo = 'entrada' and p_costo_unitario is not null
             then p_costo_unitario else costo_ultimo end,
         suplidor = case
           when p_tipo = 'entrada' and p_suplidor is not null
             then p_suplidor else suplidor end
   where id = p_suministro_id;

  -- Un conteo sin diferencia no ensucia el kardex (no movió stock).
  if v_movido = 0 then
    return v_despues;
  end if;

  insert into suministros_movimientos (
    suministro_id, suministro_nombre, tipo, cantidad, stock_antes, stock_despues,
    caso_id, solicitante, suplidor, factura, costo_unitario, nota
  ) values (
    p_suministro_id, v_nombre, p_tipo, v_movido, v_antes, v_despues,
    p_caso_id, p_solicitante, p_suplidor, p_factura, p_costo_unitario, p_nota
  );

  return v_despues;
end;
$$;

revoke execute on function registrar_movimiento_suministro(uuid, text, numeric, text, text, text, numeric, uuid, text) from public;
grant execute on function registrar_movimiento_suministro(uuid, text, numeric, text, text, text, numeric, uuid, text) to authenticated;

-- ---------------------------------------------------------
-- 5. DESPACHO: ahora también deja rastro en el kardex
-- (reemplaza la versión de 41_suministros_pedido_grupo.sql)
-- ---------------------------------------------------------
create or replace function despachar_grupo_suministros(p_grupo_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_stock numeric(12, 2);
  v_total int := 0;
begin
  if es_kiosk() then
    raise exception 'No autorizado para despachar pedidos';
  end if;

  for r in
    select id, suministro_id, suministro_nombre, cantidad, solicitante, nota, caso_id
      from suministros_pedidos
     where grupo_id = p_grupo_id
       and estado = 'pendiente'
     order by created_at
       for update
  loop
    select stock into v_stock
      from suministros
     where id = r.suministro_id
       for update;

    if not found then
      raise exception 'El suministro "%" ya no existe', r.suministro_nombre;
    end if;

    if v_stock < r.cantidad then
      raise exception 'Stock insuficiente de "%": quedan % y se piden %',
        r.suministro_nombre, v_stock, r.cantidad;
    end if;

    update suministros
       set stock = stock - r.cantidad
     where id = r.suministro_id;

    update suministros_pedidos
       set estado = 'entregado',
           entregado_at = now(),
           entregado_by = auth.uid()
     where id = r.id;

    insert into suministros_movimientos (
      suministro_id, suministro_nombre, tipo, cantidad, stock_antes, stock_despues,
      pedido_id, caso_id, solicitante, nota
    ) values (
      r.suministro_id, r.suministro_nombre, 'salida', r.cantidad, v_stock, v_stock - r.cantidad,
      r.id, r.caso_id, r.solicitante, r.nota
    );

    v_total := v_total + 1;
  end loop;

  if v_total = 0 then
    raise exception 'Este pedido ya fue procesado';
  end if;

  return v_total;
end;
$$;

revoke execute on function despachar_grupo_suministros(uuid) from public;
grant execute on function despachar_grupo_suministros(uuid) to authenticated;

-- ---------------------------------------------------------
-- 6. VEHÍCULOS VISIBLES PARA LA TABLET
-- La tablet necesita decir "esto es para el Toyota de la bahía 3", pero NO
-- puede ver los datos del cliente ni montos. Esta vista expone únicamente la
-- identificación del vehículo. Al ser una vista normal (security_invoker=false)
-- corre con permisos de su dueño, así el bloqueo de la tabla "casos" no impide
-- leer estas columnas seguras.
-- ---------------------------------------------------------
create or replace view casos_kiosk as
  select c.id,
         c.placa,
         c.numero_reclamo,
         m.nombre as marca,
         mo.nombre as modelo,
         c.anio
    from casos c
    left join marcas m on m.id = c.marca_id
    left join modelos mo on mo.id = c.modelo_id
   where c.estado <> 'entregado';

grant select on casos_kiosk to authenticated;

-- ---------------------------------------------------------
-- 7. REPORTE DE CONSUMO POR PERÍODO
-- Devuelve, por insumo, cuánto entró / salió / se devolvió en el rango y el
-- costo estimado de lo consumido (con el último costo de compra conocido).
-- ---------------------------------------------------------
create or replace function reporte_consumo_suministros(p_desde timestamptz, p_hasta timestamptz)
returns table (
  suministro_id uuid,
  nombre text,
  unidad text,
  entradas numeric,
  salidas numeric,
  devoluciones numeric,
  consumo_neto numeric,
  costo_estimado numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select m.suministro_id,
         max(m.suministro_nombre) as nombre,
         max(coalesce(s.unidad, 'unidad')) as unidad,
         coalesce(sum(m.cantidad) filter (where m.tipo = 'entrada'), 0) as entradas,
         coalesce(sum(m.cantidad) filter (where m.tipo = 'salida'), 0) as salidas,
         coalesce(sum(m.cantidad) filter (where m.tipo = 'devolucion'), 0) as devoluciones,
         coalesce(sum(m.cantidad) filter (where m.tipo = 'salida'), 0)
           - coalesce(sum(m.cantidad) filter (where m.tipo = 'devolucion'), 0) as consumo_neto,
         (coalesce(sum(m.cantidad) filter (where m.tipo = 'salida'), 0)
           - coalesce(sum(m.cantidad) filter (where m.tipo = 'devolucion'), 0))
           * coalesce(max(s.costo_ultimo), 0) as costo_estimado
    from suministros_movimientos m
    left join suministros s on s.id = m.suministro_id
   where not es_kiosk()
     and m.created_at >= p_desde
     and m.created_at < p_hasta
   group by m.suministro_id
   order by consumo_neto desc;
$$;

revoke execute on function reporte_consumo_suministros(timestamptz, timestamptz) from public;
grant execute on function reporte_consumo_suministros(timestamptz, timestamptz) to authenticated;
