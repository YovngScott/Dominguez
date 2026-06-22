-- =========================================================
-- 15_nombres_aseguradoras.sql
-- Actualiza los nombres de las aseguradoras al nombre legal/comercial
-- completo. Se usan en toda la app (menús, listados, encabezado del PDF
-- de cotizaciones) porque se leen directamente de esta tabla.
-- "Personal" pasa a llamarse "General".
-- ▶ Ejecuta UNA vez en el SQL Editor de Supabase.
-- =========================================================

update aseguradoras set nombre = 'SEGURO RESERVAS'              where nombre = 'Reservas';
update aseguradoras set nombre = 'LA COLONIAL DE SEGUROS'        where nombre = 'Colonial';
update aseguradoras set nombre = 'ATLANTICA DE SEGUROS'          where nombre = 'Atlántica';
update aseguradoras set nombre = 'COOP-SEGUROS'                  where nombre = 'Coop-Seguro';
update aseguradoras set nombre = 'SEGUROS SURA, S.A'             where nombre = 'Sura';
update aseguradoras set nombre = 'SEGUROS LA INTERNACIONAL, S.A' where nombre = 'Internacional';
update aseguradoras set nombre = 'GENERAL'                       where nombre = 'Personal';
