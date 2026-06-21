-- =========================================================
-- 08_piezas_catalogo.sql
-- Catálogo de piezas de carrocería (NO mecánicas) para autocompletar
-- al escribir el nombre de la pieza en una cotización.
-- Los nombres son genéricos: el lado (delantero/trasero/izq/der) se
-- indica con los campos "Lado" y "Sub-lado" del formulario.
-- ▶ Ejecuta TODO este archivo UNA vez en el SQL Editor de Supabase.
-- =========================================================

create table if not exists piezas_catalogo (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  categoria text
);

create index if not exists idx_piezas_catalogo_trgm
  on piezas_catalogo using gin (nombre gin_trgm_ops);

alter table piezas_catalogo enable row level security;

drop policy if exists "admin_total_piezas_catalogo" on piezas_catalogo;
create policy "admin_total_piezas_catalogo" on piezas_catalogo
  for all to authenticated using (true) with check (true);

insert into piezas_catalogo (nombre, categoria) values
  -- Bumpers / parachoques
  ('Bumper', 'Bumper'),
  ('Centro de bumper', 'Bumper'),
  ('Esquina de bumper', 'Bumper'),
  ('Spoiler de bumper', 'Bumper'),
  ('Labio de bumper', 'Bumper'),
  ('Refuerzo de bumper', 'Bumper'),
  ('Soporte de bumper', 'Bumper'),
  ('Moldura de bumper', 'Bumper'),
  ('Rejilla de bumper', 'Bumper'),
  ('Guía de bumper', 'Bumper'),
  ('Absorbedor de bumper', 'Bumper'),
  ('Tapa de gancho de remolque', 'Bumper'),
  -- Puertas
  ('Puerta', 'Puerta'),
  ('Manija exterior de puerta', 'Puerta'),
  ('Manija interior de puerta', 'Puerta'),
  ('Panel / tapiz de puerta', 'Puerta'),
  ('Moldura de puerta', 'Puerta'),
  ('Burlete de puerta', 'Puerta'),
  ('Bisagra de puerta', 'Puerta'),
  ('Cerradura de puerta', 'Puerta'),
  ('Marco de puerta', 'Puerta'),
  ('Vidrio de puerta', 'Cristales'),
  ('Canal / riel de vidrio', 'Puerta'),
  -- Guardalodos y paneles
  ('Guardalodo (fender)', 'Carrocería'),
  ('Guardalodo trasero', 'Carrocería'),
  ('Cuarto trasero', 'Carrocería'),
  ('Panel lateral', 'Carrocería'),
  ('Estribo / faldón lateral', 'Carrocería'),
  ('Guardapolvo interior', 'Carrocería'),
  ('Pisadera', 'Carrocería'),
  ('Pilar (poste) A', 'Carrocería'),
  ('Pilar (poste) B', 'Carrocería'),
  ('Pilar (poste) C', 'Carrocería'),
  -- Bonete y frente
  ('Bonete (capó)', 'Frente'),
  ('Bisagra de bonete', 'Frente'),
  ('Amortiguador de bonete', 'Frente'),
  ('Cejilla de bonete', 'Frente'),
  ('Parrilla / persiana', 'Frente'),
  ('Marco de parrilla', 'Frente'),
  ('Panel frontal / cuadro de carga', 'Frente'),
  ('Mascarilla', 'Frente'),
  ('Soporte de faro', 'Frente'),
  ('Emblema / logo', 'Frente'),
  -- Baúl / trasera
  ('Tapa de baúl', 'Trasera'),
  ('Compuerta trasera (tailgate)', 'Trasera'),
  ('Bisagra de baúl', 'Trasera'),
  ('Amortiguador de baúl', 'Trasera'),
  ('Spoiler / alerón', 'Trasera'),
  ('Panel trasero', 'Trasera'),
  -- Techo
  ('Techo', 'Techo'),
  ('Moldura de techo', 'Techo'),
  ('Techo solar (sunroof)', 'Techo'),
  ('Parrilla de techo (rack)', 'Techo'),
  -- Luces
  ('Faro / foco delantero', 'Luces'),
  ('Stop / calavera (luz trasera)', 'Luces'),
  ('Luz antiniebla / exploradora', 'Luces'),
  ('Direccional / intermitente', 'Luces'),
  ('Tercera luz de freno', 'Luces'),
  ('Luz de placa', 'Luces'),
  ('Bombillo', 'Luces'),
  ('Cuarto / luz de posición', 'Luces'),
  ('Marco de faro', 'Luces'),
  -- Cristales y espejos
  ('Parabrisas delantero', 'Cristales'),
  ('Luneta / cristal trasero', 'Cristales'),
  ('Vidrio lateral', 'Cristales'),
  ('Vidrio de ventana fija (mosquito)', 'Cristales'),
  ('Espejo retrovisor lateral', 'Espejos'),
  ('Tapa de espejo', 'Espejos'),
  ('Vidrio de espejo', 'Espejos'),
  ('Base de espejo', 'Espejos'),
  ('Espejo retrovisor interior', 'Espejos'),
  -- Molduras y emblemas
  ('Moldura lateral', 'Molduras'),
  ('Moldura de ventana', 'Molduras'),
  ('Banda / calcomanía lateral', 'Molduras'),
  ('Protector de borde', 'Molduras'),
  -- Limpiaparabrisas
  ('Brazo de limpiaparabrisas', 'Limpiaparabrisas'),
  ('Plumilla / goma de wiper', 'Limpiaparabrisas'),
  -- Combustible / ruedas (carrocería)
  ('Tapa de tanque de combustible', 'Otros'),
  ('Puerta de tanque de combustible', 'Otros'),
  ('Taza / copa de rueda', 'Otros'),
  ('Tapabocina', 'Otros'),
  ('Antena', 'Otros'),
  -- Interior
  ('Tablero (dashboard)', 'Interior'),
  ('Guantera', 'Interior'),
  ('Consola central', 'Interior'),
  ('Forro de techo (cielo raso)', 'Interior'),
  ('Visera', 'Interior'),
  ('Alfombra', 'Interior'),
  ('Cinturón de seguridad', 'Interior'),
  ('Asiento', 'Interior'),
  ('Apoyabrazos', 'Interior'),
  -- Camioneta
  ('Cama de camioneta (bed)', 'Camioneta'),
  ('Capota', 'Camioneta'),
  ('Estribo de camioneta', 'Camioneta')
on conflict (nombre) do nothing;
