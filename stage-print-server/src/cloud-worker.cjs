"use strict";
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function diskState(file) {
  return {
    read() {
      let text;
      try { text = fs.readFileSync(file, 'utf8'); }
      catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
      try {
        const state = JSON.parse(text);
        if (!state || typeof state !== 'object' || Array.isArray(state)
          || (state.claimId !== undefined && (typeof state.claimId !== 'string' || !state.claimId))
          || (state.started !== undefined && (!state.started || !state.claimId || typeof state.started.id !== 'string'))
          || (state.pendingAck !== undefined && (!state.pendingAck || typeof state.pendingAck.id !== 'string'
            || typeof state.pendingAck.claimId !== 'string'
            || !['enviado', 'revisar'].includes(state.pendingAck.estado)))) {
          throw new SyntaxError('Estado de impresión no válido.');
        }
        return state;
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        // Conserva el archivo dañado para diagnóstico y empieza con otra
        // recogida. Nunca reutiliza una copia antigua: pudo haberse impreso
        // después de guardarla. La cola deja esos trabajos en revisión.
        fs.renameSync(file, `${file}.corrupt-${Date.now()}-${randomUUID()}`);
        return {};
      }
    },
    write(value) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const temporary = file + '.tmp';
      fs.writeFileSync(temporary, JSON.stringify(value), { encoding: 'utf8', flush: true });
      fs.renameSync(temporary, file);
    },
  };
}

function createCloudWorker({ getSettings, statePath, printZpl, onStatus = () => {},
  fetchImpl = globalThis.fetch, storage = diskState(statePath), randomId = randomUUID }) {
  let timer = null; let stopped = true; let busy = false;
  let status = { configured: false, online: false, lastSync: null, lastError: '' };
  function report(next) { status = { ...status, ...next }; onStatus(status); }
  async function rpc(config, name, args) {
    const url = new URL(config.url);
    if (url.protocol !== 'https:' || !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname)) {
      throw new Error('La dirección de la cola no es válida.');
    }
    const response = await fetchImpl(`${url.origin}/rest/v1/rpc/${name}`, {
      method: 'POST', signal: AbortSignal.timeout(12000),
      headers: { apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    const data = await response.json();
    if (!response.ok) {
      if (data.code === 'PGRST202') throw new Error('Falta ejecutar el SQL de impresión central en Supabase.');
      throw new Error(data.message || 'No se pudo conectar con la cola de impresión.');
    }
    report({ online: true, lastSync: new Date().toISOString(), lastError: '' });
    return data;
  }
  async function acknowledge(config, state) {
    const ack = state.pendingAck;
    const ok = await rpc(config, 'confirmar_impresion_central', {
      p_token: config.token, p_id: ack.id, p_recogida: ack.claimId,
      p_estado: ack.estado, p_detalle: ack.detalle || null,
    });
    if (!ok) throw new Error('La cola no confirmó el trabajo. Se conserva para revisar, sin reimprimir.');
    const error = ack.estado === 'revisar' ? ack.detalle : '';
    storage.write({});
    if (error) report({ lastError: error });
  }
  async function tick() {
    if (busy) return false;
    busy = true;
    try {
      const settings = getSettings(); const config = settings.cloud;
      const configured = Boolean(config?.url && config?.anonKey && config?.token);
      report({ configured });
      if (!configured) { report({ online: false }); return false; }
      if (!settings.printerName) throw new Error('Selecciona y guarda la impresora conectada a esta PC.');
      const state = storage.read();
      if (state.pendingAck) {
        await acknowledge(config, state);
        return true;
      }
      if (state.started) {
        // El proceso se cerró después de iniciar el envío a Windows. No puede
        // saber si salió papel: requiere revisión en lugar de duplicarlo.
        state.pendingAck = { id: state.started.id, claimId: state.claimId,
          estado: 'revisar', detalle: 'La PC se reinició durante el envío. Revisa la impresora antes de reimprimir.' };
        storage.write(state);
        await acknowledge(config, state);
        return true;
      }
      if (!state.claimId) {
        state.claimId = randomId();
        storage.write(state); // Antes de la petición, para sobrevivir a una respuesta perdida.
      }
      const job = await rpc(config, 'recoger_impresion_central', {
        p_token: config.token, p_recogida: state.claimId, p_impresora: settings.printerName,
      });
      if (!job) return false;
      if (job.estado !== 'procesando') { storage.write({}); return true; }
      if (!job.id || job.recogida_id !== state.claimId || !job.zpl) throw new Error('La cola devolvió un trabajo no válido.');
      state.started = { id: job.id };
      storage.write(state);
      try {
        await printZpl({ zpl: job.zpl, printerName: settings.printerName, jobId: job.id });
        state.pendingAck = { id: job.id, claimId: state.claimId, estado: 'enviado' };
      } catch (error) {
        state.pendingAck = { id: job.id, claimId: state.claimId, estado: 'revisar',
          detalle: `No se confirmó el envío a la impresora. ${error.message}`.slice(0, 300) };
      }
      storage.write(state);
      await acknowledge(config, state);
      return true;
    } catch (error) {
      report({ online: false, lastError: error.message });
      return false;
    } finally { busy = false; }
  }
  async function cycle() {
    const worked = await tick();
    if (!stopped) {
      timer = setTimeout(cycle, worked ? 150 : status.online ? 3500 : 10000);
      timer.unref?.();
    }
  }
  return {
    tick, getStatus: () => ({ ...status }),
    start() { if (!stopped) return; stopped = false; void cycle(); },
    stop() { stopped = true; clearTimeout(timer); },
  };
}
module.exports = { createCloudWorker, diskState };
