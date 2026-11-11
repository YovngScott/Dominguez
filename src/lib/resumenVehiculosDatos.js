import { supabase } from "./supabaseClient";

let guardado = null;
let enCurso = null;

export function esEspera(caso) {
  return !["listo_para_trabajar", "vehiculo_en_taller", "entregado", "completado"].includes(caso.estado);
}

export function filtrarVehiculos(casos, aseguradora, tipo) {
  return casos.filter(c => (aseguradora === "todas" || c.aseguradora_id === aseguradora)
    && (tipo === "todos" ? true : tipo === "listos" ? c.estado === "listo_para_trabajar"
      : tipo === "espera" ? esEspera(c) : (esEspera(c) || (tipo === "suplir_piezas" && c.estado === "vehiculo_en_taller")) && c.etiqueta_organizacion === tipo));
}

async function consultar() {
  const casos = [];
  for (let inicio = 0; ; inicio += 500) {
    const { data, error } = await supabase.from("casos")
      .select("id,estado,etiqueta_organizacion,aseguradora_id,anio,color,placa,chasis,numero_poliza,numero_reclamo,aseguradora:aseguradoras(nombre),cliente:clientes(nombre_completo),marca:marcas(nombre),modelo:modelos(nombre)")
      .is("archivado_en", null).or("estado.is.null,estado.not.in.(vehiculo_en_taller,entregado,completado),and(estado.eq.vehiculo_en_taller,etiqueta_organizacion.eq.suplir_piezas)")
      .order("id").range(inicio, inicio + 499);
    if (error) throw error;
    casos.push(...data);
    if (data.length < 500) break;
  }
  const citas = {};
  const ids = casos.filter(c => c.estado === "listo_para_trabajar").map(c => c.id);
  for (let i = 0; i < ids.length; i += 100) {
    for (let inicio = 0; ; inicio += 500) {
      const { data, error } = await supabase.from("citas").select("caso_id,fecha,hora")
        .in("caso_id", ids.slice(i, i + 100)).in("estado", ["pendiente", "confirmada"])
        .order("fecha").order("hora").order("id").range(inicio, inicio + 499);
      if (error) throw error;
      for (const cita of data) if (!citas[cita.caso_id]) citas[cita.caso_id] = cita;
      if (data.length < 500) break;
    }
  }
  return { casos, citas, actualizado: Date.now() };
}

export async function cargarResumenVehiculos(forzar = false) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Inicia sesión para consultar el resumen.");
  const usuario = session.user.id;
  if (!forzar && guardado?.usuario === usuario && Date.now() - guardado.datos.actualizado < 60000) return guardado.datos;
  if (enCurso?.usuario === usuario) return enCurso.promise;
  const promise = consultar().then(datos => {
    guardado = { usuario, datos };
    return datos;
  }).finally(() => { if (enCurso?.promise === promise) enCurso = null; });
  enCurso = { usuario, promise };
  return promise;
}
supabase.auth.onAuthStateChange(event => {
  if (event === "SIGNED_OUT") { guardado = null; enCurso = null; }
});

