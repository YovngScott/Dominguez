alter table public.casos
  add column if not exists etiqueta_organizacion text;

update public.casos
set etiqueta_organizacion = null
where estado in ('listo_para_trabajar', 'vehiculo_en_taller', 'entregado', 'completado')
  and etiqueta_organizacion is not null;

alter table public.casos
  drop constraint if exists casos_etiqueta_organizacion_check;

alter table public.casos
  add constraint casos_etiqueta_organizacion_check
  check (
    etiqueta_organizacion is null
    or (
      etiqueta_organizacion in ('suplir_piezas', 'espera_piezas', 'espera_orden')
      and estado not in ('listo_para_trabajar', 'vehiculo_en_taller', 'entregado', 'completado')
    )
  );

comment on column public.casos.etiqueta_organizacion is
  'Etiqueta operativa visible mientras el caso espera piezas u orden.';

create or replace function public.limpiar_etiqueta_organizacion_por_estado()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.estado in ('listo_para_trabajar', 'vehiculo_en_taller', 'entregado', 'completado') then
    new.etiqueta_organizacion := null;
  end if;
  return new;
end;
$$;

drop trigger if exists casos_limpia_etiqueta_organizacion on public.casos;

create trigger casos_limpia_etiqueta_organizacion
  before insert or update of estado on public.casos
  for each row
  execute function public.limpiar_etiqueta_organizacion_por_estado();
