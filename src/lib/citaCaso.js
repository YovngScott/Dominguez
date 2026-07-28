import { supabase } from "./supabaseClient";
import { getAseguradoraGeneralId } from "./catalogo";

// Vincula cada cita con el caso (vehículo) del cliente.
//
// Flujo del taller: se agenda la cita → el vehículo queda "listo para
// trabajar" (esperando que lo traigan) → cuando llega, pasa a "vehículo en el
// taller" y la cita se marca como atendida sola.

// Busca el caso activo del cliente por NOMBRE; si no existe ninguno, crea el
// cliente y el caso. Devuelve el caso_id (o null si no se pudo).
export async function vincularCasoDeCita({ nombre, telefono, clienteId, casoId }) {
  if (casoId) return casoId; // ya se eligió uno a mano

  const nombreLimpio = (nombre || "").trim();
  if (!nombreLimpio) return null;

  // 1. Clientes que coinciden por nombre (o el que ya venía seleccionado).
  let clienteIds = clienteId ? [clienteId] : [];
  if (!clienteIds.length) {
    const { data: clientes } = await supabase
      .from("clientes")
      .select("id")
      .ilike("nombre_completo", nombreLimpio)
      .limit(5);
    clienteIds = (clientes || []).map((c) => c.id);
  }

  // 2. ¿Tiene ya un caso sin entregar? Se reusa el más reciente.
  if (clienteIds.length) {
    const { data: casos } = await supabase
      .from("casos")
      .select("id")
      .in("cliente_id", clienteIds)
      .neq("estado", "entregado")
      .order("created_at", { ascending: false })
      .limit(1);
    if (casos?.[0]) return casos[0].id;
  }

  // 3. No hay caso: se crea uno nuevo, ya "listo para trabajar" (se agendó
  //    para que traigan el vehículo).
  try {
    let cid = clienteIds[0];
    if (!cid) {
      const { data: nuevoCliente, error: eCliente } = await supabase
        .from("clientes")
        .insert({ nombre_completo: nombreLimpio, telefono: telefono?.trim() || null })
        .select("id")
        .single();
      if (eCliente) throw eCliente;
      cid = nuevoCliente.id;
    }

    const aseguradoraId = await getAseguradoraGeneralId();
    if (!aseguradoraId) return null; // sin aseguradora "General" no se puede crear

    const { data: userData } = await supabase.auth.getUser();
    const { data: nuevoCaso, error: eCaso } = await supabase
      .from("casos")
      .insert({
        cliente_id: cid,
        aseguradora_id: aseguradoraId,
        estado: "listo_para_trabajar",
        created_by: userData?.user?.id,
      })
      .select("id")
      .single();
    if (eCaso) throw eCaso;
    return nuevoCaso.id;
  } catch {
    return null; // si falla, la cita igual se guarda (solo queda sin caso)
  }
}

// Al recibir el vehículo, sus citas pendientes/confirmadas pasan a "atendida".
export async function marcarCitasAtendidas(casoId) {
  if (!casoId) return 0;
  const { data } = await supabase
    .from("citas")
    .update({ estado: "atendida" })
    .eq("caso_id", casoId)
    .in("estado", ["pendiente", "confirmada"])
    .select("id");
  return data?.length || 0;
}

// Citas aún sin atender de una lista de casos → { casoId: cita } para poder
// mostrar "tiene cita el ..." en la lista de vehículos.
export async function citasPendientesDeCasos(casoIds) {
  if (!casoIds?.length) return {};
  const { data } = await supabase
    .from("citas")
    .select("id, caso_id, fecha, hora, estado, nombre")
    .in("caso_id", casoIds)
    .in("estado", ["pendiente", "confirmada"])
    .order("fecha", { ascending: true });
  const mapa = {};
  (data || []).forEach((c) => {
    if (c.caso_id && !mapa[c.caso_id]) mapa[c.caso_id] = c;
  });
  return mapa;
}
