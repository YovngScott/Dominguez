// Alertas de casos estancados: cuántos días lleva un caso en su estado actual
// y si eso ya es "mucho" (semáforo amarillo/rojo).

// Umbrales en DÍAS por estado. Ajustables: amarillo = empieza a tardar,
// rojo = lleva demasiado y necesita atención.
export const UMBRALES_DIAS = {
  en_espera_piezas: { amarillo: 8, rojo: 20 },
  vehiculo_en_taller: { amarillo: 5, rojo: 12 },
  listo_para_trabajar: { amarillo: 4, rojo: 10 },
};

export function diasDesde(fecha) {
  if (!fecha) return 0;
  const ms = Date.now() - new Date(fecha).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

// "ok" | "amarillo" | "rojo"
export function nivelAlerta(estado, dias) {
  const u = UMBRALES_DIAS[estado];
  if (!u) return "ok";
  if (dias >= u.rojo) return "rojo";
  if (dias >= u.amarillo) return "amarillo";
  return "ok";
}

export const COLOR_NIVEL = {
  amarillo: { bg: "#fef3c7", text: "#b45309", dot: "#d97706" },
  rojo: { bg: "#fee2e2", text: "#b91c1c", dot: "#dc2626" },
};
