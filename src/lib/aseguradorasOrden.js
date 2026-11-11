const prioridades = [/sura/i, /colonial/i, /reservas/i, /coop/i, /atl[aá]ntica/i, /internacional/i];

export function compararAseguradoras(a, b) {
  const posicion = nombre => {
    const index = prioridades.findIndex(p => p.test(nombre || ""));
    return index < 0 ? prioridades.length : index;
  };
  return posicion(a.nombre) - posicion(b.nombre)
    || (Number(a.orden ?? 9999) - Number(b.orden ?? 9999))
    || String(a.nombre || "").localeCompare(String(b.nombre || ""), "es");
}

export function ordenarAseguradoras(lista) {
  return [...lista].sort(compararAseguradoras);
}
