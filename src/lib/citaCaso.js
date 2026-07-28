import { supabase } from "./supabaseClient";

// Relación entre las citas y el caso (vehículo) al que pertenecen.
//
// La cita se enlaza al vehículo desde el formulario: se elige el cliente y
// aparecen sus vehículos en proceso. Cuando el vehículo llega al taller, su
// cita se marca como atendida sola.

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
