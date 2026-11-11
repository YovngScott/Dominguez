begin;
alter table public.casos drop constraint if exists casos_etiqueta_organizacion_check;
alter table public.casos add constraint casos_etiqueta_organizacion_check check (
  etiqueta_organizacion is null
  or (estado = 'vehiculo_en_taller' and etiqueta_organizacion = 'suplir_piezas')
  or (etiqueta_organizacion in ('suplir_piezas','espera_piezas','espera_orden')
      and estado not in ('listo_para_trabajar','vehiculo_en_taller','entregado','completado'))
);
create or replace function public.limpiar_etiqueta_organizacion_por_estado()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.estado in ('listo_para_trabajar','entregado','completado')
    or (new.estado='vehiculo_en_taller' and new.etiqueta_organizacion <> 'suplir_piezas') then
    new.etiqueta_organizacion := null;
  end if;
  return new;
end;
$$;
comment on column public.casos.etiqueta_organizacion is
  'Etiqueta operativa de espera. En el taller admite Suplir piezas.';
commit;
