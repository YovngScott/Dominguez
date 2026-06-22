-- =========================================================
-- 20_backfill_casos_recibos.sql
-- Repara los recibos creados ANTES de que el sistema enlazara/creara el
-- caso automáticamente: por cada recibo sin caso_id, busca un caso con el
-- mismo chasis (y lo enlaza) o, si no existe ninguno, crea uno nuevo con
-- los datos del recibo (cliente, vehículo, aseguradora) en estado
-- "Vehículo en el taller".
-- ▶ Ejecuta UNA vez en el SQL Editor de Supabase.
-- =========================================================

do $$
declare
  r record;
  v_caso_id uuid;
  v_estado_actual text;
  v_cliente_id uuid;
  v_marca_id uuid;
  v_modelo_id uuid;
  v_aseguradora_id uuid;
  v_anio int;
begin
  for r in select * from ordenes_reparacion where caso_id is null loop
    v_caso_id := null;

    -- 1) ¿Ya existe un caso con este chasis?
    if r.chasis is not null and length(trim(r.chasis)) > 0 then
      select id, estado into v_caso_id, v_estado_actual
        from casos
       where chasis ilike trim(r.chasis)
       order by created_at desc
       limit 1;
    end if;

    if v_caso_id is not null then
      if v_estado_actual is distinct from 'entregado' then
        update casos set estado = 'vehiculo_en_taller' where id = v_caso_id;
      end if;
    else
      -- 2) No hay caso: se crea uno nuevo con los datos del recibo.
      insert into clientes (nombre_completo, telefono, email, direccion)
      values (
        coalesce(r.cliente, 'Sin nombre'),
        nullif(trim(concat_ws(' / ', r.tel, r.cel)), ''),
        r.email,
        r.direccion
      )
      returning id into v_cliente_id;

      v_marca_id := null;
      if r.marca is not null and length(trim(r.marca)) > 0 then
        select id into v_marca_id from marcas where nombre ilike trim(r.marca) limit 1;
        if v_marca_id is null then
          insert into marcas (nombre) values (trim(r.marca)) returning id into v_marca_id;
        end if;
      end if;

      v_modelo_id := null;
      if v_marca_id is not null and r.modelo is not null and length(trim(r.modelo)) > 0 then
        select id into v_modelo_id from modelos
          where marca_id = v_marca_id and nombre ilike trim(r.modelo) limit 1;
        if v_modelo_id is null then
          insert into modelos (marca_id, nombre) values (v_marca_id, trim(r.modelo)) returning id into v_modelo_id;
        end if;
      end if;

      v_aseguradora_id := null;
      if r.cia_seguro is not null and length(trim(r.cia_seguro)) > 0 then
        select id into v_aseguradora_id from aseguradoras where nombre ilike trim(r.cia_seguro) limit 1;
        if v_aseguradora_id is null then
          insert into aseguradoras (nombre) values (trim(r.cia_seguro)) returning id into v_aseguradora_id;
        end if;
      end if;
      if v_aseguradora_id is null then
        select id into v_aseguradora_id from aseguradoras where es_personal = true limit 1;
      end if;

      v_anio := null;
      if r.anio ~ '^\d+$' then
        v_anio := r.anio::int;
      end if;

      insert into casos (cliente_id, aseguradora_id, marca_id, modelo_id, anio, color, chasis, placa, estado, created_by)
      values (v_cliente_id, v_aseguradora_id, v_marca_id, v_modelo_id, v_anio, r.color, r.chasis, r.placa, 'vehiculo_en_taller', r.created_by)
      returning id into v_caso_id;
    end if;

    update ordenes_reparacion set caso_id = v_caso_id where id = r.id;
  end loop;
end $$;
