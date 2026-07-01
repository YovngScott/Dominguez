-- Libera espacio: la columna fotos_caso.url guardaba una URL firmada larga
-- (~200+ caracteres) que caduca en 1 hora y nunca se usa (al cargar las fotos
-- siempre se vuelve a firmar desde storage_path). Se vacía para todas las
-- filas existentes. Ejecutar una sola vez en Supabase.
UPDATE fotos_caso SET url = '' WHERE url <> '';

-- Recupera el espacio físico de las filas actualizadas.
VACUUM (ANALYZE) fotos_caso;
