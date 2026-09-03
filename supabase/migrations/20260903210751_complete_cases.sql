-- Permite cerrar administrativamente un caso que aún está en espera de
-- piezas. "completado" es distinto de "entregado": no confirma entrega ni
-- exige firma del cliente.
alter table public.casos drop constraint if exists casos_estado_check;
alter table public.casos add constraint casos_estado_check
  check (estado in (
    'en_espera_piezas',
    'listo_para_trabajar',
    'vehiculo_en_taller',
    'completado',
    'entregado'
  ));

-- Un caso completado deja de reservar una llave física, igual que uno
-- entregado. Conservamos el nombre de la función porque el trigger existente
-- ya la utiliza.
create or replace function public.liberar_llave_al_entregar()
returns trigger as $$
begin
  if new.estado in ('entregado', 'completado') then
    new.numero_llave = null;
  end if;
  return new;
end;
$$ language plpgsql;

drop index if exists public.casos_llave_activa_unica;
create unique index casos_llave_activa_unica
  on public.casos (numero_llave)
  where numero_llave is not null
    and estado not in ('entregado', 'completado');
