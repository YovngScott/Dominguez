-- Llaves físicas del taller: una llave (1-64) solo puede pertenecer a un
-- vehículo activo. Ejecutar una sola vez en el SQL Editor de Supabase.

alter table casos add column if not exists numero_llave smallint;

alter table casos drop constraint if exists casos_numero_llave_rango;
alter table casos add constraint casos_numero_llave_rango
  check (numero_llave is null or numero_llave between 1 and 64);

-- Garantiza que dos vehículos activos nunca reciban la misma llave, incluso
-- si dos personas intentan asignarla al mismo tiempo.
create unique index if not exists casos_llave_activa_unica
  on casos (numero_llave)
  where numero_llave is not null and estado <> 'entregado';

-- Respaldo a la interfaz: cualquier actualización que entregue el vehículo
-- libera inmediatamente su llave física.
create or replace function liberar_llave_al_entregar()
returns trigger as $$
begin
  if new.estado = 'entregado' then
    new.numero_llave = null;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_liberar_llave_al_entregar on casos;
create trigger trg_liberar_llave_al_entregar
  before update of estado on casos
  for each row execute function liberar_llave_al_entregar();
