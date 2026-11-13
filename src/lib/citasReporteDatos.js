export async function listarCitasParaReporte(client, { desde = "", hasta = "" } = {}) {
  if ((desde && !/^\d{4}-\d{2}-\d{2}$/.test(desde)) || (hasta && !/^\d{4}-\d{2}-\d{2}$/.test(hasta))
    || (desde && hasta && desde > hasta)) {
    throw new Error("Revisa el intervalo de fechas.");
  }
  const citas = [];
  for (let inicio = 0; ; inicio += 500) {
    let consulta = client.from("citas").select(
      "id,nombre,telefono,fecha,hora,estado,motivo,cliente:clientes(nombre_completo),caso:casos(placa,chasis,anio,archivado_en,numero_poliza,numero_reclamo,marca:marcas(nombre),modelo:modelos(nombre),aseguradora:aseguradoras(nombre))"
    ).in("estado", ["pendiente", "confirmada"]);
    if (desde) consulta = consulta.gte("fecha", desde);
    if (hasta) consulta = consulta.lte("fecha", hasta);
    const { data, error } = await consulta.order("fecha").order("hora").order("id").range(inicio, inicio + 499);
    if (error) throw error;
    citas.push(...(data || []).filter(c => !c.caso?.archivado_en));
    if (!data || data.length < 500) break;
  }
  return citas;
}
