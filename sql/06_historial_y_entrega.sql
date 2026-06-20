-- =========================================================
-- 06_historial_y_entrega.sql
-- Agrega:
--   * Bitácora automática de cada caso (historial_caso) con trigger.
--   * Datos de entrega: fecha y firma digital del cliente.
-- ▶ Ejecuta TODO este archivo UNA vez en el SQL Editor de Supabase.
-- =========================================================

-- ----- Columnas de entrega en casos -----
alter table casos add column if not exists fecha_entrega timestamptz;
alter table casos add column if not exists firma_entrega_url text;

-- ----- Bitácora del caso -----
create table if not exists historial_caso (
  id uuid primary key default gen_random_uuid(),
  caso_id uuid not null references casos(id) on delete cascade,
  tipo text not null,            -- 'creado' | 'estado' | 'nota'
  descripcion text not null,
  estado_nuevo text,
  user_email text,
  created_at timestamptz not null default now()
);

create index if not exists idx_historial_caso on historial_caso (caso_id, created_at);

alter table historial_caso enable row level security;

drop policy if exists "admin_total_historial" on historial_caso;
create policy "admin_total_historial" on historial_caso
  for all to authenticated using (true) with check (true);

-- ----- Trigger que registra creación y cambios de estado -----
create or replace function log_caso_evento()
returns trigger
language plpgsql
security definer
as $$
declare
  email text;
begin
  email := coalesce(auth.jwt() ->> 'email', 'sistema');

  if (tg_op = 'INSERT') then
    insert into historial_caso (caso_id, tipo, descripcion, estado_nuevo, user_email)
    values (new.id, 'creado', 'Caso registrado en el sistema', new.estado, email);

  elsif (tg_op = 'UPDATE' and new.estado is distinct from old.estado) then
    insert into historial_caso (caso_id, tipo, descripcion, estado_nuevo, user_email)
    values (new.id, 'estado', 'Estado actualizado', new.estado, email);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_log_caso_insert on casos;
create trigger trg_log_caso_insert
  after insert on casos
  for each row execute function log_caso_evento();

drop trigger if exists trg_log_caso_update on casos;
create trigger trg_log_caso_update
  after update on casos
  for each row execute function log_caso_evento();
