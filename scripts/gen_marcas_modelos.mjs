// Genera sql/03_seed_marcas_modelos.sql a partir de un catálogo de marcas/modelos.
// Ejecutar una sola vez con: node scripts/gen_marcas_modelos.mjs
import { writeFileSync } from "fs";

const catalogo = {
  Toyota: ["Corolla","Corolla Cross","Camry","Yaris","Yaris Cross","Avanza","Rush","Hilux","Tacoma","Tundra","RAV4","Fortuner","4Runner","Land Cruiser","Land Cruiser Prado","Highlander","Sienna","Prius","C-HR","Sequoia","Supra","86"],
  Honda: ["Civic","Accord","City","Fit","HR-V","CR-V","Pilot","Odyssey","Ridgeline","BR-V"],
  Hyundai: ["Accent","Elantra","Sonata","Tucson","Santa Fe","Creta","Venue","Kona","Palisade","i10","i20","H1","Porter","Veloster","Grand i10"],
  Kia: ["Rio","Forte","K5","Soul","Seltos","Sportage","Sorento","Telluride","Picanto","Cerato","Stonic","Carnival","Niro"],
  Nissan: ["Versa","Sentra","Altima","Maxima","Kicks","Juke","Rogue","X-Trail","Murano","Pathfinder","Armada","Frontier","Titan","Patrol","March","Tiida","NV200","Urvan","GT-R"],
  Chevrolet: ["Spark","Sail","Aveo","Onix","Cruze","Malibu","Camaro","Trax","Tracker","Equinox","Captiva","Traverse","Tahoe","Suburban","Silverado","Colorado","Blazer","Corvette"],
  Ford: ["Fiesta","Focus","Fusion","Mustang","EcoSport","Escape","Edge","Explorer","Expedition","Ranger","F-150","F-250","Bronco","Bronco Sport","Transit","Maverick"],
  Jeep: ["Renegade","Compass","Cherokee","Grand Cherokee","Wrangler","Gladiator","Patriot"],
  Mitsubishi: ["Mirage","Lancer","Outlander","ASX","Eclipse Cross","Montero","Montero Sport","L200"],
  Mazda: ["Mazda2","Mazda3","Mazda6","CX-3","CX-5","CX-9","CX-30","BT-50"],
  Suzuki: ["Swift","Baleno","Dzire","Vitara","Grand Vitara","Jimny","Ertiga","Celerio","Alto","S-Presso"],
  Volkswagen: ["Gol","Voyage","Polo","Virtus","Jetta","Passat","Golf","Tiguan","T-Cross","Taos","Amarok","Saveiro","Atlas"],
  BMW: ["Serie 1","Serie 2","Serie 3","Serie 4","Serie 5","Serie 7","X1","X2","X3","X4","X5","X6","X7","Z4"],
  "Mercedes-Benz": ["Clase A","Clase C","Clase E","Clase S","CLA","GLA","GLB","GLC","GLE","GLS","Sprinter","Vito"],
  Audi: ["A3","A4","A6","A8","Q2","Q3","Q5","Q7","Q8"],
  Lexus: ["IS","ES","GS","RX","NX","GX","LX","UX"],
  Subaru: ["Impreza","Legacy","Outback","Forester","XV/Crosstrek","BRZ"],
  Isuzu: ["D-Max","MU-X","NPR","NQR"],
  Renault: ["Logan","Sandero","Duster","Captur","Kwid","Stepway","Koleos","Kangoo","Oroch"],
  Peugeot: ["206","207","208","301","307","308","2008","3008","5008","Partner"],
  Fiat: ["Uno","Palio","Siena","Punto","Mobi","Argo","Cronos","Toro","Strada","500"],
  Dodge: ["Attitude","Neon","Charger","Challenger","Journey","Durango","Caravan","Dart"],
  RAM: ["700","1500","2500","3500","ProMaster"],
  GMC: ["Sierra","Yukon","Acadia","Terrain","Canyon"],
  Cadillac: ["Escalade","XT4","XT5","XT6","CT5"],
  Lincoln: ["Navigator","Corsair","Nautilus","Aviator"],
  Buick: ["Encore","Envision","Enclave"],
  Volvo: ["S60","S90","XC40","XC60","XC90"],
  Mini: ["Cooper","Countryman","Clubman"],
  "Land Rover": ["Defender","Discovery","Discovery Sport","Range Rover","Range Rover Sport","Range Rover Evoque","Range Rover Velar"],
  Jaguar: ["XE","XF","F-Pace","E-Pace","F-Type"],
  Porsche: ["911","Cayenne","Macan","Panamera","Taycan"],
  Acura: ["ILX","TLX","RDX","MDX"],
  Infiniti: ["Q50","QX50","QX60","QX80"],
  Genesis: ["G70","G80","G90","GV70","GV80"],
  Daihatsu: ["Terios","Bego","Sirion"],
  Datsun: ["Go","Go+"],
  SEAT: ["Ibiza","Leon","Arona","Ateca"],
  Skoda: ["Fabia","Octavia","Kodiaq","Karoq"],
  Tesla: ["Model 3","Model Y","Model S","Model X"],
  Haval: ["Jolion","H6","H9"],
  Chery: ["Tiggo 2","Tiggo 3","Tiggo 5","Tiggo 7","Tiggo 8","Arrizo 5"],
  BYD: ["F3","Song","Yuan","Han","Tang","Dolphin","Atto 3","Seal"],
  JAC: ["J2","J3","J4","S2","S3","S5","T6","T8"],
  Changan: ["Alsvin","CS15","CS35","CS55","CS75","Hunter"],
  MG: ["MG3","MG5","ZS","HS","RX5"],
  Geely: ["Coolray","Emgrand","Azkarra","Okavango"],
  Foton: ["Tunland","View","Aumark"],
  JMC: ["Vigus","Carrying"],
  Dongfeng: ["Rich","AX7"],
  SsangYong: ["Korando","Tivoli","Rexton","Actyon"],
  "Otra / No listada": ["Otro"],
};

let sql = `-- =========================================================\n`;
sql += `-- 03_seed_marcas_modelos.sql\n`;
sql += `-- Catálogo de marcas y modelos comerciales de vehículos\n`;
sql += `-- Generado por scripts/gen_marcas_modelos.mjs\n`;
sql += `-- =========================================================\n\n`;

const marcas = Object.keys(catalogo);
sql += `insert into marcas (nombre) values\n`;
sql += marcas.map((m) => `  ('${m.replace(/'/g, "''")}')`).join(",\n");
sql += `\non conflict (nombre) do nothing;\n\n`;

for (const marca of marcas) {
  const modelos = catalogo[marca];
  const marcaEsc = marca.replace(/'/g, "''");
  sql += `insert into modelos (marca_id, nombre)\n`;
  sql += `select m.id, v.nombre from marcas m\n`;
  sql += `join (values\n`;
  sql += modelos.map((mo) => `  ('${mo.replace(/'/g, "''")}')`).join(",\n");
  sql += `\n) as v(nombre) on true\n`;
  sql += `where m.nombre = '${marcaEsc}'\n`;
  sql += `on conflict (marca_id, nombre) do nothing;\n\n`;
}

writeFileSync(new URL("../sql/03_seed_marcas_modelos.sql", import.meta.url), sql);
console.log(`Generadas ${marcas.length} marcas y ${marcas.reduce((a,m)=>a+catalogo[m].length,0)} modelos.`);
