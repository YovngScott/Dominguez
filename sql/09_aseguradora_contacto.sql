-- =========================================================
-- 09_aseguradora_contacto.sql
-- Dirección y teléfono de cada aseguradora, para mostrarlos en el
-- encabezado del PDF de la cotización (caja izquierda).
-- ▶ Ejecuta UNA vez en el SQL Editor de Supabase.
-- =========================================================

alter table aseguradoras add column if not exists direccion text;
alter table aseguradoras add column if not exists telefono text;

-- Datos conocidos (puedes completar el resto desde Supabase cuando los tengas)
update aseguradoras
   set direccion = 'AVENIDA 27 DE FEBRERO , SANTIAGO',
       telefono  = '809-241-1493'
 where nombre = 'Reservas';
