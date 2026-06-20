// Estados del flujo de trabajo del taller.
// Las dos categorías principales que se ven al entrar a una aseguradora.
export const ESTADOS = {
  en_espera_piezas: {
    label: "En espera de piezas",
    short: "En espera",
    icon: "package",
    // clases para tarjetas / chips
    chip: "bg-amber-100 text-amber-700",
    card: "from-amber-50 to-white border-amber-200",
    accent: "#d97706",
  },
  listo_para_trabajar: {
    label: "Listos para trabajar",
    short: "Listos",
    icon: "wrench",
    chip: "bg-emerald-100 text-emerald-700",
    card: "from-emerald-50 to-white border-emerald-200",
    accent: "#059669",
  },
  vehiculo_en_taller: {
    label: "Vehículos en el taller",
    short: "En el taller",
    icon: "car",
    chip: "bg-sky-100 text-sky-700",
    card: "from-sky-50 to-white border-sky-200",
    accent: "#0284c7",
  },
  entregado: {
    label: "Entregados",
    short: "Entregados",
    icon: "check",
    chip: "bg-slate-200 text-slate-600",
    card: "from-slate-50 to-white border-slate-200",
    accent: "#475569",
  },
};

export const ESTADO_DEFAULT = "en_espera_piezas";

// Orden de los estados al crear/editar un caso (categorías de entrada)
export const ESTADOS_PRINCIPALES = ["en_espera_piezas", "listo_para_trabajar"];

// Categorías que se muestran como tarjetas en el listado de una aseguradora
export const ESTADOS_LISTA = ["en_espera_piezas", "listo_para_trabajar", "vehiculo_en_taller"];
