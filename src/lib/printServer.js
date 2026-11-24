// Todas las computadoras envían al mismo receptor por HTTPS.
// No se busca una impresora en la computadora que abre el navegador.
import { supabase } from './supabaseClient';
import { createRemotePrintClient } from './remotePrintClient.js';
const client = createRemotePrintClient({
  rpc: (name, args) => supabase.rpc(name, args).abortSignal(AbortSignal.timeout(12000)),
  storage: {
    getItem: key => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
  },
});
let central = null;
export async function estadoImpresoraCentral() {
  central = await client.state();
  return central;
}
export async function servidorDisponible() {
  try { return Boolean((await estadoImpresoraCentral())?.en_linea); }
  catch { return false; }
}
export async function listarImpresoras() {
  const state = await estadoImpresoraCentral();
  return state?.configurada && state?.impresora
    ? [{ name: state.impresora, isDefault: true, central: true }] : [];
}
export function impresoraGuardada() { return central?.impresora || ''; }
export function guardarImpresora() { /* Se configura en la PC central. */ }
export function elegirImpresoraEtiquetas(printers) { return printers[0]?.name || ''; }
async function identidadUsuario(value) {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.user?.id) throw new Error('Inicia sesión con tu usuario del taller para imprimir.');
  return JSON.stringify([data.session.user.id, value]);
}
function identidadPiezas(payload) {
  const fields = ['marca','modelo','anio','aseguradora_nombre','numero_reclamo','placa','chasis','cliente_nombre'];
  const caso = Object.fromEntries(fields.map(key => [key, String(payload.caso?.[key] || '')]));
  const cajas = payload.cajas || [{ piezas: payload.piezas || [] }];
  return JSON.stringify(['piezas', caso, cajas.map(c => (c.piezas || []).map(p => [p.nombre, String(p.cantidad || 1)])), payload.qrUrl || '']);
}
export async function imprimirEtiquetas(payload) {
  const { generarZplEtiquetas } = await import('./piezasLabelZpl.js');
  return client.print({ zpl: generarZplEtiquetas(payload), identity: await identidadUsuario(identidadPiezas(payload)), title: 'Etiquetas de piezas' });
}
export async function imprimirVehiculo(payload) {
  const { generarZplVehiculo } = await import('./vehiculoLabelZpl.js');
  return client.print({ zpl: generarZplVehiculo(payload), identity: await identidadUsuario(['vehiculo', payload]), title: 'Etiqueta de vehículo' });
}
