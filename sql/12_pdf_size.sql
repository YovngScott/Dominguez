-- =========================================================
-- 12_pdf_size.sql
-- Sube el límite de tamaño de archivo de los buckets a 50 MB
-- (antes 15 MB) para permitir PDFs más grandes.
-- ▶ Ejecuta UNA vez en el SQL Editor.
--
-- NOTA: Supabase también tiene un límite GLOBAL del proyecto
-- (Dashboard → Storage → Settings → "Global file size limit").
-- Si necesitas subir archivos de más de 50 MB, aumenta también
-- ese valor desde el panel.
-- =========================================================

update storage.buckets
   set file_size_limit = 52428800  -- 50 MB
 where id in ('documentos-casos', 'cotizaciones');
