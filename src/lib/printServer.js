// Cliente del STAGE AI LABS Print Server (app local propia que imprime ZPL directo en la
// impresora térmica de etiquetas, sin pasar por el diálogo de impresión de la
// PC). Corre en http://127.0.0.1:9100.
//
// IMPORTANTE: el print server solo acepta peticiones desde los dominios que
// tiene en su lista (app.dominguezautopintura.com, etc.). Desde otro dominio
// el navegador las bloquea por CORS; en ese caso caemos al PDF automáticamente.

// La PC 10.0.0.73 es el servidor central del taller: ahí está conectada la
// impresora de etiquetas. En esa misma PC se prefiere loopback; desde las demás
// computadoras de la LAN se usa automáticamente la dirección central.
export const SERVIDORES = ["http://127.0.0.1:9100", "http://10.0.0.73:9100"];
const TOKEN = "dps-7f3a9c2e1b4d6f8a0e5c3b7d9a1f4e2c"; // token estático del print server
const LS_PRINTER = "impresoraEtiquetas";
let baseActiva = "";

async function probarServidor(base) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 3000);
  try {
    const r = await fetch(`${base}/health`, { signal: ctrl.signal, cache: "no-store" });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

async function resolverServidor() {
  for (const base of SERVIDORES) {
    if (await probarServidor(base)) {
      baseActiva = base;
      return base;
    }
  }
  baseActiva = "";
  return "";
}

// ¿El print server está corriendo y nos acepta? (timeout corto)
export async function servidorDisponible() {
  return Boolean(await resolverServidor());
}

export async function listarImpresoras() {
  const base = baseActiva || (await resolverServidor());
  if (!base) throw new Error("No se encontró el servidor de etiquetas del taller.");
  const r = await fetch(`${base}/printers`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const j = await r.json();
  return j.printers || [];
}

export function impresoraGuardada() {
  return localStorage.getItem(LS_PRINTER) || "";
}
export function guardarImpresora(nombre) {
  if (nombre) localStorage.setItem(LS_PRINTER, nombre);
}

// Elige automáticamente la impresora térmica de etiquetas entre las del sistema
// (descarta las virtuales: PDF, OneNote, XPS, etc.).
export function elegirImpresoraEtiquetas(printers) {
  const etiqueta = /barcode|label|zebra|godex|xprinter|tsc|gprinter|thermal|zd\d|tlp|4b-|2c-/i;
  const virtual = /onenote|xps|microsoft print to pdf|pdf|fax|anydesk/i;
  const cand =
    printers.find((p) => etiqueta.test(p.name)) ||
    printers.find((p) => !virtual.test(p.name) && p.isDefault) ||
    printers.find((p) => !virtual.test(p.name));
  return cand?.name || "";
}

async function imprimirZpl(zpl, printerName) {
  const base = baseActiva || (await resolverServidor());
  if (!base) throw new Error("No se encontró el servidor de etiquetas del taller.");
  const r = await fetch(`${base}/print/label`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ zpl, printerName }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.success) throw new Error(j.error || `Error ${r.status} del print server`);
  return j;
}

/**
 * Imprime las etiquetas. Si el print server está disponible, manda el ZPL
 * directo a la impresora térmica (no abre nada). Si no, genera el PDF para
 * imprimir a mano. Devuelve { modo: "directo", printer } o { modo: "pdf", blob }.
 */
export async function imprimirEtiquetas(payload) {
  if (!(await servidorDisponible())) {
    throw new Error(
      "No se pudo conectar con STAGE AI LABS Print Server. Se probaron " +
        "127.0.0.1:9100 y el servidor central 10.0.0.73:9100. " +
        "Permite el acceso a la red local en Edge."
    );
  }

  const { generarZplEtiquetas } = await import("./piezasLabelZpl");
  const zpl = generarZplEtiquetas(payload);

  let printer = impresoraGuardada();
  if (!printer) {
    const ps = await listarImpresoras().catch(() => []);
    printer = elegirImpresoraEtiquetas(ps);
    guardarImpresora(printer);
  }
  if (!printer) throw new Error("El print server no tiene una impresora de etiquetas configurada.");

  await imprimirZpl(zpl, printer);
  return { modo: "directo", printer };
}

/**
 * Imprime la ETIQUETA DE VEHÍCULO (marca/modelo + trabajos a realizar).
 * payload = { marca, modelo, anio, trabajos: [string] }
 */
export async function imprimirVehiculo(payload) {
  if (!(await servidorDisponible())) {
    throw new Error(
      "No se pudo conectar con STAGE AI LABS Print Server. Se probaron " +
        "127.0.0.1:9100 y el servidor central 10.0.0.73:9100. " +
        "Permite el acceso a la red local en Edge."
    );
  }

  const { generarZplVehiculo } = await import("./vehiculoLabelZpl");
  const zpl = generarZplVehiculo(payload);

  let printer = impresoraGuardada();
  if (!printer) {
    const ps = await listarImpresoras().catch(() => []);
    printer = elegirImpresoraEtiquetas(ps);
    guardarImpresora(printer);
  }
  if (!printer) throw new Error("El print server no tiene una impresora de etiquetas configurada.");

  await imprimirZpl(zpl, printer);
  return { modo: "directo", printer };
}
