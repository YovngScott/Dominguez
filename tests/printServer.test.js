import assert from "node:assert/strict";
import test from "node:test";
import { createRemotePrintClient } from '../src/lib/remotePrintClient.js';

function storage() {
  const data = new Map();
  return { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
}
const options = { randomId: () => 'request-1', fingerprint: async x => x, wait: async () => {}, polls: 1 };
test('consulta la confirmación del receptor antes de anunciar el envío', async () => {
  const calls=[];
  const client=createRemotePrintClient({ ...options, storage:storage(), rpc:async (name,args)=>{
    calls.push({name,args});
    return {data:{id:'job-1',estado:name==='enviar_etiqueta_central'?'pendiente':'enviado'}};
  }});
  const result=await client.print({zpl:'^XA^XZ',identity:'pieza'});
  assert.equal(result.modo,'directo');
  assert.equal(calls[1].name,'estado_impresion_central');
});
test('si se pierde la respuesta reusa solicitud y ZPL incluso al recargar', async () => {
  const saved=storage();let called;
  const a=createRemotePrintClient({...options,storage:saved,rpc:async()=>{throw Error('Red interrumpida');}});
  await assert.rejects(a.print({zpl:'^XA ORIGINAL^XZ',identity:'misma-pieza'}));
  const b=createRemotePrintClient({...options,storage:saved,rpc:async(name,args)=>{
    called=args;return {data:{id:'job-1',estado:'enviado'}};
  }});
  await b.print({zpl:'^XA OTRA HORA^XZ',identity:'misma-pieza'});
  assert.equal(called.p_solicitud,'request-1');
  assert.equal(called.p_zpl,'^XA ORIGINAL^XZ');
});
test('un doble clic simultáneo genera una sola solicitud', async () => {
  let calls=0;
  const client=createRemotePrintClient({...options,storage:storage(),rpc:async()=>{
    calls++;await new Promise(resolve=>setTimeout(resolve,10));
    return {data:{id:'job-1',estado:'enviado'}};
  }});
  await Promise.all([client.print({zpl:'^XA^XZ',identity:'pieza'}),client.print({zpl:'^XA^XZ',identity:'pieza'})]);
  assert.equal(calls,1);
});
test('no anuncia impresión realizada si continúa en cola', async () => {
  const client=createRemotePrintClient({...options,storage:storage(),rpc:async()=>({data:{id:'job-1',estado:'pendiente'}})});
  assert.equal((await client.print({zpl:'^XA^XZ',identity:'pieza'})).modo,'cola');
});
test('muestra el fallo del receptor sin cambiar a una impresora local', async () => {
  const client=createRemotePrintClient({...options,storage:storage(),rpc:async()=>({data:{id:'job-1',estado:'revisar',detalle:'Revisa el rollo'}})});
  await assert.rejects(client.print({zpl:'^XA^XZ',identity:'pieza'}),/Revisa el rollo/);
});
