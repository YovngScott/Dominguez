import { supabase } from "./supabaseClient";
import { uuid } from "./uuid";

// Helpers compartidos por la tablet (kiosk) y el panel de almacén.

export const ESTADOS_PEDIDO = {
  pendiente: { label: "Pendiente", chip: "bg-amber-100 text-amber-700" },
  entregado: { label: "Entregado", chip: "bg-emerald-100 text-emerald-700" },
  cancelado: { label: "Cancelado", chip: "bg-slate-200 text-slate-600" },
};

// Tipos de movimiento del kardex. "signo" es solo para mostrar (+ / −).
export const TIPOS_MOVIMIENTO = {
  entrada: { label: "Entrada", signo: "+", chip: "bg-emerald-100 text-emerald-700", icon: "download" },
  salida: { label: "Salida", signo: "−", chip: "bg-sky-100 text-sky-700", icon: "truck" },
  devolucion: { label: "Devolución", signo: "+", chip: "bg-violet-100 text-violet-700", icon: "package" },
  ajuste: { label: "Ajuste", signo: "±", chip: "bg-amber-100 text-amber-700", icon: "clipboard" },
};

// Dinero en pesos dominicanos.
export const rd = (v) =>
  `RD$ ${num(v).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Los numeric de Postgres pueden llegar como texto: siempre a número.
export const num = (v) => Number(v ?? 0) || 0;

// Muestra 12 en vez de 12.00, pero conserva 2.5 si lo tiene.
export function cantidadTexto(v) {
  const n = num(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "");
}

export function fechaHora(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-DO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function listarSuministros({ soloActivos = true } = {}) {
  let q = supabase.from("suministros").select("*").order("nombre");
  if (soloActivos) q = q.eq("activo", true);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// Crea la requisición desde la tablet con TODOS los artículos del carrito.
// Comparten un mismo grupo_id, así el almacén los ve como un solo pedido.
// Queda en estado "pendiente" y NO toca el stock: el descuento ocurre solo
// cuando el almacén lo despacha.
export async function crearPedido({ items, solicitante, nota, casoId }) {
  if (!items?.length) throw new Error("El pedido está vacío.");
  // uuid() y no crypto.randomUUID(): la tablet puede entrar por IP de red
  // local (http://10.x.x.x), donde randomUUID no existe.
  const grupoId = uuid();
  const filas = items.map((it) => ({
    grupo_id: grupoId,
    suministro_id: it.suministro.id,
    suministro_nombre: it.suministro.nombre,
    cantidad: it.cantidad,
    solicitante: solicitante?.trim() || null,
    nota: nota?.trim() || null,
    caso_id: casoId || null,
  }));
  const { error } = await supabase.from("suministros_pedidos").insert(filas);
  if (error) throw error;
}

// Vehículos en proceso que la tablet puede elegir al pedir material. La vista
// casos_kiosk solo expone la identificación del vehículo (nunca cliente ni
// montos), ver sql/42_suministros_movimientos.sql.
export async function listarCasosKiosk() {
  const { data, error } = await supabase
    .from("casos_kiosk")
    .select("id, placa, numero_reclamo, marca, modelo, anio")
    .order("marca");
  if (error) throw error;
  return data || [];
}

// Despacha el pedido: cambia el estado a "entregado" y descuenta el stock en
// una sola operación atómica del lado del servidor (ver la función
// despachar_pedido_suministro en sql/40_suministros.sql). Devuelve el stock
// que quedó del producto.
export async function despacharPedido(pedidoId) {
  const { data, error } = await supabase.rpc("despachar_pedido_suministro", {
    p_pedido_id: pedidoId,
  });
  if (error) throw new Error(error.message || "No se pudo despachar el pedido.");
  return num(data);
}

// Despacha un pedido COMPLETO (todos sus artículos). Todo o nada: si a un
// artículo le falta stock no se descuenta ninguno. Devuelve cuántos salieron.
export async function despacharGrupo(grupoId) {
  const { data, error } = await supabase.rpc("despachar_grupo_suministros", {
    p_grupo_id: grupoId,
  });
  if (error) throw new Error(error.message || "No se pudo despachar el pedido.");
  return Number(data) || 0;
}

export async function cancelarPedido(pedidoId) {
  const { error } = await supabase
    .from("suministros_pedidos")
    .update({ estado: "cancelado" })
    .eq("id", pedidoId)
    .eq("estado", "pendiente"); // nunca cancela algo ya entregado
  if (error) throw error;
}

// Cancela todos los renglones pendientes de un pedido.
export async function cancelarGrupo(grupoId) {
  const { error } = await supabase
    .from("suministros_pedidos")
    .update({ estado: "cancelado" })
    .eq("grupo_id", grupoId)
    .eq("estado", "pendiente");
  if (error) throw error;
}

// ── Kardex / movimientos ────────────────────────────────────────────────

// Registra un movimiento de inventario de forma atómica (el servidor bloquea
// el producto, valida y actualiza el saldo). Devuelve el stock resultante.
//   tipo "entrada" | "devolucion" | "salida" → cantidad = cuánto mover
//   tipo "ajuste"                            → cantidad = lo que HAY contado
export async function registrarMovimiento({
  suministroId,
  tipo,
  cantidad,
  nota,
  suplidor,
  factura,
  costoUnitario,
  casoId,
  solicitante,
}) {
  const { data, error } = await supabase.rpc("registrar_movimiento_suministro", {
    p_suministro_id: suministroId,
    p_tipo: tipo,
    p_cantidad: cantidad,
    p_nota: nota?.trim() || null,
    p_suplidor: suplidor?.trim() || null,
    p_factura: factura?.trim() || null,
    p_costo_unitario: costoUnitario ?? null,
    p_caso_id: casoId || null,
    p_solicitante: solicitante?.trim() || null,
  });
  if (error) throw new Error(error.message || "No se pudo registrar el movimiento.");
  return num(data);
}

// Historial de movimientos. Se puede filtrar por producto, tipo y fechas.
export async function listarMovimientos({ suministroId, tipo, desde, hasta, limite = 300 } = {}) {
  let q = supabase
    .from("suministros_movimientos")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limite);
  if (suministroId) q = q.eq("suministro_id", suministroId);
  if (tipo) q = q.eq("tipo", tipo);
  if (desde) q = q.gte("created_at", desde);
  if (hasta) q = q.lt("created_at", hasta);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// Consumo por período (agrupado por insumo, con costo estimado).
export async function reporteConsumo({ desde, hasta }) {
  const { data, error } = await supabase.rpc("reporte_consumo_suministros", {
    p_desde: desde,
    p_hasta: hasta,
  });
  if (error) throw new Error(error.message || "No se pudo generar el reporte.");
  return data || [];
}

// Insumos por debajo de su mínimo (o agotados), para las alertas.
export function insumosBajoMinimo(suministros) {
  return suministros
    .filter((s) => s.activo && num(s.stock) <= num(s.stock_minimo))
    .sort((a, b) => num(a.stock) - num(b.stock));
}
