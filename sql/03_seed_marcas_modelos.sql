-- =========================================================
-- 03_seed_marcas_modelos.sql
-- Catálogo de marcas y modelos comerciales de vehículos
-- Generado por scripts/gen_marcas_modelos.mjs
-- =========================================================

insert into marcas (nombre) values
  ('Toyota'),
  ('Honda'),
  ('Hyundai'),
  ('Kia'),
  ('Nissan'),
  ('Chevrolet'),
  ('Ford'),
  ('Jeep'),
  ('Mitsubishi'),
  ('Mazda'),
  ('Suzuki'),
  ('Volkswagen'),
  ('BMW'),
  ('Mercedes-Benz'),
  ('Audi'),
  ('Lexus'),
  ('Subaru'),
  ('Isuzu'),
  ('Renault'),
  ('Peugeot'),
  ('Fiat'),
  ('Dodge'),
  ('RAM'),
  ('GMC'),
  ('Cadillac'),
  ('Lincoln'),
  ('Buick'),
  ('Volvo'),
  ('Mini'),
  ('Land Rover'),
  ('Jaguar'),
  ('Porsche'),
  ('Acura'),
  ('Infiniti'),
  ('Genesis'),
  ('Daihatsu'),
  ('Datsun'),
  ('SEAT'),
  ('Skoda'),
  ('Tesla'),
  ('Haval'),
  ('Chery'),
  ('BYD'),
  ('JAC'),
  ('Changan'),
  ('MG'),
  ('Geely'),
  ('Foton'),
  ('JMC'),
  ('Dongfeng'),
  ('SsangYong'),
  ('Otra / No listada')
on conflict (nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('Corolla'),
  ('Corolla Cross'),
  ('Camry'),
  ('Yaris'),
  ('Yaris Cross'),
  ('Avanza'),
  ('Rush'),
  ('Hilux'),
  ('Tacoma'),
  ('Tundra'),
  ('RAV4'),
  ('Fortuner'),
  ('4Runner'),
  ('Land Cruiser'),
  ('Land Cruiser Prado'),
  ('Highlander'),
  ('Sienna'),
  ('Prius'),
  ('C-HR'),
  ('Sequoia'),
  ('Supra'),
  ('86')
) as v(nombre) on true
where m.nombre = 'Toyota'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('Civic'),
  ('Accord'),
  ('City'),
  ('Fit'),
  ('HR-V'),
  ('CR-V'),
  ('Pilot'),
  ('Odyssey'),
  ('Ridgeline'),
  ('BR-V')
) as v(nombre) on true
where m.nombre = 'Honda'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('Accent'),
  ('Elantra'),
  ('Sonata'),
  ('Tucson'),
  ('Santa Fe'),
  ('Creta'),
  ('Venue'),
  ('Kona'),
  ('Palisade'),
  ('i10'),
  ('i20'),
  ('H1'),
  ('Porter'),
  ('Veloster'),
  ('Grand i10')
) as v(nombre) on true
where m.nombre = 'Hyundai'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('Rio'),
  ('Forte'),
  ('K5'),
  ('Soul'),
  ('Seltos'),
  ('Sportage'),
  ('Sorento'),
  ('Telluride'),
  ('Picanto'),
  ('Cerato'),
  ('Stonic'),
  ('Carnival'),
  ('Niro')
) as v(nombre) on true
where m.nombre = 'Kia'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('Versa'),
  ('Sentra'),
  ('Altima'),
  ('Maxima'),
  ('Kicks'),
  ('Juke'),
  ('Rogue'),
  ('X-Trail'),
  ('Murano'),
  ('Pathfinder'),
  ('Armada'),
  ('Frontier'),
  ('Titan'),
  ('Patrol'),
  ('March'),
  ('Tiida'),
  ('NV200'),
  ('Urvan'),
  ('GT-R')
) as v(nombre) on true
where m.nombre = 'Nissan'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('Spark'),
  ('Sail'),
  ('Aveo'),
  ('Onix'),
  ('Cruze'),
  ('Malibu'),
  ('Camaro'),
  ('Trax'),
  ('Tracker'),
  ('Equinox'),
  ('Captiva'),
  ('Traverse'),
  ('Tahoe'),
  ('Suburban'),
  ('Silverado'),
  ('Colorado'),
  ('Blazer'),
  ('Corvette')
) as v(nombre) on true
where m.nombre = 'Chevrolet'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('Fiesta'),
  ('Focus'),
  ('Fusion'),
  ('Mustang'),
  ('EcoSport'),
  ('Escape'),
  ('Edge'),
  ('Explorer'),
  ('Expedition'),
  ('Ranger'),
  ('F-150'),
  ('F-250'),
  ('Bronco'),
  ('Bronco Sport'),
  ('Transit'),
  ('Maverick')
) as v(nombre) on true
where m.nombre = 'Ford'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('Renegade'),
  ('Compass'),
  ('Cherokee'),
  ('Grand Cherokee'),
  ('Wrangler'),
  ('Gladiator'),
  ('Patriot')
) as v(nombre) on true
where m.nombre = 'Jeep'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('Mirage'),
  ('Lancer'),
  ('Outlander'),
  ('ASX'),
  ('Eclipse Cross'),
  ('Montero'),
  ('Montero Sport'),
  ('L200')
) as v(nombre) on true
where m.nombre = 'Mitsubishi'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('Mazda2'),
  ('Mazda3'),
  ('Mazda6'),
  ('CX-3'),
  ('CX-5'),
  ('CX-9'),
  ('CX-30'),
  ('BT-50')
) as v(nombre) on true
where m.nombre = 'Mazda'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('Swift'),
  ('Baleno'),
  ('Dzire'),
  ('Vitara'),
  ('Grand Vitara'),
  ('Jimny'),
  ('Ertiga'),
  ('Celerio'),
  ('Alto'),
  ('S-Presso')
) as v(nombre) on true
where m.nombre = 'Suzuki'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('Gol'),
  ('Voyage'),
  ('Polo'),
  ('Virtus'),
  ('Jetta'),
  ('Passat'),
  ('Golf'),
  ('Tiguan'),
  ('T-Cross'),
  ('Taos'),
  ('Amarok'),
  ('Saveiro'),
  ('Atlas')
) as v(nombre) on true
where m.nombre = 'Volkswagen'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('Serie 1'),
  ('Serie 2'),
  ('Serie 3'),
  ('Serie 4'),
  ('Serie 5'),
  ('Serie 7'),
  ('X1'),
  ('X2'),
  ('X3'),
  ('X4'),
  ('X5'),
  ('X6'),
  ('X7'),
  ('Z4')
) as v(nombre) on true
where m.nombre = 'BMW'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('Clase A'),
  ('Clase C'),
  ('Clase E'),
  ('Clase S'),
  ('CLA'),
  ('GLA'),
  ('GLB'),
  ('GLC'),
  ('GLE'),
  ('GLS'),
  ('Sprinter'),
  ('Vito')
) as v(nombre) on true
where m.nombre = 'Mercedes-Benz'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('A3'),
  ('A4'),
  ('A6'),
  ('A8'),
  ('Q2'),
  ('Q3'),
  ('Q5'),
  ('Q7'),
  ('Q8')
) as v(nombre) on true
where m.nombre = 'Audi'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('IS'),
  ('ES'),
  ('GS'),
  ('RX'),
  ('NX'),
  ('GX'),
  ('LX'),
  ('UX')
) as v(nombre) on true
where m.nombre = 'Lexus'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('Impreza'),
  ('Legacy'),
  ('Outback'),
  ('Forester'),
  ('XV/Crosstrek'),
  ('BRZ')
) as v(nombre) on true
where m.nombre = 'Subaru'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('D-Max'),
  ('MU-X'),
  ('NPR'),
  ('NQR')
) as v(nombre) on true
where m.nombre = 'Isuzu'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('Logan'),
  ('Sandero'),
  ('Duster'),
  ('Captur'),
  ('Kwid'),
  ('Stepway'),
  ('Koleos'),
  ('Kangoo'),
  ('Oroch')
) as v(nombre) on true
where m.nombre = 'Renault'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('206'),
  ('207'),
  ('208'),
  ('301'),
  ('307'),
  ('308'),
  ('2008'),
  ('3008'),
  ('5008'),
  ('Partner')
) as v(nombre) on true
where m.nombre = 'Peugeot'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('Uno'),
  ('Palio'),
  ('Siena'),
  ('Punto'),
  ('Mobi'),
  ('Argo'),
  ('Cronos'),
  ('Toro'),
  ('Strada'),
  ('500')
) as v(nombre) on true
where m.nombre = 'Fiat'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('Attitude'),
  ('Neon'),
  ('Charger'),
  ('Challenger'),
  ('Journey'),
  ('Durango'),
  ('Caravan'),
  ('Dart')
) as v(nombre) on true
where m.nombre = 'Dodge'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('700'),
  ('1500'),
  ('2500'),
  ('3500'),
  ('ProMaster')
) as v(nombre) on true
where m.nombre = 'RAM'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('Sierra'),
  ('Yukon'),
  ('Acadia'),
  ('Terrain'),
  ('Canyon')
) as v(nombre) on true
where m.nombre = 'GMC'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('Escalade'),
  ('XT4'),
  ('XT5'),
  ('XT6'),
  ('CT5')
) as v(nombre) on true
where m.nombre = 'Cadillac'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('Navigator'),
  ('Corsair'),
  ('Nautilus'),
  ('Aviator')
) as v(nombre) on true
where m.nombre = 'Lincoln'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('Encore'),
  ('Envision'),
  ('Enclave')
) as v(nombre) on true
where m.nombre = 'Buick'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('S60'),
  ('S90'),
  ('XC40'),
  ('XC60'),
  ('XC90')
) as v(nombre) on true
where m.nombre = 'Volvo'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('Cooper'),
  ('Countryman'),
  ('Clubman')
) as v(nombre) on true
where m.nombre = 'Mini'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('Defender'),
  ('Discovery'),
  ('Discovery Sport'),
  ('Range Rover'),
  ('Range Rover Sport'),
  ('Range Rover Evoque'),
  ('Range Rover Velar')
) as v(nombre) on true
where m.nombre = 'Land Rover'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('XE'),
  ('XF'),
  ('F-Pace'),
  ('E-Pace'),
  ('F-Type')
) as v(nombre) on true
where m.nombre = 'Jaguar'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('911'),
  ('Cayenne'),
  ('Macan'),
  ('Panamera'),
  ('Taycan')
) as v(nombre) on true
where m.nombre = 'Porsche'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('ILX'),
  ('TLX'),
  ('RDX'),
  ('MDX')
) as v(nombre) on true
where m.nombre = 'Acura'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('Q50'),
  ('QX50'),
  ('QX60'),
  ('QX80')
) as v(nombre) on true
where m.nombre = 'Infiniti'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('G70'),
  ('G80'),
  ('G90'),
  ('GV70'),
  ('GV80')
) as v(nombre) on true
where m.nombre = 'Genesis'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('Terios'),
  ('Bego'),
  ('Sirion')
) as v(nombre) on true
where m.nombre = 'Daihatsu'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('Go'),
  ('Go+')
) as v(nombre) on true
where m.nombre = 'Datsun'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('Ibiza'),
  ('Leon'),
  ('Arona'),
  ('Ateca')
) as v(nombre) on true
where m.nombre = 'SEAT'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('Fabia'),
  ('Octavia'),
  ('Kodiaq'),
  ('Karoq')
) as v(nombre) on true
where m.nombre = 'Skoda'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('Model 3'),
  ('Model Y'),
  ('Model S'),
  ('Model X')
) as v(nombre) on true
where m.nombre = 'Tesla'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('Jolion'),
  ('H6'),
  ('H9')
) as v(nombre) on true
where m.nombre = 'Haval'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('Tiggo 2'),
  ('Tiggo 3'),
  ('Tiggo 5'),
  ('Tiggo 7'),
  ('Tiggo 8'),
  ('Arrizo 5')
) as v(nombre) on true
where m.nombre = 'Chery'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('F3'),
  ('Song'),
  ('Yuan'),
  ('Han'),
  ('Tang'),
  ('Dolphin'),
  ('Atto 3'),
  ('Seal')
) as v(nombre) on true
where m.nombre = 'BYD'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('J2'),
  ('J3'),
  ('J4'),
  ('S2'),
  ('S3'),
  ('S5'),
  ('T6'),
  ('T8')
) as v(nombre) on true
where m.nombre = 'JAC'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('Alsvin'),
  ('CS15'),
  ('CS35'),
  ('CS55'),
  ('CS75'),
  ('Hunter')
) as v(nombre) on true
where m.nombre = 'Changan'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('MG3'),
  ('MG5'),
  ('ZS'),
  ('HS'),
  ('RX5')
) as v(nombre) on true
where m.nombre = 'MG'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('Coolray'),
  ('Emgrand'),
  ('Azkarra'),
  ('Okavango')
) as v(nombre) on true
where m.nombre = 'Geely'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('Tunland'),
  ('View'),
  ('Aumark')
) as v(nombre) on true
where m.nombre = 'Foton'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('Vigus'),
  ('Carrying')
) as v(nombre) on true
where m.nombre = 'JMC'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('Rich'),
  ('AX7')
) as v(nombre) on true
where m.nombre = 'Dongfeng'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('Korando'),
  ('Tivoli'),
  ('Rexton'),
  ('Actyon')
) as v(nombre) on true
where m.nombre = 'SsangYong'
on conflict (marca_id, nombre) do nothing;

insert into modelos (marca_id, nombre)
select m.id, v.nombre from marcas m
join (values
  ('Otro')
) as v(nombre) on true
where m.nombre = 'Otra / No listada'
on conflict (marca_id, nombre) do nothing;

