-- =========================================================
-- 04_storage_setup.sql
-- Buckets de Storage y políticas de acceso
-- Puedes ejecutar esto en el SQL Editor, o crear los buckets
-- manualmente desde Storage > New bucket en el Dashboard.
-- =========================================================

-- Bucket privado para las fotos de evidencia de cada caso (hasta 50 por caso)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-casos', 'fotos-casos', false, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- Bucket privado para los PDF (cotizaciones del taller y del seguro)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos-casos', 'documentos-casos', false, 52428800, array['application/pdf'])
on conflict (id) do nothing;

-- Bucket público (solo lectura) para los logos de las aseguradoras
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos-aseguradoras', 'logos-aseguradoras', true, 2097152, array['image/png','image/jpeg','image/svg+xml','image/webp'])
on conflict (id) do nothing;

-- ---------------------------------------------------------
-- Políticas: solo usuarios autenticados (administradores) pueden
-- leer/escribir en los buckets privados. El bucket de logos es
-- de lectura pública para poder mostrarlos sin sesión en el dashboard.
-- ---------------------------------------------------------

create policy "fotos_casos_admin_rw"
on storage.objects for all
to authenticated
using (bucket_id = 'fotos-casos')
with check (bucket_id = 'fotos-casos');

create policy "documentos_casos_admin_rw"
on storage.objects for all
to authenticated
using (bucket_id = 'documentos-casos')
with check (bucket_id = 'documentos-casos');

create policy "logos_aseguradoras_lectura_publica"
on storage.objects for select
to public
using (bucket_id = 'logos-aseguradoras');

create policy "logos_aseguradoras_admin_escritura"
on storage.objects for insert
to authenticated
with check (bucket_id = 'logos-aseguradoras');

create policy "logos_aseguradoras_admin_update"
on storage.objects for update
to authenticated
using (bucket_id = 'logos-aseguradoras')
with check (bucket_id = 'logos-aseguradoras');

create policy "logos_aseguradoras_admin_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'logos-aseguradoras');

-- ---------------------------------------------------------
-- Convención de rutas (storage_path) usada por el frontend:
--   fotos-casos/<caso_id>/<categoria_id>/<uuid>.jpg
--   documentos-casos/<caso_id>/<uuid>.pdf
--   logos-aseguradoras/<aseguradora_id>.png
-- ---------------------------------------------------------
