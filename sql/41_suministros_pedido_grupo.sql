-- =========================================================
-- 41_suministros_pedido_grupo.sql
-- Permite pedir VARIOS artículos en una sola solicitud.
--
-- Cada artículo sigue siendo una fila (así el stock se descuenta por producto
-- y el historial queda detallado), pero los que se envían juntos comparten un
-- mismo "grupo_id" y el almacén los ve y despacha como un solo pedido.
--
-- ▶ Ejecuta TODO este archivo UNA vez en el SQL Editor de Supabase.
--   (Requiere haber ejecutado antes sql/40_suministros.sql)
-- =========================================================

alter table suministros_pedidos
  add column if not exists grupo_id uuid not null default gen_random_uuid();

create index if not exists idx_sum_pedidos_grupo on suministros_pedidos (grupo_id);

-- ---------------------------------------------------------
-- Despacho de un pedido COMPLETO (todos sus artículos a la vez).
-- Todo o nada: si a un solo artículo le falta stock, no se despacha ninguno
-- y no se descuenta nada (la transacción se revierte completa).
-- Devuelve cuántos artículos se despacharon.
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

  -- Bloquea todos los renglones pendientes del pedido de una vez.
  for r in
    select id, suministro_id, suministro_nombre, cantidad
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
