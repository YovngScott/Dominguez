-- Indica en qué almacenamiento está cada foto: "supabase" (las viejas) o "r2"
-- (Cloudflare R2, las nuevas). Permite que ambas convivan mientras se migra.
-- Ejecutar una sola vez en el SQL Editor de Supabase.
alter table fotos_caso add column if not exists storage_backend text not null default 'supabase';
