-- Libera espacio: la columna fotos_caso.url guardaba una URL firmada larga
-- (~200+ caracteres) que caduca en 1 hora y nunca se usa (al cargar las fotos
-- siempre se vuelve a firmar desde storage_path). Se vacía para todas las
-- filas existentes. Ejecutar una sola vez en Supabase.
UPDATE fotos_caso SET url = '' WHERE url <> '';

-- Nota: no se incluye VACUUM porque el editor SQL de Supabase corre todo dentro
-- de una transacción y VACUUM no puede ejecutarse ahí. No hace falta: el
-- autovacuum de Postgres recupera el espacio automáticamente. Si quisieras
-- forzarlo, ejecuta "VACUUM (ANALYZE) fotos_caso;" por separado vía psql (no en
-- el editor web).
