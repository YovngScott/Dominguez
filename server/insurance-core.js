// Funciones puras compartidas por la API y las pruebas; no crea otra Serverless Function.
const STOP_WORDS = new Set([
  "de", "del", "la", "el", "los", "las", "y", "o", "para", "con", "sin",
  "pieza", "servicio", "reparacion", "reparar", "reemplazo", "reemplazar",
]);

const SYNONYMS = new Map([
  ["bonete", "capo"], ["capot", "capo"], ["hood", "capo"],
  ["bumper", "parachoque"], ["paragolpe", "parachoque"], ["defensa", "parachoque"],
  ["delantera", "delantero"], ["delt", "delantero"], ["frontal", "delantero"],
  ["trasera", "trasero"], ["tras", "trasero"], ["posterior", "trasero"],
  ["derecha", "rh"], ["derecho", "rh"], ["der", "rh"],
  ["izquierda", "lh"], ["izquierdo", "lh"], ["izq", "lh"],
  ["desab", "desabollar"], ["desabolladura", "desabollar"],
  ["pint", "pintar"], ["pintura", "pintar"],
  ["cambiar", "reemplazar"], ["cambio", "reemplazar"],
  ["desmontaje", "desmontar"], ["montaje", "montar"],
  ["guardafango", "guardalodo"], ["fender", "guardalodo"],
  ["foco", "lampara"], ["farol", "lampara"],
  ["mano", "labor"], ["obra", "labor"],
]);

export function normalizeIdentifier(value) {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function extractIdentifiers(text) {
  const source = String(text ?? "").toUpperCase();
  const chassisCandidates = source.match(/\b[A-HJ-NPR-Z0-9]{17}\b/g) ?? [];
  const plateMatch = source.match(/(?:PLACA|MATR[IÍ]CULA|REGISTRO)\s*[:#-]?\s*([A-Z]{1,2}\d{5,7}|\d{5,7}[A-Z]{1,2})\b/i);
  return {
    chassis: chassisCandidates[0] ? normalizeIdentifier(chassisCandidates[0]) : null,
    plate: plateMatch?.[1] ? normalizeIdentifier(plateMatch[1]) : null,
  };
}

export function normalizeDescription(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b\d{2,6}[-:]\s*/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((token) => SYNONYMS.get(token) ?? token)
    .filter((token) => token && !STOP_WORDS.has(token))
    .join(" ");
}

export function normalizeSupplier(value) {
  return String(value ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function isDominguezSupplier(value, aliases = []) {
  const normalized = normalizeSupplier(value);
  if (!normalized) return false;
  const configured = ["dominguez auto pintura", "dominguez auto pintura srl", ...aliases]
    .map(normalizeSupplier).filter(Boolean);
  return configured.some((alias) => normalized === alias || normalized.includes(alias));
}

function tokens(value) {
  return new Set(normalizeDescription(value).split(" ").filter(Boolean));
}

export function descriptionSimilarity(left, right) {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  const union = new Set([...a, ...b]).size;
  const jaccard = intersection / union;
  const containment = intersection / Math.min(a.size, b.size);
  return Math.max(jaccard, containment * 0.92);
}

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeLocalQuote(quote) {
  const parts = Array.isArray(quote?.items_piezas) ? quote.items_piezas : [];
  const labor = Array.isArray(quote?.items_mano_obra) ? quote.items_mano_obra : [];
  return [
    ...parts.map((item, index) => ({
      id: `pieza-${index}`,
      type: "pieza",
      description: item.nombre || item.descripcion || "Pieza",
      quantity: asNumber(item.cantidad, 1) || 1,
      unitPrice: asNumber(item.precio),
      subtotal: asNumber(item.precio) * (asNumber(item.cantidad, 1) || 1),
      raw: item,
      supplier: item.proveedor || item.suplidor || item.supplier || "",
    })),
    ...labor.map((item, index) => ({
      id: `mano-${index}`,
      type: "mano_obra",
      description: [item.nombre, item.pieza].filter(Boolean).join(" ") || "Mano de obra",
      quantity: asNumber(item.cantidad, 1) || 1,
      unitPrice: asNumber(item.precio),
      subtotal: asNumber(item.precio) * (asNumber(item.cantidad, 1) || 1),
      raw: item,
      supplier: item.proveedor || item.suplidor || item.supplier || "",
    })),
  ];
}

export function normalizeInsurerLines(lines) {
  return (Array.isArray(lines) ? lines : []).map((item, index) => {
    const quantity = asNumber(item.quantity ?? item.cantidad, 1);
    const unitPrice = asNumber(item.unit_price ?? item.precio_unitario ?? item.precio);
    const discount = asNumber(item.discount ?? item.descuento);
    const explicitSubtotal = asNumber(item.effective_subtotal ?? item.subtotal_efectivo ?? item.monto);
    return {
      id: `seguro-${index}`,
      type: item.type === "mano_obra" || item.tipo === "mano_obra" ? "mano_obra" : "pieza",
      description: item.description || item.descripcion || "Línea sin descripción",
      quantity,
      unitPrice,
      discount,
      subtotal: explicitSubtotal || Math.max(0, unitPrice * quantity - discount),
      tax: asNumber(item.tax ?? item.itbis),
      total: asNumber(item.total),
      supplier: item.supplier || item.proveedor || item.suplidor || item.vendor || "",
      section: item.section || item.seccion || item.document_section || "",
      raw: item,
    };
  });
}

function moneyDifferent(a, b, tolerance) {
  return Math.abs(asNumber(a) - asNumber(b)) > tolerance;
}

/** Comparación uno-a-uno. Una línea local o del seguro nunca se reutiliza. */
export function compareQuoteLines(localQuote, insurerLines, options = {}) {
  const threshold = asNumber(options.similarityThreshold, 0.58);
  const moneyTolerance = asNumber(options.moneyTolerance, 1);
  const quantityTolerance = asNumber(options.quantityTolerance, 0.001);
  const localAll = normalizeLocalQuote(localQuote);
  const insurerAll = normalizeInsurerLines(insurerLines);
  const sections = options.sectionsPresent || {};
  // Un PDF que solo trae piezas no autoriza a declarar la mano de obra eliminada.
  const includeType = (type) => sections[type] !== false;
  const local = localAll.filter((line) => includeType(line.type));
  const insurer = insurerAll.filter((line) => includeType(line.type));
  const candidates = [];

  for (let li = 0; li < local.length; li += 1) {
    for (let ii = 0; ii < insurer.length; ii += 1) {
      if (local[li].type !== insurer[ii].type) continue;
      const score = descriptionSimilarity(local[li].description, insurer[ii].description);
      if (score >= threshold) candidates.push({ li, ii, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const usedLocal = new Set();
  const usedInsurer = new Set();
  const matches = [];
  for (const candidate of candidates) {
    if (usedLocal.has(candidate.li) || usedInsurer.has(candidate.ii)) continue;
    usedLocal.add(candidate.li);
    usedInsurer.add(candidate.ii);
    const ours = local[candidate.li];
    const theirs = insurer[candidate.ii];
    const differences = [];
    if (moneyDifferent(ours.subtotal, theirs.subtotal, moneyTolerance)) differences.push("precio");
    if (Math.abs(ours.quantity - theirs.quantity) > quantityTolerance) differences.push("cantidad");
    matches.push({ ours, theirs, score: candidate.score, differences });
  }

  const removed = local.filter((_, index) => !usedLocal.has(index));
  const added = insurer.filter((_, index) => !usedInsurer.has(index));
  const changed = matches.filter((match) => match.differences.length > 0);
  return {
    matches,
    changed,
    removed,
    added,
    hasDifferences: Boolean(changed.length || removed.length || added.length),
    omittedTypes: Object.keys(sections).filter((type) => sections[type] === false),
    summary: {
      localLines: local.length,
      localLinesTotal: localAll.length,
      insurerLines: insurer.length,
      insurerLinesTotal: insurerAll.length,
      matched: matches.length,
      changed: changed.length,
      removed: removed.length,
      added: added.length,
    },
  };
}

/** Un correo con varios PDF se aprueba o se bloquea como un único paquete. */
export function assessPdfPackage(expectedCount, documents, comparison, threshold = 0.8) {
  const list = Array.isArray(documents) ? documents : [];
  const incomplete = list.length !== Number(expectedCount || 0);
  const uncertain = list.some((document) => !document?.legible || Number(document?.confidence || 0) < threshold);
  const hasDifferences = Boolean(comparison?.hasDifferences);
  return {
    blocked: incomplete || uncertain || hasDifferences,
    incomplete,
    uncertain,
    hasDifferences,
  };
}

export function formatReviewAlert(review) {
  const title = review.orderClosed
    ? "🔒 Orden cerrada de Dominguez Auto Pintura"
    : review.caseMatched
    ? review.comparison?.hasDifferences ? "⚠️ Cotización con diferencias" : "✅ Cotización sin diferencias"
    : "🚨 Correo de seguro sin caso vinculado";
  const lines = [title, "", `Remitente: ${review.sender || "No identificado"}`, `Asunto: ${review.subject || "(sin asunto)"}`];
  if (review.caseMatched) {
    lines.push(`Caso: ${review.caseLabel || review.caseId}`, `Placa: ${review.plate || "—"}`, `Chasis: ${review.chassis || "—"}`);
  } else {
    lines.push(`Placa detectada: ${review.plate || "—"}`, `Chasis detectado: ${review.chassis || "—"}`);
  }
  if (review.comparison) {
    const s = review.comparison.summary;
    lines.push("", `Líneas: ${s.matched} vinculadas · ${s.changed} cambiadas · ${s.removed} eliminadas · ${s.added} agregadas`);
    for (const item of review.comparison.changed.slice(0, 8)) {
      lines.push(`• ${item.ours.description}: taller RD$${item.ours.subtotal.toLocaleString()} → seguro RD$${item.theirs.subtotal.toLocaleString()}`);
    }
    for (const item of review.comparison.removed.slice(0, 5)) lines.push(`• Eliminada: ${item.description}`);
    for (const item of review.comparison.added.slice(0, 5)) lines.push(`• Agregada: ${item.description}`);
  }
  lines.push("", "Nada fue guardado en el caso. Revísalo y apruébalo desde Automatización de seguros.");
  return lines.join("\n");
}
