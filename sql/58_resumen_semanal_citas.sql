-- Idempotencia de avisos semanales y cambios posteriores de la misma semana.
create table if not exists citas_resumen_semanal (
  semana_inicio date primary key,
  citas_ids jsonb not null default '[]'::jsonb,
  enviado_at timestamptz not null default now()
);
alter table citas_resumen_semanal enable row level security;
-- La tabla solo la usa el cron con service_role; no se expone al navegador.
