-- Estado y exclusión mutua para la revisión automática de Gmail. La tabla no
-- se expone al navegador: solamente la API con service_role puede modificarla.
create table public.asistente_correo_poll_estado (
  id text primary key,
  lock_token uuid,
  bloqueado_hasta timestamptz,
  ultima_ejecucion_inicio timestamptz,
  ultima_ejecucion_fin timestamptz,
  ultimo_resultado jsonb,
  ultimo_error text,
  actualizado_en timestamptz not null default now(),
  constraint asistente_correo_poll_estado_id_check check (id = 'gmail')
);

insert into public.asistente_correo_poll_estado (id) values ('gmail');

alter table public.asistente_correo_poll_estado enable row level security;
revoke all on table public.asistente_correo_poll_estado from anon, authenticated;

-- pg_cron hace la llamada cada dos minutos. El valor del encabezado se obtiene
-- en tiempo de ejecución desde Vault y nunca queda escrito en cron.job.
select cron.schedule(
  'gmail-seguros-automatico',
  '*/2 * * * *',
  $cron$
    select net.http_post(
      url := 'https://dominguez.vercel.app/api/procesar-seguro?action=insurance_gmail_poll',
      body := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-supabase-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'dominguez_gmail_poll_secret'
          limit 1
        )
      ),
      timeout_milliseconds := 55000
    ) as request_id;
  $cron$
);
