// Genera los archivos privados de instalación. Nunca incluir settings.json en Git.
const fs=require('node:fs');
const path=require('node:path');
const {randomBytes,randomUUID,createHash}=require('node:crypto');
const repo=path.resolve(__dirname,'..');
const publicConfig=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
if(!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(publicConfig.url)||!publicConfig.anonKey) throw Error('Falta la configuración pública del proyecto.');
const destination=path.join(process.env.USERPROFILE,'Desktop','Impresion central Dominguez');
fs.mkdirSync(destination,{recursive:true});
const file=path.join(destination,'settings.json');
const oldFile=path.join(process.env.APPDATA,'stage-ai-labs-print-server','settings.json');
let previous={};
for(const candidate of [oldFile,file]) {
  if(fs.existsSync(candidate)) previous={...previous,...JSON.parse(fs.readFileSync(candidate,'utf8'))};
}
const settings={...previous,printerName:previous.printerName||'4BARCODE 4B-2074B',cloud:{
  url:publicConfig.url,anonKey:publicConfig.anonKey,
  token:previous.cloud?.token||randomBytes(32).toString('hex'),
  diagnosticRequestId:previous.cloud?.diagnosticRequestId||randomUUID(),
}};
fs.writeFileSync(file,JSON.stringify(settings,null,2));
const hash=createHash('sha256').update(settings.cloud.token).digest('hex');
const core=fs.readFileSync(path.join(repo,'sql','61_impresion_central_internet.sql'),'utf8');
const quote=s=>"'"+String(s).replace(/'/g,"''")+"'";
const zpl='^XA^PW812^LL406^LH0,0^MNY^MTD^MD15^PR3^FO35,40^A0N,40,40^FDDOMINGUEZ AUTO PINTURA^FS^FO35,110^A0N,30,30^FDIMPRESION CENTRAL POR INTERNET^FS^FO35,175^GB742,3,3^FS^FO35,220^A0N,28,28^FDPRUEBA DE CONEXION CORRECTA^FS^FO35,290^A0N,24,24^FDPC CENTRAL - 4BARCODE - 4x2^FS^XZ';
const bootstrap=`\n-- Activa solamente la PC de etiquetas de este taller.\nbegin;\ninsert into impresion_privada.central(id,token_hash,nombre,impresora,activa)\nvalues('principal',${quote(hash)},'PC de etiquetas del taller',${quote(settings.printerName)},true)\non conflict(id) do update set token_hash=excluded.token_hash,nombre=excluded.nombre,impresora=excluded.impresora,activa=true;\n-- Una sola etiqueta de prueba, aunque se ejecute nuevamente este archivo.\ninsert into impresion_privada.trabajos(solicitud_id,titulo,zpl)\nvalues(${quote(settings.cloud.diagnosticRequestId)},'PRUEBA DE IMPRESION CENTRAL',${quote(zpl)})\non conflict(solicitud_id) do nothing;\ncommit;\nselect 'Impresion central activada. La PC imprimira una etiqueta de prueba.' as resultado;\n`;
fs.writeFileSync(path.join(destination,'01 ACTIVAR IMPRESION CENTRAL.sql'),core+bootstrap,'utf8');
console.log('Archivos preparados en '+destination+' (el secreto permanece en settings.json).');
