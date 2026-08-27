-- Índices compuestos para las consultas que dominan el flujo diario.
-- Se limitan a filtros + ordenamientos observados en la aplicación para evitar
-- sobreindexar y encarecer inserciones/actualizaciones.
create index if not exists idx_cotizaciones_caso_created_desc
  on public.cotizaciones (caso_id, created_at desc);

create index if not exists idx_citas_caso_fecha_hora
  on public.citas (caso_id, fecha, hora);

create index if not exists idx_casos_estado_updated_desc
  on public.casos (estado, updated_at desc);

comment on index public.idx_cotizaciones_caso_created_desc is
  'Acelera cotizaciones de un caso ordenadas desde la más reciente.';
comment on index public.idx_citas_caso_fecha_hora is
  'Acelera la agenda de un caso en orden cronológico.';
comment on index public.idx_casos_estado_updated_desc is
  'Acelera paneles operativos por estado y actividad reciente.';
