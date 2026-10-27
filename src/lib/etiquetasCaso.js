export const ETIQUETAS_CASO = [
  {
    id: "suplir_piezas",
    label: "Suplir piezas",
    description: "Hay que conseguir o solicitar piezas",
    icon: "truck",
    chip: "border-violet-200 bg-violet-50 text-violet-700",
    dot: "bg-violet-500",
    hover: "hover:border-violet-200 hover:bg-violet-50/70",
  },
  {
    id: "espera_piezas",
    label: "Espera de piezas",
    description: "Las piezas ya fueron solicitadas",
    icon: "package",
    chip: "border-amber-200 bg-amber-50 text-amber-700",
    dot: "bg-amber-500",
    hover: "hover:border-amber-200 hover:bg-amber-50/70",
  },
  {
    id: "espera_orden",
    label: "Espera de orden",
    description: "Pendiente de la orden del seguro",
    icon: "clipboard",
    chip: "border-sky-200 bg-sky-50 text-sky-700",
    dot: "bg-sky-500",
    hover: "hover:border-sky-200 hover:bg-sky-50/70",
  },
];

const ESTADOS_SIN_ETIQUETA = new Set([
  "listo_para_trabajar",
  "vehiculo_en_taller",
  "entregado",
  "completado",
]);

export function casoAdmiteEtiqueta(estado) {
  return !ESTADOS_SIN_ETIQUETA.has(estado);
}

export function etiquetaDeCaso(caso) {
  if (!caso || !casoAdmiteEtiqueta(caso.estado)) return null;
  return ETIQUETAS_CASO.find((etiqueta) => etiqueta.id === caso.etiqueta_organizacion) || null;
}
