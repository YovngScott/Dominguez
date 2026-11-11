import { getDocumentProxy, getResolvedPDFJS } from "unpdf";

export function normalizeChassis(value) {
  return String(value || "").toUpperCase().replace(/[\s-]/g, "");
}

export function validChassis(value) {
  return /^[A-Z0-9]{8,20}$/.test(value) && /[0-9]/.test(value);
}

export function identifiers(text) {
  const found = new Set();
  const upper = String(text || "").toUpperCase();
  // Accept identifiers exactly as printed, including shorter local records.
  for (const match of upper.matchAll(/\b(?:CHAS+IS|CHASSIS|VIN|BASTIDOR)\s*(?:(?:NO|N[º°]|NÚMERO)\.?)?[\s:#.-]*([A-Z0-9]+(?:-[A-Z0-9]+)*)/g)) {
    const id = normalizeChassis(match[1]);
    if (validChassis(id)) found.add(id);
  }
  for (const match of upper.matchAll(/\b[A-Z0-9]{14,20}\b/g)) {
    if (validChassis(match[0]) && /[A-Z]/.test(match[0])) found.add(match[0]);
  }
  // Groups split by PDF text positioning, e.g. 5XY PGA3X HG270421.
  for (const match of upper.matchAll(/\b[A-Z0-9]*\d[A-Z0-9]*(?:[ -]+[A-Z0-9]*\d[A-Z0-9]*){1,5}\b/g)) {
    const id = normalizeChassis(match[0]);
    if (id.length >= 14 && validChassis(id) && /[A-Z]/.test(id)) found.add(id);
  }
  return [...found];
}

export function orderText(value) {
  return /\b(?:[oó]rden(?:es)?\s+(?:(?:de|del)\s+)?(?:compras?|trabajo|piezas?|repuestos?|servicio|reparaci[oó]n|mano\s+de\s+obra)|autorizaci[oó]n\s+(?:de\s+)?(?:reparaci[oó]n|pago|trabajos?|piezas?)|purchase\s+order|work\s+order)\b/i.test(String(value).replace(/[_-]+/g, " "));
}

export function findings(text, source, page) {
  return identifiers(text).map(chasis => ({ chasis, fuente: source, ...(page ? { pagina: page } : {}) }));
}

export async function readPdf(bytes, readScan) {
  const pdf = await getDocumentProxy(new Uint8Array(bytes), { isEvalSupported: false, maxImageSize: 16_777_216 });
  try {
    if (pdf.numPages > 250) throw new Error("PDF de más de 250 páginas. Requiere revisión manual.");
    const { OPS } = await getResolvedPDFJS();
    const evidence = [];
    const scans = [];
    let order = false;
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const text = content.items.map(item => (item.str || "") + (item.hasEOL ? "\n" : " ")).join("");
      evidence.push(...findings(text, "PDF", number));
      order ||= orderText(text);
      const ops = await page.getOperatorList();
      const hasImage = ops.fnArray.some(op => op === OPS.paintImageXObject || op === OPS.paintInlineImageXObject);
      if (text.trim().length < 15 || hasImage) scans.push(number);
      page.cleanup();
    }
    let uncertain = false;
    if (scans.length) {
      const pages = await readScan(bytes, scans);
      for (const number of scans) {
        const page = pages.find(item => item.pagina === number);
        if (!page || page.legible !== true) uncertain = true;
        if (!page) continue;
        order ||= page.orden === true;
        for (const raw of page.chasis || []) {
          const chasis = normalizeChassis(raw);
          if (!validChassis(chasis)) { uncertain = true; continue; }
          if (page.legible) evidence.push({ chasis, fuente: "PDF escaneado", pagina: number });
        }
      }
    }
    return { evidence, order, uncertain };
  } finally {
    await pdf.loadingTask.destroy();
  }
}
