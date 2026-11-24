const STORAGE_KEY = 'impresionesCentralesPendientes';
const MAX_AGE = 10 * 60 * 1000;

function readableError(error) {
  if (error?.code === 'PGRST202' || error?.code === '42883') {
    return new Error('La impresión central aún no está activada. Avisa a Administración.');
  }
  if (error?.code === '42501' || error?.code === 'PGRST301') {
    return new Error('Inicia sesión con tu usuario del taller para imprimir.');
  }
  return new Error(error?.message || 'No se pudo contactar la impresora central. Reintenta para consultar la misma solicitud.');
}

export function createRemotePrintClient({ rpc, storage, randomId = () => crypto.randomUUID(),
  fingerprint = async value => {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
  }, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), polls = 25, now = Date.now }) {
  const inFlight = new Map();
  const memory = new Map();
  async function call(name, args = {}) {
    const { data, error } = await rpc(name, args);
    if (error) throw readableError(error);
    return data;
  }
  function load(key) {
    if (memory.has(key)) return memory.get(key);
    try {
      const all = JSON.parse(storage?.getItem(STORAGE_KEY) || '{}');
      if (all[key] && now() - all[key].at < MAX_AGE) return all[key];
    } catch { /* Sigue funcionando si el navegador no permite almacenamiento. */ }
    return null;
  }
  function save(key, job) {
    if (job) memory.set(key, job); else memory.delete(key);
    try {
      const all = JSON.parse(storage?.getItem(STORAGE_KEY) || '{}');
      for (const k of Object.keys(all)) if (now() - all[k].at >= MAX_AGE) delete all[k];
      if (job) all[key] = job; else delete all[key];
      storage?.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch { /* La memoria de la página conserva la solicitud en este caso. */ }
  }
  async function send(key, zpl, title) {
    // Conserva el ZPL original: su fecha puede variar al reintentar.
    const request = load(key) || { requestId: randomId(), zpl, at: now() };
    save(key, request);
    let job = await call('enviar_etiqueta_central', {
      p_solicitud: request.requestId, p_zpl: request.zpl, p_titulo: title,
    });
    if (!job?.id) throw new Error('No se pudo registrar la impresión. Reintenta para consultar la misma solicitud.');
    for (let i = 0; i <= polls; i++) {
      if (job.estado === 'enviado') {
        save(key, null);
        return { modo: 'directo', printer: job.impresora || 'Impresora central del taller', jobId: job.id };
      }
      if (['revisar', 'expirado'].includes(job.estado)) {
        save(key, null);
        throw new Error(job.detalle || 'Revisa la impresora antes de volver a enviar estas etiquetas.');
      }
      if (i === polls) break;
      await wait(1000);
      job = await call('estado_impresion_central', { p_id: job.id });
    }
    return { modo: 'cola', jobId: job.id,
      mensaje: 'Etiquetas en cola para la PC del taller. Si pulsas Imprimir de nuevo, se consultará la misma solicitud.' };
  }
  return {
    state: () => call('estado_impresora_central'),
    async print({ zpl, identity, title = 'Etiquetas' }) {
      const key = await fingerprint(identity);
      if (inFlight.has(key)) return inFlight.get(key);
      const pending = send(key, zpl, title).finally(() => inFlight.delete(key));
      inFlight.set(key, pending);
      return pending;
    },
  };
}
