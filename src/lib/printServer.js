// Cliente del KT Print Server (app local que imprime ZPL directo en la
// impresora térmica de etiquetas, sin pasar por el diálogo de impresión de la
// PC). Corre en http://127.0.0.1:9100.
//
// IMPORTANTE: el print server solo acepta peticiones desde los dominios que
// tiene en su lista (app.dominguezautopintura.com, etc.). Desde otro dominio
// el navegador las bloquea por CORS; en ese caso caemos al PDF automáticamente.

const BASE = "http://127.0.0.1:9100";
const TOKEN = "dps-7f3a9c2e1b4d6f8a0e5c3b7d9a1f4e2c"; // token estático del print server
const LS_PRINTER = "impresoraEtiquetas";

// ¿El print server está corriendo y nos acepta? (timeout corto)
export async function servidorDisponible() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const r = await fetch(`${BASE}/health`, { signal: ctrl.signal });
    clearTimeout(t);
    return r.ok;
  } catch {
    return false;
  }
}

export async function listarImpresoras() {
  const r = await fetch(`${BASE}/printers`, { headers: { Authorization: `Bearer ${TOKEN}` } });
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
  const r = await fetch(`${BASE}/print/label`, {
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
  if (await servidorDisponible()) {
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

  // Sin print server: PDF para imprimir manualmente
  const { generarPdfEtiquetas } = await import("./piezasLabelPdf");
  const blob = await generarPdfEtiquetas(payload);
  return { modo: "pdf", blob };
}
