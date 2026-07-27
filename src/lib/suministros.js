import { supabase } from "./supabaseClient";

// Helpers compartidos por la tablet (kiosk) y el panel de almacén.

export const ESTADOS_PEDIDO = {
  pendiente: { label: "Pendiente", chip: "bg-amber-100 text-amber-700" },
  entregado: { label: "Entregado", chip: "bg-emerald-100 text-emerald-700" },
  cancelado: { label: "Cancelado", chip: "bg-slate-200 text-slate-600" },
};

// Los numeric de Postgres pueden llegar como texto: siempre a número.
export const num = (v) => Number(v ?? 0) || 0;

// Muestra 12 en vez de 12.00, pero conserva 2.5 si lo tiene.
export function cantidadTexto(v) {
  const n = num(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "");
}

export async function listarSuministros({ soloActivos = true } = {}) {
  let q = supabase.from("suministros").select("*").order("nombre");
  if (soloActivos) q = q.eq("activo", true);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// Crea la requisición desde la tablet. Queda en estado "pendiente" y NO toca
// el stock: el descuento ocurre solo cuando el almacén la despacha.
export async function crearPedido({ suministro, cantidad, solicitante, nota }) {
  const { error } = await supabase.from("suministros_pedidos").insert({
    suministro_id: suministro.id,
    suministro_nombre: suministro.nombre,
    cantidad,
    solicitante: solicitante?.trim() || null,
    nota: nota?.trim() || null,
  });
  if (error) throw error;
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

export async function cancelarPedido(pedidoId) {
  const { error } = await supabase
    .from("suministros_pedidos")
    .update({ estado: "cancelado" })
    .eq("id", pedidoId)
    .eq("estado", "pendiente"); // nunca cancela algo ya entregado
  if (error) throw error;
}
