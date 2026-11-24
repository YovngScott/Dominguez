import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

test('cola SQL: permisos, idempotencia, recogida exclusiva y confirmación', async () => {
  const db = new PGlite();
  const user = randomUUID(); const other = randomUUID(); const inactive = randomUUID();
  const token = 'a'.repeat(64);
  const hash = createHash('sha256').update(token).digest('hex');
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to anon,authenticated;
      grant execute on function auth.uid() to anon,authenticated;
      create table public.perfiles(user_id uuid,rol text,activo boolean);
      insert into auth.users values ('${user}'),('${other}'),('${inactive}');
      insert into perfiles values ('${inactive}','administrativo_general',false);`);
    await db.exec(fs.readFileSync(new URL('../sql/61_impresion_central_internet.sql',import.meta.url),'utf8'));
    await db.query(`insert into impresion_privada.central(id,token_hash,impresora,ultima_conexion)
      values('principal',$1,'4BARCODE',now())`,[hash]);
    const role = async (name, uid='') => {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
      await db.exec(`set role ${name}`);
    };
    await role('anon');
    await assert.rejects(db.query('select public.estado_impresora_central()'),/permission denied/);
    await assert.rejects(db.query('select * from impresion_privada.trabajos'),/permission denied/);
    await assert.rejects(db.query('select public.recoger_impresion_central($1,$2,$3)',
      ['bad',randomUUID(),'4BARCODE']),/no autorizado/);
    await role('authenticated',inactive);
    await assert.rejects(db.query('select public.estado_impresora_central()'),/Inicia sesión/);
    await role('authenticated',user);
    const request=randomUUID(); const zpl='^XA^FO20,20^FDPRUEBA^FS^XZ';
    const enqueue=()=>db.query('select public.enviar_etiqueta_central($1,$2,$3) as job',[request,zpl,'Prueba']);
    const first=(await enqueue()).rows[0].job;
    const second=(await enqueue()).rows[0].job;
    assert.equal(first.id,second.id);
    await assert.rejects(db.query('select public.enviar_etiqueta_central($1,$2,$3)',
      [request,zpl+'\n^XA^XZ','Otra']),/no coincide/);
    await role('authenticated',other);
    await assert.rejects(db.query('select public.estado_impresion_central($1)',[first.id]),/No se encontró/);
    await role('anon');
    const claim=randomUUID();
    const take=async id=>(await db.query('select public.recoger_impresion_central($1,$2,$3) as job',
      [token,id,'4BARCODE'])).rows[0].job;
    const picked=await take(claim);
    assert.equal(picked.id,first.id);
    assert.equal((await take(claim)).id,first.id,'retry de recogida devuelve el mismo trabajo');
    assert.equal(await take(randomUUID()),null,'otro consumidor no vuelve a recoger el trabajo');
    for (let i=0;i<2;i++) {
      const ack=await db.query('select public.confirmar_impresion_central($1,$2,$3,$4,$5) as ok',
        [token,first.id,claim,'enviado',null]);
      assert.equal(ack.rows[0].ok,true);
    }
    assert.equal((await take(claim)).estado,'enviado');
    await role('authenticated',user);
    assert.equal((await db.query('select public.estado_impresion_central($1) as job',[first.id])).rows[0].job.estado,'enviado');
    await role('postgres');
    const oldId=randomUUID();
    await db.query(`insert into impresion_privada.trabajos(id,solicitud_id,zpl,estado,iniciado_en)
      values($1,$2,$3,'procesando',now()-interval '3 minutes')`,[oldId,randomUUID(),zpl]);
    await role('anon');
    assert.equal(await take(randomUUID()),null);
    await role('postgres');
    assert.equal((await db.query('select estado from impresion_privada.trabajos where id=$1',[oldId])).rows[0].estado,'revisar');
    await db.exec("update impresion_privada.central set ultima_conexion=now()-interval '1 hour'");
    await role('authenticated',user);
    await assert.rejects(db.query('select public.enviar_etiqueta_central($1,$2,$3)',
      [randomUUID(),zpl,'Prueba']),/desconectada/);
  } finally { await db.close(); }
});
