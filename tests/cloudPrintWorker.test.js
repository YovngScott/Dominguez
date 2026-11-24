import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const { createCloudWorker }=require('../stage-print-server/src/cloud-worker.cjs');

function harness({lostClaim=false,lostAck=false,printError=false,initial={}}={}) {
  let state=structuredClone(initial);let jobStatus='pendiente';let claim=null;
  let prints=0;const acknowledgments=[];const claims=[];
  const worker=createCloudWorker({
    getSettings:()=>({printerName:'4BARCODE',cloud:{url:'https://example.supabase.co',anonKey:'anon-public',token:'private-token'}}),
    storage:{read:()=>structuredClone(state),write:next=>{state=structuredClone(next);}},
    randomId:()=> 'claim-1',
    printZpl:async({printerName,zpl})=>{assert.equal(printerName,'4BARCODE');assert.equal(zpl,'^XA^XZ');prints++;if(printError)throw Error('Spooler interrumpido');},
    fetchImpl:async(url,options)=>{
      const args=JSON.parse(options.body);
      if(url.endsWith('/recoger_impresion_central')) {
        claims.push(args.p_recogida);
        if(jobStatus==='pendiente'){jobStatus='procesando';claim=args.p_recogida;}
        if(lostClaim){lostClaim=false;throw Error('Respuesta perdida');}
        const job=jobStatus==='procesando'?{id:'job-1',recogida_id:claim,estado:jobStatus,zpl:'^XA^XZ'}:null;
        return {ok:true,json:async()=>job};
      }
      if(url.endsWith('/confirmar_impresion_central')) {
        acknowledgments.push(args);
        if(lostAck){lostAck=false;throw Error('Confirmación perdida');}
        jobStatus=args.p_estado;
        return {ok:true,json:async()=>true};
      }
      throw Error('RPC desconocida');
    },
  });
  return {worker,prints:()=>prints,state:()=>state,acknowledgments,claims};
}
test('receptor imprime en la configurada y confirma solo después de enviar',async()=>{
  const h=harness();await h.worker.tick();
  assert.equal(h.prints(),1);assert.equal(h.acknowledgments[0].p_estado,'enviado');assert.deepEqual(h.state(),{});
  await h.worker.tick();assert.equal(h.prints(),1);
});
test('confirmación perdida se reintenta sin volver a imprimir',async()=>{
  const h=harness({lostAck:true});await h.worker.tick();
  assert.ok(h.state().pendingAck);await h.worker.tick();
  assert.equal(h.prints(),1);assert.deepEqual(h.state(),{});
});
test('respuesta de recogida perdida conserva la identidad de la petición',async()=>{
  const h=harness({lostClaim:true});await h.worker.tick();await h.worker.tick();
  assert.deepEqual(h.claims,['claim-1','claim-1']);assert.equal(h.prints(),1);
});
test('un reinicio durante impresión requiere revisar y no imprime automáticamente',async()=>{
  const h=harness({initial:{claimId:'claim-old',started:{id:'job-old'}}});await h.worker.tick();
  assert.equal(h.prints(),0);assert.equal(h.acknowledgments[0].p_estado,'revisar');
});
test('un fallo parcial de Windows se informa sin reenvío automático',async()=>{
  const h=harness({printError:true});await h.worker.tick();await h.worker.tick();
  assert.equal(h.prints(),1);assert.equal(h.acknowledgments[0].p_estado,'revisar');
});
test('dos ciclos simultáneos no imprimen dos veces',async()=>{
  const h=harness();await Promise.all([h.worker.tick(),h.worker.tick()]);assert.equal(h.prints(),1);
});
