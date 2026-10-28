export const TIPOS_DOCUMENTO = [
  {
    nombre: "Cotización del taller",
    label: "COTIZACIÓN DEL TALLER",
    description: "Presupuesto preparado por el taller",
    icon: "receipt",
    orden: 1,
  },
  {
    nombre: "AJUSTE TÉCNICO",
    label: "AJUSTE TÉCNICO",
    description: "Corrección o ajuste técnico autorizado",
    icon: "compare",
    orden: 2,
  },
  {
    nombre: "ORDEN DE PIEZAS DAP",
    label: "ORDEN DE PIEZAS DAP",
    description: "Orden de piezas emitida por DAP",
    icon: "package",
    orden: 3,
  },
  {
    nombre: "ORDEN DE PIEZAS SUPLIDOR",
    label: "ORDEN DE PIEZAS SUPLIDOR",
    description: "Orden o confirmación del suplidor",
    icon: "truck",
    orden: 4,
  },
  {
    nombre: "ORDEN DE MANO DE OBRA DAP",
    label: "ORDEN DE MANO DE OBRA DAP",
    description: "Autorización de mano de obra de DAP",
    icon: "wrench",
    orden: 5,
  },
  {
    nombre: "CONDUCE",
    label: "CONDUCE",
    description: "Documento de entrega o traslado",
    icon: "clipboard",
    orden: 6,
  },
];

function clave(nombre) {
  return String(nombre || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

export function tiposDocumentoParaUpsert() {
  return TIPOS_DOCUMENTO.map(({ nombre, orden }) => ({ nombre, orden }));
}

export function tiposDocumentoRequierenSincronizacion(tipos = []) {
  const actuales = new Map((tipos || []).map((tipo) => [clave(tipo.nombre), tipo.orden]));
  return TIPOS_DOCUMENTO.some((tipo) => actuales.get(clave(tipo.nombre)) !== tipo.orden);
}

export function prepararTiposDocumento(tipos = []) {
  const porNombre = new Map((tipos || []).map((tipo) => [clave(tipo.nombre), tipo]));
  return TIPOS_DOCUMENTO.map((definicion) => {
    const tipo = porNombre.get(clave(definicion.nombre));
    return tipo ? { ...tipo, ...definicion, id: tipo.id } : null;
  }).filter(Boolean);
}

export function nombreTipoDocumento(nombre) {
  const definicion = TIPOS_DOCUMENTO.find((tipo) => clave(tipo.nombre) === clave(nombre));
  return definicion?.label || String(nombre || "TIPO NO DISPONIBLE").toLocaleUpperCase("es-DO");
}
