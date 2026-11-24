-- DOCUMENTOS DEL CASO: PDF, Word, Excel y cualquier otro formato.
-- Ejecutar en el SQL Editor del proyecto Dominguez.
-- Conserva el bucket privado, sus archivos y sus politicas de acceso.
begin;

update storage.buckets
set allowed_mime_types = null,
    file_size_limit = 52428800
where id = 'documentos-casos';

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'documentos-casos') then
    raise exception 'No existe el bucket documentos-casos. Ejecuta primero 04_storage_setup.sql.';
  end if;
end $$;

commit;

-- Verificacion: formatos_permitidos = TODOS; limite_mb = 50; public = false.
select id, public,
       coalesce(array_to_string(allowed_mime_types, ', '), 'TODOS') as formatos_permitidos,
       file_size_limit / 1024 / 1024 as limite_mb
from storage.buckets where id = 'documentos-casos';
