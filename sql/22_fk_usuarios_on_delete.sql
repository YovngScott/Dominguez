-- =========================================================
-- 22_fk_usuarios_on_delete.sql
-- Permite borrar un usuario de Authentication sin el error
-- "Database error deleting user".
--
-- Varias tablas guardan el id del usuario que creó/subió el registro
-- (created_by, uploaded_by, recibida_by) con una referencia a auth.users
-- SIN regla de borrado. Por defecto eso es ON DELETE NO ACTION (RESTRICT):
-- Postgres impide borrar el usuario mientras existan esos registros.
--
-- Aquí cambiamos cada referencia a ON DELETE SET NULL: al borrar el
-- usuario, esos registros se conservan y solo pierden el "autor" (queda
-- en NULL). No se borra ningún caso, cotización ni recibo.
-- ▶ Ejecuta TODO este archivo UNA vez en el SQL Editor de Supabase.
-- =========================================================

alter table casos drop constraint if exists casos_created_by_fkey;
alter table casos add constraint casos_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

alter table fotos_caso drop constraint if exists fotos_caso_uploaded_by_fkey;
alter table fotos_caso add constraint fotos_caso_uploaded_by_fkey
  foreign key (uploaded_by) references auth.users(id) on delete set null;

alter table documentos_caso drop constraint if exists documentos_caso_uploaded_by_fkey;
alter table documentos_caso add constraint documentos_caso_uploaded_by_fkey
  foreign key (uploaded_by) references auth.users(id) on delete set null;

alter table cotizaciones drop constraint if exists cotizaciones_created_by_fkey;
alter table cotizaciones add constraint cotizaciones_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

alter table ordenes_reparacion drop constraint if exists ordenes_reparacion_created_by_fkey;
alter table ordenes_reparacion add constraint ordenes_reparacion_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

alter table piezas_recibidas drop constraint if exists piezas_recibidas_recibida_by_fkey;
alter table piezas_recibidas add constraint piezas_recibidas_recibida_by_fkey
  foreign key (recibida_by) references auth.users(id) on delete set null;

alter table citas drop constraint if exists citas_created_by_fkey;
alter table citas add constraint citas_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;
